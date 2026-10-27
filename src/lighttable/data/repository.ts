import { createRecipe } from './recipe';
import { assertComposition, compositionStateKey, ConflictError, pairId, validateRoll, type Favorite, type Asset, type ImportJob, type Project, type Roll, type MixRecipe } from './types';
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
    await this.write(['compositions','projects'],(tx,fail)=>{const store=tx.objectStore('compositions'),req=store.get(snapshot.id);req.onsuccess=()=>{
      const current=req.result as Composition|undefined;
      if(!current||current.revision!==expectedRevision){fail(new ConflictError());return;}
      let identity:unknown;try{identity=JSON.parse(snapshot.id);}catch{/* Older non-pair composition IDs remain valid. */}
      if(Array.isArray(identity)&&identity[0]==='pair'&&typeof identity[1]==='string'){
        const p=tx.objectStore('projects').get(identity[1]);p.onsuccess=()=>{if(p.result?.kind==='favorite'){fail(Error('Saved Library variants are immutable. Create a working copy first.'));return;}store.put(next);};
      }else store.put(next);
    };});this.counters.compositionCommits++;return next;
  }
  async fork(snapshot:Composition,project:Project){return this.copyProject(snapshot,project,false);}
  async workingCopy(snapshot:Composition,project:Project){return this.copyProject(snapshot,project,true);}
  private async copyProject(snapshot:Composition,project:Project,working:boolean):Promise<{composition:Composition;project:Project}>{
    // Conflict copies are ordinary Mixes, including copies made from Library.
    // Keeping kind=favorite without a new membership would hide the copy.
    const {kind: _kind,favoriteSourceId: _source,...base}=project;
    const p:Project={...base,id:crypto.randomUUID(),updatedAt:new Date().toISOString(),...(working?{kind:'draft',favoriteSourceId:project.favoriteSourceId}:{})};
    const c=copyComposition(snapshot);c.id=pairId(p,c.layers[0].placements[0].source.assetId,c.layers[1].placements[0].source.assetId);c.revision=working?1:0;
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
    const favorites=rows.filter(row=>row.id.startsWith('favorite:')&&row.value?.id===row.id&&typeof row.value.projectId==='string'&&typeof row.value.compositionId==='string'&&typeof row.value.sourceCompositionId==='string'&&typeof row.value.createdAt==='string'&&row.value.thumb instanceof Blob).map(row=>row.value!);
    // Older memberships predate state keys. Read their existing snapshot without a migration.
    return (await Promise.all(favorites.map(async favorite=>{
      if(favorite.stateKey)return favorite;
      const saved=await this.composition(favorite.compositionId);
      return {...favorite,stateKey:saved?compositionStateKey(saved):undefined};
    }))).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  }
  async favoriteCurrent(project:Project,snapshot:Composition,thumb:Blob):Promise<Favorite>{
    assertComposition(snapshot);if(!(thumb instanceof Blob))throw Error('Preview unavailable');
    const source=copyComposition(snapshot),current={...project};
    const assets=source.layers.map(layer=>layer.placements[0].source.assetId);
    const rolls=await Promise.all([this.roll(current.rollA),this.roll(current.rollB)]);
    if(rolls[0].assetIds[current.a]!==assets[0]||rolls[1].assetIds[current.b]!==assets[1]||source.id!==pairId(current,assets[0],assets[1]))throw Error('The selected mix changed. Try again.');
    const sourceId=current.kind?current.favoriteSourceId:source.id;
    if(!sourceId)throw Error('Favorite source unavailable');
    const now=new Date().toISOString(),stateKey=compositionStateKey(source);
    const p:Project={...current,id:crypto.randomUUID(),kind:'favorite',favoriteSourceId:sourceId,updatedAt:now};
    const c=copyComposition(source);c.id=pairId(p,assets[0],assets[1]);c.revision=1;assertComposition(c);
    let favorite:Favorite={id:`favorite:${crypto.randomUUID()}`,projectId:p.id,compositionId:c.id,sourceCompositionId:sourceId,createdAt:now,thumb,stateKey};
    await this.write(['prefs','projects','compositions'],tx=>{
      const prefs=tx.objectStore('prefs'),compositions=tx.objectStore('compositions'),check=prefs.getAll();
      check.onsuccess=()=>{
        const candidates=(check.result as {id:string;value?:Favorite}[]).filter(row=>row.id.startsWith('favorite:')&&row.value?.compositionId).map(row=>row.value!);
        let pending=candidates.filter(f=>!f.stateKey).length;
        const finish=()=>{
          const existing=candidates.find(f=>f.stateKey===stateKey);
          if(existing){favorite=existing;return;}
          tx.objectStore('projects').add(p);compositions.add(c);prefs.add({id:favorite.id,value:favorite});
        };
        if(!pending){finish();return;}
        for(const candidate of candidates.filter(f=>!f.stateKey)){
          const q=compositions.get(candidate.compositionId);q.onsuccess=()=>{if(q.result)candidate.stateKey=compositionStateKey(q.result);if(!--pending)finish();};
        }
      };
    });return favorite;
  }
  async removeFavorite(id:string):Promise<Favorite|undefined>{
    if(!id.startsWith('favorite:'))throw Error('Invalid favorite');
    let removed:Favorite|undefined;
    await this.write(['prefs'],tx=>{const prefs=tx.objectStore('prefs'),q=prefs.get(id);q.onsuccess=()=>{removed=q.result?.value;prefs.delete(id);};});
    return removed;
  }
  async restoreFavorite(favorite:Favorite){
    if(!favorite.id.startsWith('favorite:'))throw Error('Invalid favorite');
    await this.write(['prefs','projects','compositions'],(tx,fail)=>{
      const prefs=tx.objectStore('prefs'),p=tx.objectStore('projects').get(favorite.projectId),c=tx.objectStore('compositions').get(favorite.compositionId),members=prefs.getAll();let checked=0;
      const ready=()=>{
        if(++checked!==3)return;if(!p.result||!c.result){fail(Error('Saved variant is unavailable'));return;}
        const key=compositionStateKey(c.result);
        // A user can re-like the same state before Undo, including in another tab.
        // Restore the original row and retain just one membership for that state.
        for(const row of members.result as {id:string;value?:Favorite}[])if(row.id.startsWith('favorite:')&&row.value?.stateKey===key&&row.id!==favorite.id)prefs.delete(row.id);
        prefs.put({id:favorite.id,value:{...favorite,stateKey:key}});
      };p.onsuccess=ready;c.onsuccess=ready;members.onsuccess=ready;
    });
  }
  async listProjects(){return (await this.all<Project>('projects')).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));}
  async project(id:string){const p=await this.read<Project>('projects',id);if(!p||typeof p.rollA!=='string'||typeof p.rollB!=='string'||!Number.isInteger(p.a)||!Number.isInteger(p.b)||p.a<0||p.b<0)throw Error('Session unavailable');if(p.recipe&&(p.recipe.version!==1||!Array.isArray(p.recipe.slots)||!p.recipe.slots.length||!Number.isInteger(p.slot)||p.slot!<0||p.slot!>=p.recipe.slots.length||p.recipe.slots.some(s=>!s||typeof s.id!=='string'||typeof s.assetAId!=='string'||typeof s.assetBId!=='string')||new Set(p.recipe.slots.map(s=>s.id)).size!==p.recipe.slots.length))throw Error('Session data is damaged');return p;}
  async createProject(a:string,b:string){const [ra,rb]=await Promise.all([this.roll(a),this.roll(b)]);await Promise.all([...new Set([...ra.assetIds,...rb.assetIds])].map(id=>this.asset(id)));const recipe=createRecipe(ra,rb);const first=recipe.slots[0];const p:Project={id:crypto.randomUUID(),rollA:a,rollB:b,a:ra.assetIds.indexOf(first.assetAId),b:rb.assetIds.indexOf(first.assetBId),slot:0,recipe,updatedAt:new Date().toISOString()};await this.write(['projects'],tx=>{tx.objectStore('projects').add(p);});return p;}
  async select(project:Project,expectedRecipe?:MixRecipe){await this.write(['projects','prefs'],(tx,fail)=>{const projects=tx.objectStore('projects');const save=()=>{projects.put({...project,updatedAt:new Date().toISOString()});tx.objectStore('prefs').put({id:'last-project',value:project.id});};if(!project.recipe){save();return;}const q=projects.get(project.id);q.onsuccess=()=>{if(!q.result||JSON.stringify(q.result.recipe)!==JSON.stringify(expectedRecipe??project.recipe)){fail(new ConflictError());return;}save();};});}
  async lastProject(){const id=(await this.read<{id:string;value:string}>('prefs','last-project'))?.value;return id?this.project(id):undefined;}
  async ensureRollCover<T>(id:string,recipe:T):Promise<T>{let result=recipe;await this.write(['prefs'],tx=>{const prefs=tx.objectStore('prefs'),q=prefs.get(id);q.onsuccess=()=>{if(q.result)result=q.result.value as T;else prefs.add({id,value:recipe});};});return result;}
  async preference(id:string){return (await this.read<{id:string;value:unknown}>('prefs',id))?.value;}
  async setPreference(id:string,value:unknown){await this.write(['prefs'],tx=>{tx.objectStore('prefs').put({id,value});});}
  async close(){(await this.opened)?.close();this.opened=undefined;}
}
