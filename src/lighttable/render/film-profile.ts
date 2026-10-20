// Profile 3 is opt-in via Composition.profile.version, never a default migration.
// Constants are artistic choices, not a measured stock/negative/scanner model.
// This GLSL is shared by preview and export through the single present program.
export const filmProfileGLSL = `
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
`;
