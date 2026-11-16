// Added only to the optional sky program. The baseline shader remains intact.
export const RIPPLE_UNIFORMS=`
uniform vec4 rippleBounds;
uniform vec2 ripplePhase;
vec3 lakeRipple(vec2 uv){
  vec2 p=(uv-rippleBounds.xy)/rippleBounds.zw;
  float radius=length(p),age=ripplePhase.x;
  if(age<=0.||age>=1.||radius>=1.)return vec3(0.);
  float angle=atan(p.y,p.x),seed=ripplePhase.y;
  float envelope=smoothstep(0.,.08,age)*(1.-smoothstep(.52,1.,age));
  float edge=0.,slope=0.;
  for(int i=0;i<3;i++){
    float t=age-float(i)*.105;
    float ring=.10+sqrt(max(0.,t))*.82;
    float wobble=.018*sin(angle*3.+seed+float(i))+.012*sin(angle*7.-seed);
    float d=(radius-ring+wobble)/.055;
    float arc=smoothstep(-.65,.45,sin(angle*2.+seed+float(i)*1.7))*.65+.15;
    float wave=exp(-d*d*2.)*smoothstep(0.,.07,t)*arc;
    edge+=wave*(1.-float(i)*.2);
    slope+=wave*d;
  }
  float bounded=envelope*(1.-smoothstep(.87,1.,radius));
  vec2 direction=p/max(.08,radius);
  return vec3(direction*slope*.85,edge*.027-slope*.012)*bounded;
}`;

export function rippleFragment(baseline){
  return baseline.replace('void main(){',`${RIPPLE_UNIFORMS}\nvoid main(){`)
    .replace('delta*=effects;',`vec3 ripple=lakeRipple(uv)*water*effects;
  delta+=ripple.xy*texel;
  delta*=effects;`)
    .replace('vec3 color=over(foreground,sky);',`foreground.rgb+=ripple.z*foreground.rgb*light;
  vec3 color=over(foreground,sky);`);
}
