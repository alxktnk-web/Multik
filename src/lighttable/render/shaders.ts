import { levelsGLSL } from './levels';
import { filmProfileGLSL } from './film-profile';
import { denseProfileGLSL } from './dense-profile';

export const vertex = `#version 300 es
out vec2 vUV;
void main(){
  vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);
  vUV=p; gl_Position=vec4(p.x*2.-1.,1.-p.y*2.,0.,1.);
}`;
const head=`#version 300 es
precision highp float;
in vec2 vUV;
out vec4 color;
`;
export const extract = head+`
uniform sampler2D uSource;
uniform vec3 uLevels;
${levelsGLSL}
uniform vec2 uSize;
uniform float uPad, uThreshold;
void main(){
  vec2 uv=(vUV*(uSize+2.*uPad)-uPad)/uSize;
  float h=0.;
  if(all(greaterThanEqual(uv,vec2(0.)))&&all(lessThanEqual(uv,vec2(1.)))){
    vec3 c=inputLevels(texture(uSource,uv).rgb,uLevels);
    h=smoothstep(uThreshold,1.,dot(c,vec3(.2126,.7152,.0722)));
  }
  color=vec4(h,h,h,1.);
}`;
export const blur=head+`
uniform sampler2D uSource;
uniform vec2 uStep;
void main(){
  float sum=0., weight=0.;
  for(int i=-12;i<=12;i++){
    float f=float(i)/4.; float w=exp(-.5*f*f);
    vec2 p=vUV+uStep*f;
    float h=0.;
    if(all(greaterThanEqual(p,vec2(0.)))&&all(lessThanEqual(p,vec2(1.))))h=texture(uSource,vec2(p.x,1.-p.y)).r;
    sum+=h*w;weight+=w;
  }
  color=vec4(vec3(sum/weight),1.);
}`;
export const present=head+`
uniform sampler2D uA, uB, uHaloA, uHaloB, uMaskA, uMaskB;
uniform int uProfile;
uniform vec3 uLevelsA, uLevelsB;
${levelsGLSL}
uniform mat3 uScreenToFilm, uFilmToA, uFilmToB;
uniform vec2 uViewport, uOrigin, uFrame, uSizeA, uSizeB, uGains, uHaloVariation;
uniform float uPad, uHalo, uExposure, uContrast;
vec3 source(sampler2D tex,vec2 uv){
  if(any(lessThan(uv,vec2(0.)))||any(greaterThan(uv,vec2(1.))))return vec3(0.);
  return texture(tex,uv).rgb;
}
float halo(sampler2D tex,vec2 uv,vec2 size){
  vec2 p=(uv*size+uPad)/(size+2.*uPad);
  if(any(lessThan(p,vec2(0.)))||any(greaterThan(p,vec2(1.))))return 0.;
  return texture(tex,vec2(p.x,1.-p.y)).r;
}
vec3 display(vec3 c){return mix(12.92*c,1.055*pow(max(c,vec3(.0031308)),vec3(1./2.4))-.055,step(.0031308,c));}
${filmProfileGLSL}
${denseProfileGLSL}
void main(){
  vec2 p=(uScreenToFilm*vec3(uOrigin+vUV*uViewport,1.)).xy;
  if(any(lessThan(p,vec2(0.)))||any(greaterThan(p,uFrame))){color=vec4(vec3(44.,41.,38.)/255.,1.);return;}
  vec2 a=(uFilmToA*vec3(p,1.)).xy, b=(uFilmToB*vec3(p,1.)).xy;
  vec3 ca=inputLevels(source(uA,a),uLevelsA), cb=inputLevels(source(uB,b),uLevelsB);
  // Clear deliberately bypasses all automatic tone/color, gains, exposure and halo.
  if(uProfile==5){color=vec4(display(clamp(ca+cb,0.,1.)),1.);return;}
  vec3 light;
  if(uProfile==4){
    // Source contrast precedes gains/exposure; existing user Contrast stays last.
    // Keep emission masks untouched: their threshold is >= .5, above the gate.
    light=denseSource(ca)*uGains.x+denseSource(cb)*uGains.y;
  }else{
    light=ca*uGains.x+cb*uGains.y;
  }
  float h=halo(uHaloA,a,uSizeA)*uGains.x*uHaloVariation.x+halo(uHaloB,b,uSizeB)*uGains.y*uHaloVariation.y;
  if(uProfile==3||uProfile==4){
    // Positive spill around each source's emitter, not a red wash inside it.
    // Both textures share source-space padding, transforms and cached extraction.
    float ha=max(halo(uHaloA,a,uSizeA)-halo(uMaskA,a,uSizeA),0.);
    float hb=max(halo(uHaloB,b,uSizeB)-halo(uMaskB,b,uSizeB),0.);
    h=ha*uGains.x*uHaloVariation.x+hb*uGains.y*uHaloVariation.y;
  }
  light+=vec3(1.,.055,.012)*h*uHalo*1.8;
  light*=exp2(uExposure);
  vec3 rgb;
  if(uProfile==3||uProfile==4){
    rgb=clamp(display(max(filmTone(light),vec3(0.))),0.,1.);
  }else{
  // Profile 2: preserve low/mid light, compress only highlights, then a restrained S curve.
  float Y=dot(light,vec3(.2126,.7152,.0722));
  float T=Y<=.75?Y:.75+.25*(1.-exp(-(Y-.75)/.25));
  light=Y>1e-6?light*(T/Y):vec3(0.);
  light=mix(light,vec3(1.),smoothstep(1.,1.8,Y));
  // Fit out-of-gamut peaks toward equal-luminance gray, without clipping colored halos.
  float luma=min(dot(light,vec3(.2126,.7152,.0722)),1.);
  float peak=max(light.r,max(light.g,light.b));
  if(peak>1.)light=vec3(luma)+(light-vec3(luma))*(1.-luma)/max(peak-luma,1e-5);
  rgb=clamp(display(max(light,vec3(0.))),0.,1.);
  rgb=mix(rgb,rgb*rgb*(3.-2.*rgb),.35);
  }
  // User contrast is centered in the visible range. Black and white stay fixed.
  if(uContrast>=1.)rgb=mix(rgb,rgb*rgb*(3.-2.*rgb),(uContrast-1.)*2.);
  else rgb=mix(rgb,.5+(rgb-.5)*.5,(1.-uContrast)*2.);
  color=vec4(clamp(rgb,0.,1.),1.);
}`;
