// Profile 4: fixed source-local shadow separation before additive exposure.
// No mask texture, neighborhood operation, auto-levels, or UI parameter.
// Gate luminance once, then scale all RGB channels equally to retain their ratios.
export const denseProfileGLSL = `
vec3 denseSource(vec3 c){
  float Y=dot(c,vec3(.2126,.7152,.0722));
  return c*smoothstep(.02,.4,Y);
}
`;
