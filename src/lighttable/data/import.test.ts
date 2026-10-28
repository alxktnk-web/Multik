import { afterEach, describe, expect, it, vi } from 'vitest';
import { importFiles, importProgress, Selection } from './import';
import type { Repository } from './repository';

vi.mock('../render/assets',()=>({decodeSource:async()=>({width:1,height:1,image:{},close(){}})}));
const files=(n:number)=>Array.from({length:n},()=>new Blob(['x'],{type:'image/jpeg'}) as File);

describe('roll import',()=>{
  afterEach(()=>vi.unstubAllGlobals());
  it.each([37,200])('commits the actual count for %i free photos',async count=>{
    vi.stubGlobal('document',{createElement:()=>({width:0,height:0,getContext:()=>({drawImage(){}}),toBlob:(done:(blob:Blob)=>void)=>done(new Blob(['p']))})});
    const job={id:'job',assetIds:Array.from({length:count},(_,i)=>String(i))};
    const repo={beginImport:vi.fn(async()=>job),stageAsset:vi.fn(async()=>{}),finishImport:vi.fn(async()=>({id:'roll'})),cancelImport:vi.fn(async()=>{})} as unknown as Repository;
    const selection=new Selection();selection.add(files(count));
    await importFiles(repo,selection,'test',()=>{});
    expect(repo.beginImport).toHaveBeenCalledWith('test',count);expect(repo.stageAsset).toHaveBeenCalledTimes(count);expect(repo.finishImport).toHaveBeenCalledOnce();expect(repo.cancelImport).not.toHaveBeenCalled();
  });
  it('uses unequal actual roll lengths and resumes progress after the first committed roll',()=>{
    expect(importProgress(37,6,false)).toEqual({total:43,offset:0});
    expect(importProgress(37,6,true)).toEqual({total:43,offset:6});
    expect(importProgress(200)).toEqual({total:200,offset:0});
  });
  it('rejects empty selection before beginning an import',async()=>{
    const repo={beginImport:vi.fn()} as unknown as Repository;
    await expect(importFiles(repo,new Selection(),'test',()=>{})).rejects.toThrow('Choose 1 to 200 photos');expect(repo.beginImport).not.toHaveBeenCalled();
  });
});
