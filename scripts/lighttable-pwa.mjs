import {createHash} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import {readFile,readdir,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
// Small vector app mark, rendered deterministically without browser/build dependencies.
function icon(size){
 const crc=bytes=>{let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;};
 const chunk=(type,data)=>{const t=Buffer.from(type),n=Buffer.alloc(4),c=Buffer.alloc(4);n.writeUInt32BE(data.length);c.writeUInt32BE(crc(Buffer.concat([t,data])));return Buffer.concat([n,t,data,c]);};
 const raw=Buffer.alloc(size*(1+size*3));
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const sum=[0,0,0];for(let sy=0;sy<4;sy++)for(let sx=0;sx<4;sx++){
   const px=(x+(sx+.5)/4)/size,py=(y+(sy+.5)/4)/size,a=Math.hypot(px-.38,py-.5)<.205,b=Math.hypot(px-.62,py-.5)<.205;
   const color=a&&b?[194,202,182]:a?[139,158,135]:b?[211,204,189]:[44,41,38];for(let k=0;k<3;k++)sum[k]+=color[k];
  }for(let k=0;k<3;k++)raw[y*(1+size*3)+1+x*3+k]=Math.round(sum[k]/16);
 }
 const header=Buffer.alloc(13);header.writeUInt32BE(size,0);header.writeUInt32BE(size,4);header[8]=8;header[9]=2;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
export function lighttablePwa(){
 let output;
 return {name:'lighttable-isolated-pwa',apply:'build',configResolved(config){output=resolve(config.root,config.build.outDir,'lighttable');},async closeBundle(){
  await mkdir(output,{recursive:true});
  for(const file of ['manifest.webmanifest','recover.html'])await copyFile(resolve('lighttable/pwa',file),join(output,file));
  for(const size of [180,192,512])await writeFile(join(output,`icon-${size}.png`),icon(size));
  const files=(await readdir(output,{recursive:true,withFileTypes:true})).filter(e=>e.isFile()).map(e=>join(e.parentPath??e.path,e.name).slice(output.length+1).replaceAll('\\','/')).filter(file=>file!=='sw.js'&&file!=='recover.html').sort();
  const template=await readFile('lighttable/pwa/sw.js','utf8'),hash=createHash('sha256').update(template);
  for(const file of files)hash.update(file).update(await readFile(join(output,file)));
  const worker=template.replace('__BUILD_VERSION__',hash.digest('hex').slice(0,16)).replace('__PRECACHE_FILES__',JSON.stringify(files.map(file=>'./'+file)));
  await writeFile(join(output,'sw.js'),worker);
 }};
}
