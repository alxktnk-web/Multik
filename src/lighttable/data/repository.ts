import { assertComposition, ConflictError, pairId, validateRoll, type Favorite, type Asset, type ImportJob, type Project, type Roll } from './types';
import { copyComposition, type Composition } from '../model/types';
const stores=['assets','rolls','jobs','projects','compositions','prefs'] as const;
type Store=typeof stores[number];
const request=<T>(req:IDBRequest<T>)=>new Promise<T>((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
export class Repository {
  private opened?:Promise<IDBDatabase>;
  readonly counters={compositionCommits:0,assetsWritten:0};
  private db():Promise<IDBDatabase>{
    if(!this.opened)this.opened=new Promise<IDBDatabase>((resolve,reject)=>{
      const req=indexedDB.open('multik-lighttable',1);
      req.onupgradeneeded=()=>{for(const store of stores)if(!req.result.objectStoreNames.contains(store))req.result.createObjectStore(store,{keyPath:'id'});};
      req.onerror=()=>reject(req.error);req.onblocked=()=>reject(Error('Close the other Multik tab and try again'));
      req.onsuccess=()=>{const db=req.result;db.onversionchange=()=>{db.close();this.opened=undefined;};resolve(db);};
    }).catch(e=>{this.opened=undefined;throw e;});
    return this.opened;
  }
  private async read<T>(store:Store,id:string):Promise<T|undefined>{return request((await this.db()).transaction(store).objectStore(store).get(id));}
  private async all<T>(store:Store):Promise<T[]>{return request((await this.db()).transaction(store).objectStore(store).getAll());}
  private async write(names:Store[],fn:(tx:IDBTransaction,fail:(error:Error)=>void)=>void){
    const db=await this.db();
    return new Promise<void>((resolve,reject)=>{
      const tx=db.transaction(names,'readwrite');let error:Error|undefined;
      tx.oncomplete=()=>resolve();tx.onerror=()=>reject(error??tx.error??Error('Could not save'));
      tx.onabort=()=>reject(error??tx.error??Error('Storage is full. Your edits are still here. Free up space and try again.'));
      const fail=(e:Error)=>{error=e;tx.abort();};
      try{fn(tx,fail);}catch(e){fail(e instanceof Error?e:Error('Storage error'));}
    });
  }
  async listRolls(){return (await this.all<Roll>('rolls')).map(validateRoll).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));}
  async roll(id:string){const r=await this.read<Roll>('rolls',id);if(!r)throw Error('Roll unavailable');return validateRoll(r);}
  async renameRoll(id:string,name:string){
    const clean=name.trim();if(!clean||clean.length>80)throw Error('Enter a name between 1 and 80 characters');
    await this.write(['rolls'],(tx,fail)=>{
      const store=tx.objectStore('rolls'),req=store.get(id);
      req.onsuccess=()=>{try{const roll=validateRoll(req.result);store.put({...roll,name:clean});}catch(e){fail(e as Error);}};
    });
  }
  async asset(id:string){const a=await this.read<Asset>('assets',id);if(!a||a.id!==id||a.revision!==1||!(a.blob instanceof Blob)||!(a.preview instanceof Blob)||!(a.thumb instanceof Blob)||!Number.isFinite(a.width)||!Number.isFinite(a.height)||a.width<=0||a.height<=0)throw Error('Photo unavailable');return a;}
  async composition(id:string){const c=await this.read<Composition>('compositions',id);if(c)assertComposition(c);return c?copyComposition(c):c;}
  async ensureComposition(c:Composition){assertComposition(c);let result=c;
    await this.write(['compositions'],(tx,fail)=>{const store=tx.objectStore('compositions');const req=store.get(c.id);req.onsuccess=()=>{if(req.result){try{assertComposition(req.result);result=req.result;}catch(e){fail(e as Error);}}else store.add(c);};});return copyComposition(result);
  }
  async commit(snapshot:Composition,expectedRevision:number):Promise<Composition>{
    if(!Number.isInteger(expectedRevision)||expectedRevision<0)throw Error('Invalid revision');
    assertComposition(snapshot);const next=copyComposition(snapshot);next.revision=expectedRevision+1;
    await this.write(['compositions'],(tx,fail)=>{const store=tx.objectStore('compositions'),req=store.get(snapshot.id);req.onsuccess=()=>{
      const current=req.result as Composition|undefined;
      if(!current||current.revision!==expectedRevision){fail(new ConflictError());return;}
      store.put(next);
    };});this.counters.compositionCommits++;return next;
  }
  async fork(snapshot:Composition,project:Project):Promise<{composition:Composition;project:Project}>{
    // Conflict copies are ordinary Mixes, including copies made from Library.
    // Keeping kind=favorite without a new membership would hide the copy.
    const {kind: _kind,favoriteSourceId: _source,...base}=project;
    const p:Project={...base,id:crypto.randomUUID(),updatedAt:new Date().toISOString()};
    const c=copyComposition(snapshot);c.id=JSON.stringify(['pair',p.id,p.rollA,c.layers[0].placements[0].source.assetId,1,p.rollB,c.layers[1].placements[0].source.assetId,1]);c.revision=0;
    assertComposition(c);
    await this.write(['projects','compositions','prefs'],tx=>{tx.objectStore('projects').add(p);tx.objectStore('compositions').add(c);tx.objectStore('prefs').put({id:'last-project',value:p.id});});return {composition:c,project:p};
  }
  async beginImport(name:string,capacity:number,origin?:string):Promise<ImportJob>{
    if(!Number.isInteger(capacity)||capacity<1||capacity>1000)throw Error('Invalid roll length');
    const id=origin?`adopt:${origin}`:crypto.randomUUID(),existing=await this.read<ImportJob>('jobs',id);
    if(existing){if(existing.capacity!==capacity)throw Error('Source roll changed');return existing;}
    const job:ImportJob={id,rollId:origin?`legacy:${origin}`:crypto.randomUUID(),name,capacity,assetIds:Array.from({length:capacity},(_,i)=>`${id}:${i}`),origin};
    await this.write(['jobs'],tx=>{tx.objectStore('jobs').put(job);});return job;
  }
  async pendingAsset(id:string){return this.read<Asset>('assets',id);}
  async pendingImports(){return this.all<ImportJob>('jobs');}
  async stageAsset(job:ImportJob,index:number,asset:Asset){
    if(index<0||index>=job.capacity||asset.id!==job.assetIds[index]||asset.owner!==job.id)throw Error('Invalid import source');
    await this.write(['jobs','assets','rolls'],(tx,fail)=>{const check=tx.objectStore('jobs').get(job.id);check.onsuccess=()=>{if(!check.result){fail(Error('Import cancelled'));return;}const ready=tx.objectStore('rolls').get(job.rollId);ready.onsuccess=()=>{if(ready.result){fail(Error('Originals cannot be overwritten'));return;}tx.objectStore('assets').put(asset);};};});this.counters.assetsWritten++;
  }
  async finishImport(job:ImportJob):Promise<Roll>{
    const roll:Roll={id:job.rollId,name:job.name,capacity:job.capacity,assetIds:job.assetIds,createdAt:new Date().toISOString(),origin:job.origin};validateRoll(roll);
    await this.write(['jobs','assets','rolls'],(tx,fail)=>{
      const existing=tx.objectStore('jobs').get(job.id);existing.onsuccess=()=>{
        if(!existing.result){fail(Error('Import already finished or cancelled'));return;}
        let checked=0;
        for(const id of job.assetIds){const q=tx.objectStore('assets').get(id);q.onsuccess=()=>{if(!q.result||q.result.owner!==job.id){fail(Error('Roll is not ready yet'));return;}if(++checked===job.capacity){tx.objectStore('rolls').put(roll);tx.objectStore('jobs').delete(job.id);}};}
      };
    });return roll;
  }
  async cancelImport(job:ImportJob){
    await this.write(['jobs','assets','rolls'],tx=>{
      // Only our uncommitted job can own these temporary assets.
      const q=tx.objectStore('jobs').get(job.id);q.onsuccess=()=>{if(!q.result)return;const r=tx.objectStore('rolls').get(job.rollId);r.onsuccess=()=>{if(r.result)return;for(const id of job.assetIds){const asset=tx.objectStore('assets').get(id);asset.onsuccess=()=>{if(asset.result?.owner===job.id)tx.objectStore('assets').delete(id);};}tx.objectStore('jobs').delete(job.id);};};
    });
  }
  async listFavorites():Promise<Favorite[]>{
    const rows=await this.all<{id:string;value?:Favorite}>('prefs');
    return rows.filter(row=>row.id.startsWith('favorite:')&&row.value?.id===row.id&&typeof row.value.projectId==='string'&&typeof row.value.compositionId==='string'&&typeof row.value.sourceCompositionId==='string'&&typeof row.value.createdAt==='string'&&row.value.thumb instanceof Blob).map(row=>row.value!).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  }
  async favoriteCurrent(project:Project,snapshot:Composition,thumb:Blob):Promise<Favorite>{
    assertComposition(snapshot);if(!(thumb instanceof Blob))throw Error('Preview unavailable');
    const source=copyComposition(snapshot),current={...project};
    const assets=source.layers.map(layer=>layer.placements[0].source.assetId);
    const rolls=await Promise.all([this.roll(current.rollA),this.roll(current.rollB)]);
    if(rolls[0].assetIds[current.a]!==assets[0]||rolls[1].assetIds[current.b]!==assets[1]||source.id!==pairId(current,assets[0],assets[1]))throw Error('The selected mix changed. Try again.');
    const sourceId=current.kind==='favorite'?current.favoriteSourceId:source.id;
    if(!sourceId)throw Error('Favorite source unavailable');
    const now=new Date().toISOString();
    const p:Project=current.kind==='favorite'?current:{...current,id:crypto.randomUUID(),kind:'favorite',favoriteSourceId:sourceId,updatedAt:now};
    const c=copyComposition(source);c.id=pairId(p,assets[0],assets[1]);
    // A favorite is a deliberate saved snapshot, never an untouched pair subject to defaults.
    if(current.kind!=='favorite')c.revision=1;
    assertComposition(c);
    let favorite:Favorite={id:`favorite:${sourceId}`,projectId:p.id,compositionId:c.id,sourceCompositionId:sourceId,createdAt:now,thumb};
    await this.write(['prefs','projects','compositions'],(tx,fail)=>{
      const prefs=tx.objectStore('prefs'),projects=tx.objectStore('projects'),compositions=tx.objectStore('compositions');
      const check=prefs.get(favorite.id);
      check.onsuccess=()=>{
        const existing=check.result?.value as Favorite|undefined;
        if(existing){
          // Concurrent likes serialize on this transaction; never replace an edited favorite.
          const q=projects.get(existing.projectId),r=compositions.get(existing.compositionId);let checked=0;
          const ready=()=>{if(++checked!==2)return;if(!q.result||!r.result){fail(Error('Saved favorite is unavailable'));return;}favorite=existing;};
          q.onsuccess=ready;r.onsuccess=ready;return;
        }
        if(current.kind==='favorite'){
          // Removing a heart does not destroy the editor's saved project. Rejoin atomically.
          const q=compositions.get(c.id),r=projects.get(p.id);let checked=0;
          const ready=()=>{if(++checked!==2)return;if(!q.result||!r.result){fail(Error('Saved favorite is unavailable'));return;}prefs.add({id:favorite.id,value:favorite});};
          q.onsuccess=ready;r.onsuccess=ready;
        }else{
          projects.add(p);compositions.add(c);prefs.add({id:favorite.id,value:favorite});
        }
      };
    });
    return favorite;
  }
  async removeFavorite(id:string){
    if(!id.startsWith('favorite:'))throw Error('Invalid favorite');
    // Membership only: current edits and all original photographs remain intact.
    await this.write(['prefs'],tx=>{tx.objectStore('prefs').delete(id);});
  }
  async updateFavoriteThumbnail(projectId:string,thumb:Blob,expectedRevision?:number){
    if(!(thumb instanceof Blob))throw Error('Preview unavailable');
    await this.write(['prefs','projects','compositions'],tx=>{
      const p=tx.objectStore('projects').get(projectId);
      p.onsuccess=()=>{
        const project=p.result as Project|undefined;if(project?.kind!=='favorite'||!project.favoriteSourceId)return;
        const prefs=tx.objectStore('prefs'),q=prefs.get(`favorite:${project.favoriteSourceId}`);
        q.onsuccess=()=>{
          const favorite=q.result?.value as Favorite|undefined;if(!favorite||favorite.projectId!==projectId)return;
          const c=tx.objectStore('compositions').get(favorite.compositionId);
          c.onsuccess=()=>{if(!c.result||(expectedRevision!==undefined&&c.result.revision!==expectedRevision))return;prefs.put({id:favorite.id,value:{...favorite,thumb}});};
        };
      };
    });
  }
  async listProjects(){return (await this.all<Project>('projects')).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));}
  async project(id:string){const p=await this.read<Project>('projects',id);if(!p||typeof p.rollA!=='string'||typeof p.rollB!=='string'||!Number.isInteger(p.a)||!Number.isInteger(p.b)||p.a<0||p.b<0)throw Error('Session unavailable');return p;}
  async createProject(a:string,b:string){await Promise.all([this.roll(a),this.roll(b)]);const p:Project={id:crypto.randomUUID(),rollA:a,rollB:b,a:0,b:0,updatedAt:new Date().toISOString()};await this.write(['projects'],tx=>{tx.objectStore('projects').add(p);});return p;}
  async select(project:Project){await this.write(['projects','prefs'],tx=>{tx.objectStore('projects').put({...project,updatedAt:new Date().toISOString()});tx.objectStore('prefs').put({id:'last-project',value:project.id});});}
  async lastProject(){const id=(await this.read<{id:string;value:string}>('prefs','last-project'))?.value;return id?this.project(id):undefined;}
  async preference(id:string){return (await this.read<{id:string;value:unknown}>('prefs',id))?.value;}
  async setPreference(id:string,value:unknown){await this.write(['prefs'],tx=>{tx.objectStore('prefs').put({id,value});});}
  async close(){(await this.opened)?.close();this.opened=undefined;}
}
