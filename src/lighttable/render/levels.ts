// Input levels on linear RGB, independently before dense conditioning and addition.
// Exact identity branch preserves existing rendering; the middle handle maps to 0.5.
export const levelsGLSL=`
vec3 inputLevels(vec3 c, vec3 l){
  if(l.x==0. && l.y==.5 && l.z==1.)return c;
  vec3 x=clamp((c-vec3(l.x))/(l.z-l.x),0.,1.);
  float exponent=log(.5)/log(clamp((l.y-l.x)/(l.z-l.x),.05,.95));
  return pow(x,vec3(exponent));
}
`;
