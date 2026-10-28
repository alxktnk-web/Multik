import { vertex } from './shaders';
export type Program = { program: WebGLProgram; uniform: (name:string)=>WebGLUniformLocation|null };
export type Texture = { texture: WebGLTexture; width:number; height:number; bytes:number };
export type Metrics = { frames:number; uploads:number; compilations:number; liveBytes:number; peakBytes:number; liveTextures:number; contextLosses:number; staleLoads:number; inputToRafMs:number[]; drawCpuMs:number[]; frameIntervalsMs:number[] };
export const makeMetrics=():Metrics=>({frames:0,uploads:0,compilations:0,liveBytes:0,peakBytes:0,liveTextures:0,contextLosses:0,staleLoads:0,inputToRafMs:[],drawCpuMs:[],frameIntervalsMs:[]});
export const sample=(list:number[],value:number)=>{list.push(value);if(list.length>600)list.shift();};
export class Resources {
  private textures=new Set<Texture>();
  private programs:WebGLProgram[]=[];
  readonly budget=96*1024*1024;
  constructor(readonly gl:WebGL2RenderingContext,readonly metrics:Metrics) {}
  program(fragment:string):Program {
    const gl=this.gl, p=gl.createProgram();if(!p)throw Error('Could not initialize renderer');
    const shaders:WebGLShader[]=[];
    try {
      for(const [type,source] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]] as const){
        const s=gl.createShader(type);if(!s)throw Error('Could not initialize shader');shaders.push(s);
        gl.shaderSource(s,source);gl.compileShader(s);this.metrics.compilations++;
        if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s)??'Shader compilation failed');
        gl.attachShader(p,s);
      }
      gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p)??'Shader linking failed');
    }catch(e){gl.deleteProgram(p);throw e;}finally{for(const s of shaders)gl.deleteShader(s);}
    this.programs.push(p);const uniforms=new Map<string,WebGLUniformLocation|null>();
    return {program:p,uniform(name){if(!uniforms.has(name))uniforms.set(name,gl.getUniformLocation(p,name));return uniforms.get(name)!;}};
  }
  texture(width:number,height:number,image?:TexImageSource,budget=this.budget,floating=false):Texture {
    const gl=this.gl,bytes=width*height*(floating?8:4),max=gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    if(width>max||height>max||this.metrics.liveBytes+bytes>budget)throw Error('Not enough graphics memory for this size');
    if(floating&&!gl.getExtension('EXT_color_buffer_float'))throw Error('Film strip rendering is unavailable on this device');
    const texture=gl.createTexture();if(!texture)throw Error('Could not prepare photo');
    gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
    if(image){gl.texImage2D(gl.TEXTURE_2D,0,gl.SRGB8_ALPHA8,gl.RGBA,gl.UNSIGNED_BYTE,image);this.metrics.uploads++;}
    else gl.texImage2D(gl.TEXTURE_2D,0,floating?gl.RGBA16F:gl.RGBA8,width,height,0,gl.RGBA,floating?gl.HALF_FLOAT:gl.UNSIGNED_BYTE,null);
    const error=gl.getError();
    if(error!==gl.NO_ERROR){gl.deleteTexture(texture);throw Error(`GPU texture allocation failed (${error})`);}
    const t={texture,width,height,bytes};this.textures.add(t);
    this.metrics.liveBytes+=bytes;this.metrics.liveTextures++;this.metrics.peakBytes=Math.max(this.metrics.peakBytes,this.metrics.liveBytes);
    return t;
  }
  release(t:Texture){if(!this.textures.delete(t))return;this.gl.deleteTexture(t.texture);this.metrics.liveBytes-=t.bytes;this.metrics.liveTextures--;}
  dispose(){for(const t of [...this.textures])this.release(t);for(const p of this.programs)this.gl.deleteProgram(p);this.programs=[];}
  // Lost GL handles are invalid; do not attempt to reuse or free them in a new generation.
  lost(){this.textures.clear();this.programs=[];this.metrics.liveBytes=0;this.metrics.liveTextures=0;}
}
