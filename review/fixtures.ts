import { Repository } from '../src/lighttable/data/repository';

// Explicitly opt-in synthetic fixtures on this isolated development origin only.
export async function seedReview(repo:Repository){
  const existing=await repo.listRolls(),jobs=await repo.pendingImports();
  for(const count of [6,12,24,36]){
    if(existing.some(r=>r.name===`Review ${count}`))continue;
    const job=jobs.find(j=>j.name===`Review ${count}`)??await repo.beginImport(`Review ${count}`,count,`review-fixture-${count}`);
    for(let i=0;i<count;i++){
      const canvas=document.createElement('canvas');canvas.width=i%2?120:160;canvas.height=i%2?160:120;
      const ctx=canvas.getContext('2d')!;ctx.fillStyle=`hsl(${(i*47+count*13)%360} 35% ${i%3?63:30}%)`;ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='rgba(255,255,255,.55)';ctx.beginPath();ctx.arc(canvas.width*.45,canvas.height*.4,Math.min(canvas.width,canvas.height)*.23,0,Math.PI*2);ctx.fill();ctx.fillStyle='#171712';ctx.font='16px sans-serif';ctx.fillText(`${count} / ${i+1}`,8,canvas.height-10);
      const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Fixture failed')),'image/jpeg'));
      await repo.stageAsset(job,i,{id:job.assetIds[i],revision:1,blob,preview:blob,thumb:blob,width:canvas.width,height:canvas.height,owner:job.id});
    }
    await repo.finishImport(job);
  }
}
