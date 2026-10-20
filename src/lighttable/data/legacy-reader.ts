import type { Repository } from './repository';
import { resumeAdoption } from './import';
export type LegacyRoll={id:string;name:string;length:number;photos:{w:number;h:number}[]};
const read=<T>(q:IDBRequest<T>)=>new Promise<T>((resolve,reject)=>{q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
export class LegacyReader {
  private db?:IDBDatabase;
  async open(){
    if(this.db)return true;
    // On modern Safari, do not even attempt to create a missing legacy DB.
    if(indexedDB.databases&&!(await indexedDB.databases()).some(db=>db.name==='multik-app'))return false;
    return new Promise<boolean>((resolve,reject)=>{
      const q=indexedDB.open('multik-app',1);
      q.onupgradeneeded=()=>{q.transaction?.abort();}; // Never create stores or change the old schema.
      q.onerror=()=>{if(q.error?.name==='AbortError')resolve(false);else reject(q.error);};
      q.onsuccess=()=>{this.db=q.result;this.db.onversionchange=()=>this.close();resolve(true);};
    });
  }
  async rolls():Promise<LegacyRoll[]>{if(!await this.open())return [];const rolls=await read<LegacyRoll[]>(this.db!.transaction('rolls','readonly').objectStore('rolls').getAll());return rolls.filter(r=>r&&typeof r.id==='string'&&Array.isArray(r.photos));}
  async photo(roll:LegacyRoll,index:number){if(!this.db)throw Error('Старая библиотека недоступна');const blob=await read(this.db.transaction('photos','readonly').objectStore('photos').get(`${roll.id}:${index}`));if(!(blob instanceof Blob))throw Error(`Не найден снимок ${index+1} в старой плёнке`);return blob;}
  async adopt(repo:Repository,roll:LegacyRoll,progress:(n:number)=>void,signal?:AbortSignal){
    const existing=(await repo.listRolls()).find(r=>r.origin===roll.id);if(existing)return existing;
    if(roll.photos.length<1||roll.photos.length>1000)throw Error('Неверная длина старой плёнки');
    const job=await repo.beginImport(roll.name,roll.photos.length,roll.id);
    // A failed adoption is intentionally retained for retry; never delete the original.
    return resumeAdoption(repo,job,i=>this.photo(roll,i),progress,signal);
  }
  close(){this.db?.close();this.db=undefined;}
}
