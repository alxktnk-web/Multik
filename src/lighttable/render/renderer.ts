import { getLevels } from '../model/levels';
import { balanceGains } from '../../core/recipe';
import { Rng } from '../../core/rng';
import { filmToScreen, glMatrix, inverse, sourceToFilm } from '../model/transforms';
import { copyComposition, createComposition, type Composition, type SourceRef } from '../model/types';
import { stripFrame, stripSourceToFilm, visibleStripOffsets, type FilmStripScene } from '../model/film-strip';
import type { Session } from '../model/session';
import { decodeSource, type SourceInput, type Decoded } from './assets';
import { Resources, makeMetrics, sample, type Texture, type Program } from './resources';
import { Scheduler } from './scheduler';
import * as shaders from './shaders';

export type Quality = 1024 | 768 | 512;
type PreparedSource={image:Texture;halo:Texture;mask:Texture;temp:Texture;widthMm:number;heightMm:number;haloKey:string};
const PAD_MM=4.8; // Three sigma at the largest supported radius.
export class Renderer {
  readonly gl:WebGL2RenderingContext;
  readonly metrics=makeMetrics();
  haloBuilds=0;
  readonly scheduler:Scheduler;
  private resources:Resources;
  private programs!:{present:Program;extract:Program;blur:Program;stripAccumulate?:Program;stripFinish?:Program};
  private sourceResolver?:(source:SourceRef,full:boolean)=>Promise<SourceInput>;
  private stripPending?:Promise<void>;
  private stripToken=0;
  private stripRenderedToken=-1;
  private stripError?:Error;
  private framebuffer!:WebGLFramebuffer;
  private pair?:[PreparedSource,PreparedSource];
  private inputs?:[SourceInput,SourceInput];
  private cache=new Map<string,PreparedSource>();
  private pendingPins=new Map<PreparedSource,number>();
  private readonly cacheBudget=24*1024*1024;
  private generation=0;
  private selection=0;
  private destroyed=false;
  private exporting=false;
  private lastInput=0;
  private lastFrame=0;
  private tier:Quality=1024;
  private abort=new AbortController();
  onStatus:(message:string)=>void=()=>{};
  onReady:()=>void=()=>{};
  constructor(readonly canvas:HTMLCanvasElement,readonly session:Session) {
    const gl=canvas.getContext('webgl2',{alpha:false,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:false,powerPreference:'high-performance'});
    if(!gl)throw Error('WebGL 2 is unavailable. Open in an updated Safari.');
    this.gl=gl;this.resources=new Resources(gl,this.metrics);
    try{this.initialize();}catch(e){this.resources.dispose();throw e;}
    this.scheduler=new Scheduler(t=>this.draw(t));
    const opts={signal:this.abort.signal};
    canvas.addEventListener('webglcontextlost',e=>{
      e.preventDefault();this.generation++;this.selection++;this.metrics.contextLosses++;
      this.scheduler.pause();this.resources.lost();this.cache.clear();this.pendingPins.clear();this.pair=undefined;this.onStatus('Restoring photo…');
    },opts);
    canvas.addEventListener('webglcontextrestored',()=>{
      void this.restore();
    },opts);
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.scheduler.pause();else if(!this.exporting){this.scheduler.resume();this.invalidate();}},opts);
  }
  private initialize(){
    this.programs={present:this.resources.program(shaders.present),extract:this.resources.program(shaders.extract),blur:this.resources.program(shaders.blur)};
    const fb=this.gl.createFramebuffer();if(!fb)throw Error('Could not create image buffer');this.framebuffer=fb;
  }
  private async restore(){
    if(this.destroyed)return;
    try{
      this.initialize();
      if(this.inputs)await this.loadPair(this.inputs,false,this.session.draft);
      if(!document.hidden)this.scheduler.resume();this.invalidate();
    }catch(e){this.onStatus(e instanceof Error?e.message:'Could not restore photo');}
  }
  get ready(){return !!this.pair&&!this.gl.isContextLost();}
  get quality(){return this.tier;}
  get memoryEstimate(){return {
    gpuTextureBytes:this.metrics.liveBytes,
    drawingBufferColorBytes:this.canvas.width*this.canvas.height*4,
    // Upper bound of the two retained downsampled previews during preparation.
    preparedCpuPreviewBytes:2*1024*1024*4,
    retainedBlobBytes:this.inputs?.reduce((sum,input)=>sum+input.blob.size,0)??0,
    excludes:'Browser decoder/original decode, compositor buffers and driver overhead; not process RSS',
  };}
  setQuality(tier:Quality){this.tier=tier;this.invalidate();}
  setSourceResolver(resolver:(source:SourceRef,full:boolean)=>Promise<SourceInput>){this.sourceResolver=resolver;}
  invalidate(){this.stripToken++;if(!this.lastInput)this.lastInput=performance.now();this.scheduler.invalidate();}
  private bind(program:Program,name:string,t:Texture,unit:number){
    const gl=this.gl;gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,t.texture);gl.uniform1i(program.uniform(name),unit);
  }
  private target(t:Texture){
    const gl=this.gl;gl.bindFramebuffer(gl.FRAMEBUFFER,this.framebuffer);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,t.texture,0);
    if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Effect buffer unavailable');
    gl.viewport(0,0,t.width,t.height);
  }
  private prepare(decoded:Decoded,composition:Composition,index:0|1,budget=this.resources.budget):PreparedSource {
    const gl=this.gl,p=composition.layers[index].placements[0],r=p.turns%2?{width:p.rect.height,height:p.rect.width}:p.rect;
    const made:Texture[]=[];
    try {
      const image=this.resources.texture(decoded.width,decoded.height,decoded.image,budget);made.push(image);
      // Padding is physical, not screen-dependent. Halo can extend outside the source.
      const ppm=512/Math.max(r.width,r.height),width=Math.ceil((r.width+2*PAD_MM)*ppm),height=Math.ceil((r.height+2*PAD_MM)*ppm);
      const mask=this.resources.texture(width,height,undefined,budget);made.push(mask);
      const temp=this.resources.texture(width,height,undefined,budget);made.push(temp);
      const halo=this.resources.texture(width,height,undefined,budget);made.push(halo);
      const source={image,halo,mask,temp,widthMm:r.width,heightMm:r.height,haloKey:''};
      this.updateHalo(source,composition,index);
      return source;
    }catch(e){for(const t of made)this.resources.release(t);throw e;}
    finally{gl.bindFramebuffer(gl.FRAMEBUFFER,null);}
  }
  // Cache source uploads independently from derived masks. The signature is checked
  // once per animation frame; radius/threshold never decode, upload or allocate.
  private updateHalo(source:PreparedSource,composition:Composition,index:number){
    const levels=getLevels(composition.layers[index]);
    const {haloRadius,haloThreshold}=composition.effects;
    const key=`${haloRadius}:${haloThreshold}:${levels.black}:${levels.mid}:${levels.white}`;
    if(source.haloKey===key)return;
    const gl=this.gl,{image,mask,temp,halo,widthMm:width,heightMm:height}=source;
    const extract=this.programs.extract;gl.useProgram(extract.program);this.target(mask);this.bind(extract,'uSource',image,0);
    gl.uniform3f(extract.uniform('uLevels'),levels.black,levels.mid,levels.white);
    gl.uniform2f(extract.uniform('uSize'),width,height);gl.uniform1f(extract.uniform('uPad'),PAD_MM);gl.uniform1f(extract.uniform('uThreshold'),haloThreshold);gl.drawArrays(gl.TRIANGLES,0,3);
    const blur=this.programs.blur;gl.useProgram(blur.program);this.target(temp);this.bind(blur,'uSource',mask,0);
    gl.uniform2f(blur.uniform('uStep'),haloRadius/(width+2*PAD_MM),0);gl.drawArrays(gl.TRIANGLES,0,3);
    this.target(halo);this.bind(blur,'uSource',temp,0);gl.uniform2f(blur.uniform('uStep'),0,haloRadius/(height+2*PAD_MM));gl.drawArrays(gl.TRIANGLES,0,3);
    source.haloKey=key;this.haloBuilds++;
  }
  private sourceBytes(s:PreparedSource){return s.image.bytes+s.halo.bytes+s.mask.bytes+s.temp.bytes;}
  private releaseSource(s:PreparedSource){for(const t of [s.image,s.halo,s.mask,s.temp])this.resources.release(t);}
  private cached(source:PreparedSource){return [...this.cache.values()].includes(source);}
  private releasePair(pair?:[PreparedSource,PreparedSource]){if(pair)for(const source of pair){if(this.cached(source))continue;this.releaseSource(source);}}
  private trimCache(){
    let bytes=[...this.cache.values()].reduce((sum,s)=>sum+this.sourceBytes(s),0);
    for(const [key,source] of this.cache){
      if(bytes<=this.cacheBudget)break;
      if(this.pair?.includes(source)||this.pendingPins.has(source))continue;
      this.cache.delete(key);this.releaseSource(source);bytes-=this.sourceBytes(source);
    }
  }
  private touchCache(key:string){const source=this.cache.get(key);if(source){this.cache.delete(key);this.cache.set(key,source);}return source;}
  async loadPair(inputs:[SourceInput,SourceInput],replace=true,stored?:Composition,beforePresent?:()=>Promise<void>):Promise<boolean>{
    // Durable asset id + revision is immutable. Demo inputs intentionally bypass this cache.
    inputs=inputs.map(source=>({...source})) as [SourceInput,SourceInput];stored=stored?copyComposition(stored):undefined;
    const keys=inputs.map((input,i)=>{const p=stored?.layers[i].placements[0];return p?JSON.stringify([input.id,p.source.assetRevision,p.rect.width,p.rect.height,p.turns%2,'levels-halo-3',i]):'';});
    const epoch=++this.selection,generation=this.generation;
    const decoded:(Decoded|undefined)[]=[];
    const pinned:PreparedSource[]=[];
    const stale=()=>this.destroyed||epoch!==this.selection||generation!==this.generation||this.gl.isContextLost();
    try {
      for(let i=0;i<inputs.length;i++){
        if(!keys[i]||!this.cache.has(keys[i]))decoded[i]=await decodeSource(inputs[i]);
        if(stale()){this.metrics.staleLoads++;return false;}
      }
      const composition=stored??createComposition(JSON.stringify(inputs.map(x=>x.id)),inputs.map(x=>({assetId:x.id,assetRevision:1})) as Parameters<typeof createComposition>[1],decoded.map(d=>({x:d!.width,y:d!.height})) as Parameters<typeof createComposition>[2]);
      if(composition.layers.some((layer,i)=>layer.placements[0].source.assetId!==inputs[i].id))throw Error('Sources do not match this composition');
      const prepare=(i:0|1)=>{const key=keys[i],cached=key?this.touchCache(key):undefined;const source=cached??this.prepare(decoded[i]!,composition,i);if(key)this.cache.set(key,source);pinned.push(source);this.pendingPins.set(source,(this.pendingPins.get(source)??0)+1);return source;};
      const a=prepare(0);let b:PreparedSource;
      try{b=prepare(1);}catch(e){if(!this.cached(a)){this.releaseSource(a);}throw e;}
      try{await beforePresent?.();}catch(e){this.releasePair([a,b]);throw e;}
      if(stale()){this.releasePair([a,b]);this.metrics.staleLoads++;return false;}
      const previous=this.pair;this.pair=[a,b];this.inputs=inputs;
      if(replace)this.session.replace(composition);
      this.releasePair(previous);this.invalidate();this.onReady();return true;
    }catch(e){if(stale())return false;throw e;}
    finally{for(const d of decoded)d?.close();for(const source of pinned){const count=this.pendingPins.get(source)??0;if(count<=1)this.pendingPins.delete(source);else this.pendingPins.set(source,count-1);}this.trimCache();}
  }
  private draw(time:number){
    if(!this.ready||this.destroyed||this.exporting)return;
    const start=performance.now(),gl=this.gl,s=this.session,c=s.draft,v=s.viewport;
    const ratio=Math.min(window.devicePixelRatio||1,1.5,this.tier/Math.max(v.width,v.height));
    const w=Math.max(1,Math.round(v.width*ratio)),h=Math.max(1,Math.round(v.height*ratio));
    if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}
    if(c.filmStrip){
      if(!this.stripPending){
        this.stripError=undefined;const token=this.stripToken, generation=this.generation, snapshot=copyComposition(c) as FilmStripScene, view=structuredClone(v);
        const check=()=>{if(this.destroyed||this.exporting||this.gl.isContextLost()||generation!==this.generation||token!==this.stripToken)throw new DOMException('Superseded','AbortError');};
        this.stripPending=this.renderStrip(snapshot,inverse(filmToScreen(snapshot.frame,view)),view.width,view.height,w,h,0,0,false,undefined,check).then(()=>{this.stripRenderedToken=token;}).catch(e=>{if(!(e instanceof DOMException&&e.name==='AbortError')){this.stripError=e instanceof Error?e:Error('Could not render film strip');this.onStatus(this.stripError.message);}}).finally(()=>{this.stripPending=undefined;if(token!==this.stripToken&&!this.exporting&&!this.destroyed)this.scheduler.invalidate();});
      }
      return;
    }
    // Latest values only: all pointer events before this rAF coalesce here.
    if(c.profile.version!==5)this.pair!.forEach((source,i)=>this.updateHalo(source,c,i));
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,w,h);gl.disable(gl.BLEND);
    this.present(c,this.pair!,inverse(filmToScreen(c.frame,v)),v.width,v.height);
    this.metrics.frames++;
    if(import.meta.env.DEV){
      sample(this.metrics.drawCpuMs,performance.now()-start);
      if(this.lastInput)sample(this.metrics.inputToRafMs,Math.max(0,performance.now()-this.lastInput));
      if(this.lastFrame&&time-this.lastFrame<100)sample(this.metrics.frameIntervalsMs,time-this.lastFrame);
    }
    this.lastInput=0;this.lastFrame=time;
  }
  private present(c:Composition,pair:[PreparedSource,PreparedSource],screenToFilm:ReturnType<typeof inverse>,width:number,height:number,originX=0,originY=0){
    const gl=this.gl,p=this.programs.present;gl.useProgram(p.program);
    const [a,b]=pair;this.bind(p,'uA',a.image,0);this.bind(p,'uB',b.image,1);this.bind(p,'uHaloA',a.halo,2);this.bind(p,'uHaloB',b.halo,3);
    // Profile-independent source masks are reused; switching look needs no rebuild.
    this.bind(p,'uMaskA',a.mask,4);this.bind(p,'uMaskB',b.mask,5);
    gl.uniform1i(p.uniform('uProfile'),c.profile.version);
    for(const [i,name] of ['uLevelsA','uLevelsB'].entries()){const l=getLevels(c.layers[i]);gl.uniform3f(p.uniform(name),l.black,l.mid,l.white);}
    gl.uniformMatrix3fv(p.uniform('uScreenToFilm'),false,glMatrix(screenToFilm));
    gl.uniformMatrix3fv(p.uniform('uFilmToA'),false,glMatrix(inverse(sourceToFilm(c.frame,c.layers[0],c.layers[0].placements[0]))));
    gl.uniformMatrix3fv(p.uniform('uFilmToB'),false,glMatrix(inverse(sourceToFilm(c.frame,c.layers[1],c.layers[1].placements[0]))));
    gl.uniform2f(p.uniform('uViewport'),width,height);gl.uniform2f(p.uniform('uOrigin'),originX,originY);gl.uniform2f(p.uniform('uFrame'),c.frame.widthMm,c.frame.heightMm);
    gl.uniform2f(p.uniform('uSizeA'),a.widthMm,a.heightMm);gl.uniform2f(p.uniform('uSizeB'),b.widthMm,b.heightMm);
    gl.uniform1f(p.uniform('uPad'),PAD_MM);gl.uniform1f(p.uniform('uHalo'),c.effects.halo);gl.uniform1f(p.uniform('uExposure'),c.effects.exposure);gl.uniform1f(p.uniform('uContrast'),c.effects.contrast);
    const gains=balanceGains(c.effects.balance);gl.uniform2f(p.uniform('uGains'),gains.a*c.layers[0].placements[0].gain,gains.b*c.layers[1].placements[0].gain);
    // Deterministic source-anchored variation, never a new random draw on movement.
    const rng=new Rng(c.seed);gl.uniform2f(p.uniform('uHaloVariation'),rng.range(.85,1.15),rng.range(.85,1.15));
    gl.drawArrays(gl.TRIANGLES,0,3);
  }
  // Render each visible source serially into two bounded float buffers. Every
  // source has its own Levels and halo extraction before accumulation.
  private async renderStrip(c:FilmStripScene,screenToFilm:ReturnType<typeof inverse>,viewportW:number,viewportH:number,w:number,h:number,originX:number,originY:number,full:boolean,target:Texture|undefined,check:()=>void,decodeEdge=1024){
    const gl=this.gl,resolver=this.sourceResolver,generation=this.generation;if(!resolver)throw Error('Film strip sources unavailable');
    this.programs.stripAccumulate??=this.resources.program(shaders.stripAccumulate);
    this.programs.stripFinish??=this.resources.program(shaders.stripFinish);
    let a:Texture|undefined,b:Texture|undefined;
    try{
      a=this.resources.texture(w,h,undefined,full?160*1024*1024:undefined,true);
      b=this.resources.texture(w,h,undefined,full?160*1024*1024:undefined,true);
      this.target(a);gl.disable(gl.BLEND);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
      const gains=balanceGains(c.effects.balance),rng=new Rng(c.seed),variation=[rng.range(.85,1.15),rng.range(.85,1.15)];
      for(const index of [0,1] as const){
        const offsets=visibleStripOffsets(c.frame,c.layers[index],c.filmStrip.gapMm,PAD_MM);
        if(offsets.length>32)throw Error('Film strip has too many visible frames');
        for(const offset of offsets){
          check();const placement=stripFrame(c.filmStrip.layers[index],offset);
          const key=JSON.stringify(['strip',placement.source.assetId,placement.source.assetRevision,placement.rect.width,placement.rect.height,placement.turns%2,index]);
          let source=full?undefined:this.touchCache(key);
          if(!source){
            const input=await resolver(placement.source,full);if(full)check();
            if(input.id!==placement.source.assetId)throw Error('Film strip source does not match');
            const decoded=await decodeSource(input,decodeEdge);
            try{
              // Finish warming a preview frame even if pointer input superseded this
              // draw, so continuous gestures can reuse it on the next pass.
              if(this.destroyed||generation!==this.generation||this.gl.isContextLost())throw new DOMException('Superseded','AbortError');
              const frame=copyComposition(c);frame.layers[index].placements=[placement];
              source=this.prepare(decoded,frame,index,full?160*1024*1024:undefined);
              if(!full)this.cache.set(key,source);
            }finally{decoded.close();}
          }
          try{
            check();this.updateHalo(source,c,index);
            const p=this.programs.stripAccumulate!;this.target(b);gl.useProgram(p.program);
            this.bind(p,'uPrevious',a,0);this.bind(p,'uSource',source.image,1);this.bind(p,'uHaloSource',source.halo,2);this.bind(p,'uMaskSource',source.mask,3);
            gl.uniform1i(p.uniform('uProfile'),c.profile.version);const l=getLevels(c.layers[index]);gl.uniform3f(p.uniform('uLevels'),l.black,l.mid,l.white);
            gl.uniformMatrix3fv(p.uniform('uScreenToFilm'),false,glMatrix(screenToFilm));gl.uniformMatrix3fv(p.uniform('uFilmToSource'),false,glMatrix(inverse(stripSourceToFilm(c,index,offset))));
            gl.uniform2f(p.uniform('uViewport'),viewportW,viewportH);gl.uniform2f(p.uniform('uOrigin'),originX,originY);gl.uniform2f(p.uniform('uFrame'),c.frame.widthMm,c.frame.heightMm);gl.uniform2f(p.uniform('uSize'),source.widthMm,source.heightMm);
            gl.uniform1f(p.uniform('uPad'),PAD_MM);gl.uniform1f(p.uniform('uGain'),(index?gains.b:gains.a)*placement.gain);gl.uniform1f(p.uniform('uVariation'),variation[index]);gl.drawArrays(gl.TRIANGLES,0,3);
            [a,b]=[b,a];
          }finally{if(full)this.releaseSource(source);}

        }
      }
      check();if(target)this.target(target);else gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,w,h);
      const p=this.programs.stripFinish!;gl.useProgram(p.program);this.bind(p,'uAccumulated',a,0);gl.uniform1i(p.uniform('uProfile'),c.profile.version);gl.uniformMatrix3fv(p.uniform('uScreenToFilm'),false,glMatrix(screenToFilm));
      gl.uniform2f(p.uniform('uViewport'),viewportW,viewportH);gl.uniform2f(p.uniform('uOrigin'),originX,originY);gl.uniform2f(p.uniform('uFrame'),c.frame.widthMm,c.frame.heightMm);
      gl.uniform1f(p.uniform('uHalo'),c.effects.halo);gl.uniform1f(p.uniform('uExposure'),c.effects.exposure);gl.uniform1f(p.uniform('uContrast'),c.effects.contrast);gl.drawArrays(gl.TRIANGLES,0,3);
      if(gl.getError()!==gl.NO_ERROR)throw Error('Could not render film strip. Close other apps and try again.');
    }finally{if(a)this.resources.release(a);if(b)this.resources.release(b);this.trimCache();}
  }
  // Explicit library/heart boundary only, never called by gestures or animation.
  // Copy immediately after drawing: the WebGL canvas does not preserve its buffer.
  async capturePreview(){
    if(!this.ready||this.destroyed||this.exporting||this.session.gesturing)throw Error('Wait for the photo to finish');
    do{
      const token=this.stripToken;this.draw(performance.now());
      if(this.stripPending)await this.stripPending;
      if(this.stripError)throw this.stripError;
      if(token===this.stripToken&&(!this.session.draft.filmStrip||this.stripRenderedToken===token))break;
    }while(!this.destroyed&&!this.exporting);
    if(this.destroyed||this.exporting)throw Error('Preview unavailable');
    const output=document.createElement('canvas');output.width=this.canvas.width;output.height=this.canvas.height;
    const ctx=output.getContext('2d');if(!ctx)throw Error('Could not prepare preview');
    ctx.drawImage(this.canvas,0,0);
    try{return await new Promise<Blob>((resolve,reject)=>output.toBlob(blob=>blob?resolve(blob):reject(Error('Could not prepare preview')),'image/jpeg',.92));}
    finally{output.width=output.height=1;}
  }
  // Explicit export only. The visible canvas/draft/history never become the export target.
  async exportImage(snapshot:Composition,inputs:[SourceInput,SourceInput],edge:2000|4000,signal:AbortSignal,onProgress:(fraction:number)=>void=()=>{},tileEdge=1024){
    if(this.exporting)throw Error('Export is already running');
    if(!this.ready||this.destroyed)throw Error('Wait for the photo to recover');
    if(edge!==2000&&edge!==4000)throw Error('Unsupported photo size');
    if(inputs.some((input,i)=>input.id!==snapshot.layers[i].placements[0].source.assetId))throw Error('Sources do not match this photo');
    const c=copyComposition(snapshot),odd=c.frame.turns%2,width=odd?Math.round(edge*3/4):edge,height=odd?edge:Math.round(edge*3/4);
    const gl=this.gl,generation=this.generation,budget=160*1024*1024;
    const check=()=>{signal.throwIfAborted();if(this.destroyed||gl.isContextLost()||generation!==this.generation)throw Error('Photo is recovering. Try saving again.');};
    const output=document.createElement('canvas');output.width=width;output.height=height;
    const ctx=output.getContext('2d',{alpha:false});if(!ctx){output.width=output.height=1;throw Error('Could not prepare file');}
    const pair:PreparedSource[]=[],view={width,height,zoom:1,pan:{x:0,y:0}},matrix=inverse(filmToScreen(c.frame,view));
    let target:Texture|undefined;
    this.exporting=true;this.stripToken++;this.scheduler.pause();
    try{
      await this.stripPending;check();
      // Decode/upload/close serially: at most one prepared CPU original at a time.
      for(const index of c.filmStrip?[]:[0,1] as const){
        const decoded=await decodeSource(inputs[index],edge);
        try{check();pair.push(this.prepare(decoded,c,index,budget));}finally{decoded.close();}
      }
      const tile=Math.min(Math.max(64,Math.floor(tileEdge)),edge,gl.getParameter(gl.MAX_TEXTURE_SIZE) as number);
      target=this.resources.texture(tile,tile,undefined,budget);
      const raw=new Uint8Array(tile*tile*4),total=Math.ceil(width/tile)*Math.ceil(height/tile);let completed=0;
      for(let y=0;y<height;y+=tile)for(let x=0;x<width;x+=tile){
        check();const w=Math.min(tile,width-x),h=Math.min(tile,height-y);
        this.target(target);gl.viewport(0,0,w,h);gl.disable(gl.BLEND);
        if(c.filmStrip)await this.renderStrip(c as FilmStripScene,matrix,w,h,w,h,x,y,true,target,check,edge);
        else this.present(c,pair as [PreparedSource,PreparedSource],matrix,w,h,x,y);
        gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,raw);check();
        if(gl.getError()!==gl.NO_ERROR)throw Error('Could not prepare full-size photo. Close other apps and try again.');
        const image=ctx.createImageData(w,h);
        for(let row=0;row<h;row++)image.data.set(raw.subarray((h-1-row)*w*4,(h-row)*w*4),row*w*4);
        ctx.putImageData(image,x,y);onProgress(++completed/total);
        await new Promise<void>(resolve=>setTimeout(resolve,0));
      }
      check();
      const encode=(canvas:HTMLCanvasElement,quality:number)=>new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Could not create JPEG. Close other apps and try again.')),'image/jpeg',quality));
      const blob=await encode(output,.95);check();
      const thumbCanvas=document.createElement('canvas');thumbCanvas.width=Math.round(width/edge*320);thumbCanvas.height=Math.round(height/edge*320);
      let thumb:Blob;
      try{const small=thumbCanvas.getContext('2d');if(!small)throw Error('Could not prepare thumbnail');small.drawImage(output,0,0,thumbCanvas.width,thumbCanvas.height);thumb=await encode(thumbCanvas,.85);check();}finally{thumbCanvas.width=thumbCanvas.height=1;}
      return {blob,thumb,width,height,compositionId:c.id,revision:c.revision};
    }finally{
      output.width=output.height=1;if(target)this.resources.release(target);for(const source of pair)this.releaseSource(source);
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);this.exporting=false;
      if(!this.destroyed&&!document.hidden&&!gl.isContextLost())this.scheduler.resume();this.invalidate();
    }
  }
  dispose(){
    this.destroyed=true;this.selection++;this.abort.abort();this.scheduler.dispose();
    this.cache.clear();this.pendingPins.clear();this.releasePair(this.pair);this.pair=undefined;this.resources.dispose();this.gl.deleteFramebuffer(this.framebuffer);this.inputs=undefined;
  }
}
