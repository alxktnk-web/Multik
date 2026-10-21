// Per-source Levels on CIELAB L* (D65), before conditioning and linear addition.
// Keep a*/b*; only out-of-gamut colors lose chroma, along the same Lab hue.
// Exact neutral branch avoids conversion drift in unedited sources.
export const levelsGLSL=`
vec3 levelsLabF(vec3 t){
  return mix(t*(841./108.)+vec3(4./29.),pow(max(t,vec3(0.)),vec3(1./3.)),step(vec3(216./24389.),t));
}
vec3 levelsLabInverse(vec3 f){
  return mix((f-vec3(4./29.))*(108./841.),f*f*f,step(vec3(6./29.),f));
}
vec3 levelsLabToRGB(float fy,vec2 ab){
  vec3 xyz=levelsLabInverse(vec3(fy+ab.x/500.,fy,fy-ab.y/200.))*vec3(.95047,1.,1.08883);
  return mat3(3.2404542,-.9692660,.0556434,-1.5371385,1.8760108,-.2040259,-.4985314,.0415560,1.0572252)*xyz;
}
bool levelsInGamut(vec3 c){return all(greaterThanEqual(c,vec3(0.)))&&all(lessThanEqual(c,vec3(1.)));}
vec3 inputLevels(vec3 c, vec3 l){
  if(l.x==0. && l.y==.5 && l.z==1.)return c;
  vec3 xyz=mat3(.4124564,.2126729,.0193339,.3575761,.7151522,.1191920,.1804375,.0721750,.9503041)*c;
  vec3 f=levelsLabF(xyz/vec3(.95047,1.,1.08883));
  float lightness=(116.*f.y-16.)/100.;
  float x=clamp((lightness-l.x)/(l.z-l.x),0.,1.);
  float exponent=log(.5)/log(clamp((l.y-l.x)/(l.z-l.x),.05,.95));
  float adjusted=pow(x,exponent);
  if(adjusted<=0.)return vec3(0.);
  if(adjusted>=1.)return vec3(1.);
  float fy=(100.*adjusted+16.)/116.;
  vec2 ab=vec2(500.*(f.x-f.y),200.*(f.y-f.z));
  vec3 result=levelsLabToRGB(fy,ab);
  if(levelsInGamut(result))return result;
  // Fit chroma to the display gamut without clipping channels or changing L*/hue.
  // Fixed bounded work, only for out-of-gamut pixels; no textures/readbacks.
  float low=0.,high=1.;
  for(int i=0;i<8;i++){
    float scale=(low+high)*.5;
    if(levelsInGamut(levelsLabToRGB(fy,ab*scale)))low=scale;else high=scale;
  }
  return clamp(levelsLabToRGB(fy,ab*low),0.,1.);
}
`;
