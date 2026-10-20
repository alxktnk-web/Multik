#version 300 es
precision highp float;
in vec2 vUV;
out vec4 color;

uniform sampler2D uA, uB, uHaloA, uHaloB, uMaskA, uMaskB;
uniform int uProfile;
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

vec3 filmTone(vec3 light){
  const vec3 weights=vec3(.2126,.7152,.0722);
  float Y=dot(light,weights);
  // A mild toe joins the extended shoulder at .45 with equal value/slope.
  // Black remains black; there is no extra post-transfer, per-channel S curve.
  float T;
  if(Y<=.45){
    float t=1.-Y/.45;
    T=Y*(1.-.25*t*t);
  }else{
    T=.45+.55*(1.-exp(-(Y-.45)/.55));
  }
  vec3 c=Y>0.?light*(T/Y):vec3(0.);
  // Compress chroma toward equal-luminance gray only near the SDR boundary.
  // A shared factor preserves the direction of RGB chroma; no channel clipping.
  float chroma=max(c.r,max(c.g,c.b))-T;
  float room=max(1.-T,0.);
  float knee=.8*room;
  if(chroma>knee){
    float tail=.2*room;
    float fit=knee+(tail>0.?tail*(1.-exp(-(chroma-knee)/tail)):0.);
    c=vec3(T)+(c-vec3(T))*(fit/chroma);
  }
  return c;
}

void main(){
  vec2 p=(uScreenToFilm*vec3(uOrigin+vUV*uViewport,1.)).xy;
  if(any(lessThan(p,vec2(0.)))||any(greaterThan(p,uFrame))){color=vec4(vec3(44.,41.,38.)/255.,1.);return;}
  vec2 a=(uFilmToA*vec3(p,1.)).xy, b=(uFilmToB*vec3(p,1.)).xy;
  vec3 light=source(uA,a)*uGains.x+source(uB,b)*uGains.y;
  float h=halo(uHaloA,a,uSizeA)*uGains.x*uHaloVariation.x+halo(uHaloB,b,uSizeB)*uGains.y*uHaloVariation.y;
  if(uProfile==3){
    // Positive spill around each source's emitter, not a red wash inside it.
    // Both textures share source-space padding, transforms and cached extraction.
    float ha=max(halo(uHaloA,a,uSizeA)-halo(uMaskA,a,uSizeA),0.);
    float hb=max(halo(uHaloB,b,uSizeB)-halo(uMaskB,b,uSizeB),0.);
    h=ha*uGains.x*uHaloVariation.x+hb*uGains.y*uHaloVariation.y;
  }
  light+=vec3(1.,.055,.012)*h*uHalo*1.8;
  light*=exp2(uExposure);
  vec3 rgb;
  if(uProfile==3){
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
}