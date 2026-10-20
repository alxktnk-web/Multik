export type SourceInput = { id:string; blob:Blob };
export type Decoded = { image:ImageBitmap|HTMLCanvasElement; width:number; height:number; close:()=>void };

// Preparation only: never used by the movement/render loop. Two sources decode serially.
export async function decodeSource(input:SourceInput,edge=1024):Promise<Decoded> {
  if(input.blob.size>40*1024*1024)throw Error('Choose a photo smaller than 40 MB');
  const url=URL.createObjectURL(input.blob),img=new Image();
  try {
    img.src=url;
    try { await img.decode(); } catch { throw Error('Could not open this photo. Choose another file.'); }
    const w=img.naturalWidth,h=img.naturalHeight;
    if(!w||!h||w*h>64_000_000)throw Error('Photos up to 64 megapixels are supported');
    const ratio=Math.min(1,edge/Math.max(w,h)),width=Math.max(1,Math.round(w*ratio)),height=Math.max(1,Math.round(h*ratio));
    if(typeof createImageBitmap==='function'){
      try{const image=await createImageBitmap(img,{resizeWidth:width,resizeHeight:height,resizeQuality:'high'});return {image,width,height,close:()=>image.close()};}catch{/* Safari decoder fallback; same orientation as HTMLImageElement. */}
    }
    const image=document.createElement('canvas');image.width=width;image.height=height;
    const ctx=image.getContext('2d');if(!ctx)throw Error('Could not open this photo');
    ctx.drawImage(img,0,0,width,height);return {image,width,height,close:()=>{image.width=1;image.height=1;}};
  } finally {img.src='';URL.revokeObjectURL(url);}
}
