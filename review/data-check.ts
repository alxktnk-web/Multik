import {Repository} from '../src/lighttable/data/repository';
import {Navigation} from '../src/lighttable/model/navigation';
import {Session} from '../src/lighttable/model/session';
import {createComposition} from '../src/lighttable/model/types';
import type {Renderer} from '../src/lighttable/render/renderer';
import {seedReview} from './fixtures';
if(!crypto.randomUUID)crypto.randomUUID=()=>{const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;const h=Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;};
const result=document.querySelector<HTMLElement>('#result')!;
document.querySelector<HTMLButtonElement>('#run')!.onclick=async()=>{try{
 const repo=new Repository();await seedReview(repo);const rolls=await repo.listRolls();const check=(v:unknown,label:string)=>{if(!v)throw Error(label);result.textContent+=`PASS ${label}\n`;};
 const make=()=>{const session=new Session(createComposition('empty',[{assetId:'a',assetRevision:1},{assetId:'b',assetRevision:1}],[{x:1,y:1},{x:1,y:1}]));const renderer={loadPair:async (_:unknown,__:unknown,c:Parameters<Session['replace']>[0],save:()=>Promise<void>)=>{await save();session.replace(c);return true;}} as unknown as Renderer;return {session,nav:new Navigation(repo,session,renderer)};};
 const p=await repo.createProject(rolls[0].id,rolls[1].id);const one=make();await one.nav.open(p,'mixes');one.session.activeLayer='a';one.session.rotateLayer();await one.nav.commit();const edited=structuredClone(one.session.draft);await one.nav.step(1);const two=make();await two.nav.resume();check(two.session.draft.id===edited.id&&two.session.draft.layers[0].transform.turns===edited.layers[0].transform.turns,'mix edit and slot resume via IndexedDB');
 const favorite=await repo.favoriteCurrent(two.nav.project!,two.session.draft,new Blob(['preview']));const favProject=await repo.project(favorite.projectId),snapshot=await repo.composition(favorite.compositionId);await two.nav.open(favProject,'library');two.session.rotateLayer();await two.nav.commit();const draftId=two.nav.project!.id;const draft=structuredClone(two.session.draft);const three=make();await three.nav.resume();check(three.nav.project?.id===draftId&&three.session.draft.id===draft.id&&three.session.draft.layers[0].transform.turns===draft.layers[0].transform.turns,'Library draft resume via IndexedDB');check(JSON.stringify(await repo.composition(favorite.compositionId))===JSON.stringify(snapshot),'favorite snapshot remains unchanged');await repo.close();
 }catch(e){result.textContent+=`FAIL ${e instanceof Error?e.message:String(e)}`;}};
