// Test-only fixtures/oracle. No imports from the runtime tone implementation.
export const weights=[.2126,.7152,.0722];
export const luma=c=>c.reduce((s,v,i)=>s+v*weights[i],0);
export const decode=v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4;
export const encode=v=>v<=.0031308?12.92*v:1.055*v**(1/2.4)-.055;
// Independent CPU oracle for the fixed, source-local profile-4 contrast.
export function denseReference(rgb){
  const t=Math.max(0,Math.min(1,(luma(rgb)-.02)/.38));
  return rgb.map(v=>v*t*t*(3-2*t));
}
export function reference3(light,contrast=1){
  const y=luma(light);
  const t=y<=.45?y*(1-.25*(1-y/.45)**2):1-.55*Math.exp(-((y-.45)/.55));
  let rgb=light.map(v=>y>0?v*t/y:0);
  const excess=Math.max(...rgb)-t,room=1-t,knee=.8*room;
  if(excess>knee){
    const width=.2*room;
    const compressed=knee+(width>0?-width*Math.expm1(-(excess-knee)/width):0);
    rgb=rgb.map(v=>t+(v-t)*compressed/excess);
  }
  return rgb.map(v=>{
    const c=encode(Math.max(0,v)),s=c*c*(3-2*c);
    return contrast>=1?c+(s-c)*(contrast-1)*2:c+(.5+(c-.5)*.5-c)*(1-contrast)*2;
  });
}
export async function canvasBlob(c){return new Promise(resolve=>c.toBlob(resolve,'image/png'));}
export function canvas(w=800,h=600){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
export async function flat(rgb){
  const c=canvas(80,60),ctx=c.getContext('2d');
  ctx.fillStyle=`rgb(${rgb.join(',')})`;ctx.fillRect(0,0,c.width,c.height);
  return canvasBlob(c);
}
export const patchColors=[
  [0,0,0],[1,1,1],[8,8,8],[16,16,16],[32,32,32],[64,64,64],[96,96,96],[128,128,128],
  [160,160,160],[180,180,180],[200,200,200],[220,220,220],[235,235,235],[245,245,245],[250,250,250],[255,255,255],
  [255,0,0],[0,255,0],[0,0,255],[255,255,0],[0,255,255],[255,0,255],[220,80,35],[20,80,30],
  [100,160,140],[200,140,100],[240,200,160],[30,45,90],[180,120,20],[40,110,180],[220,40,80],[80,20,60],
  [2,4,8],[5,15,5],[20,8,2],[250,220,240],[240,250,220],[220,240,250],[250,250,240],[245,248,255],
  [180,0,0],[0,180,0],[0,0,180],[180,180,0],[0,180,180],[180,0,180],[128,64,32],[32,64,128],
];
export async function atlas(){
  const c=canvas(),ctx=c.getContext('2d');
  patchColors.forEach((rgb,i)=>{ctx.fillStyle=`rgb(${rgb.join(',')})`;ctx.fillRect(i%8*100,Math.floor(i/8)*100,100,100);});
  return canvasBlob(c);
}
export async function scene(kind){
  const c=canvas(),x=c.getContext('2d');
  if(kind==='branches'){
    const g=x.createLinearGradient(0,0,800,600);g.addColorStop(0,'#829cba');g.addColorStop(1,'#fff0ce');
    x.fillStyle=g;x.fillRect(0,0,800,600);
    x.fillStyle='white';x.beginPath();x.arc(210,240,32,0,Math.PI*2);x.fill();
    x.strokeStyle='#101a12';x.lineCap='round';
    for(let i=0;i<11;i++){
      x.lineWidth=3+i%4;x.beginPath();x.moveTo(i*83,600);x.lineTo(i*83-40,210+i%3*40);x.stroke();
      for(let j=0;j<6;j++){const px=i*83-10-j*5,py=555-j*48;x.lineWidth=1+j%3;x.beginPath();x.moveTo(px,py);x.lineTo(px+(j%2?55:-45),py-40);x.stroke();}
    }
  }else if(kind==='texture'){
    x.fillStyle='#183822';x.fillRect(0,0,800,600);
    for(let i=0;i<6000;i++){const px=(i*137)%800,py=(i*89+Math.floor(i/7)*11)%600;x.fillStyle=['#355c24','#718135','#afa14d','#245940'][i%4];x.fillRect(px,py,2+i%4,7);}
    x.fillStyle='#e4d4b6';x.fillRect(400,0,130,600);x.fillStyle='#525d60';x.fillRect(425,30,80,240);
  }else if(kind==='silhouette'){
    x.fillStyle='#c4d5d8';x.fillRect(0,0,800,600);x.fillStyle='#080c12';
    x.beginPath();x.ellipse(400,155,62,80,0,0,Math.PI*2);x.fill();
    x.beginPath();x.moveTo(340,220);x.lineTo(270,560);x.lineTo(550,560);x.lineTo(465,220);x.closePath();x.fill();
    x.fillStyle='#ede6c9';x.fillRect(0,420,220,100);
  }else if(kind==='disc'){
    x.fillStyle='black';x.fillRect(0,0,800,600);x.fillStyle='white';
    for(const [a,b,r] of [[300,300,65],[3,95,24]]){x.beginPath();x.arc(a,b,r,0,Math.PI*2);x.fill();}
  }
  return canvasBlob(c);
}
export async function pixels(blob){
  const image=await createImageBitmap(blob),c=canvas(image.width,image.height),ctx=c.getContext('2d');
  ctx.drawImage(image,0,0);image.close();return ctx.getImageData(0,0,c.width,c.height);
}
export function diff(a,b){
  let sum=0,max=0,count=0;
  for(let i=0;i<a.length;i+=4)for(let k=0;k<3;k++){const d=Math.abs(a[i+k]-b[i+k]);sum+=d;max=Math.max(max,d);count++;}
  return {mae:sum/count,max};
}
