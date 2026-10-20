// Deliberately synthetic demo; users can replace each source with a real local photo.
export async function demoSources():Promise<[Blob,Blob]> {
  const make=async(index:number)=>{
    const canvas=document.createElement('canvas');canvas.width=960;canvas.height=720;
    const ctx=canvas.getContext('2d')!;
    const gradient=ctx.createLinearGradient(0,0,960,720);
    gradient.addColorStop(0,index?'#162925':'#283541');gradient.addColorStop(1,index?'#69513f':'#6c594e');
    ctx.fillStyle=gradient;ctx.fillRect(0,0,960,720);
    if(!index){
      ctx.fillStyle='#141c25';
      for(let i=0;i<7;i++){const height=230+(i*89)%260;ctx.fillRect(i*145-30,720-height,110,height);}
      ctx.fillStyle='#ffeddb';ctx.beginPath();ctx.arc(660,220,62,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#8a6147';for(let i=0;i<5;i++)ctx.fillRect(140+i*145,500,3,220);
    }else{
      ctx.fillStyle='#101b19';
      for(let i=0;i<5;i++){ctx.save();ctx.translate(50+i*210,730);ctx.rotate((i-2)*.12);ctx.fillRect(-10,-650,20,650);
        for(let j=0;j<6;j++){ctx.beginPath();ctx.ellipse((j%2?1:-1)*55,-100-j*85,70,27,(j%2?-.6:.6),0,Math.PI*2);ctx.fill();}ctx.restore();}
      ctx.fillStyle='#ece8c4';ctx.fillRect(760,80,16,90);
    }
    ctx.strokeStyle='rgba(220,214,197,.09)';ctx.lineWidth=1;
    for(let x=0;x<960;x+=120){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,720);ctx.stroke();}
    for(let y=0;y<720;y+=120){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(960,y);ctx.stroke();}
    return new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Could not prepare demo')),'image/png'));
  };
  return [await make(0),await make(1)];
}
