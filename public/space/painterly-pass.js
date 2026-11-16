// The painterly pass over the yard's frame: the scene is drawn into a target, then a direction-following (anisotropic)
// Kuwahara filter lays its colour down in strokes that run along the forms, and a last pass adds a restrained impasto
// light on the stroke edges and the linen's weave.
//
// Colour: the scene target is stored and shaded exactly as the canvas would be (sRGB-encoded RGBA8, the renderer's tone
// mapping and output transfer applied by the materials, the sky's display values written as they are), so every filter
// works on display values and the last pass writes them unchanged. With the filter at rest the picture is the direct render,
// except that it is opaque: the direct render leaves alpha below 1 along card and silhouette edges, where the page's dark
// background then shows through the canvas as faint light fringes.
//
// Sky: the dome, sun, moon, stars and clouds never write depth, so untouched depth is sky. Sky is left as drawn (its clouds
// keep their own brushwork and the stars their points), land is filtered from land alone (no sky bleeds into a silhouette),
// and the impasto stays off a band round every silhouette, so no rim follows the oak or the roof against the sky.

const RADIUS = 2.6;      // filter radius at full reach, CSS pixels (times the pixel ratio and the filter scale)
const REACH = [3, 40];   // metres over which the filter grows from 0.3 of its radius (near) to all of it (far)
const SHARPNESS = 12;    // the Kuwahara q: how strongly the calmest sector wins
const DETAIL = [.12, .36];   // share of the unfiltered frame kept far off and near by
const LIGHT_NEAR_DETAIL = .6; // near by on the light tier, where the filter runs at reduced resolution
const IMPASTO = 4, IMPASTO_STEP = [.015, .04]; // light on stroke edges; faded out across larger steps of tone
const RELIEF = .8;       // how much of the surfaces' own finest strokes is raised in the impasto, near by
const WEAVE_LAND = .03, WEAVE_SKY = .006, THREAD = 2.6; // linen weave depth over paint and over sky; thread pitch, CSS px
const SKY_DEPTH = '.9999995'; // cleared depth is 1; the farthest hills (under 1 km) are well below this

const QUAD_VERTEX = `varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`;
// The frame at the filter's size, with land (1) or sky (0) in alpha.
const PREPARE = `uniform sampler2D colour,depth;varying vec2 vUv;
void main(){gl_FragColor=vec4(texture(colour,vUv).rgb,texture(depth,vUv).r<${SKY_DEPTH}?1.:0.);}`;
// Structure tensor (Sobel over RGB), for the strokes' direction.
const TENSOR = `uniform sampler2D src;uniform vec2 texel;varying vec2 vUv;
vec3 T(float x,float y){return texture(src,vUv+vec2(x,y)*texel).rgb;}
void main(){
  vec3 gx=(-T(-1.,-1.)-2.*T(-1.,0.)-T(-1.,1.)+T(1.,-1.)+2.*T(1.,0.)+T(1.,1.))*.25;
  vec3 gy=(-T(-1.,-1.)-2.*T(0.,-1.)-T(1.,-1.)+T(-1.,1.)+2.*T(0.,1.)+T(1.,1.))*.25;
  gl_FragColor=vec4(dot(gx,gx),dot(gx,gy),dot(gy,gy),1.);
}`;
// Anisotropic Kuwahara with polynomial sector weights (after Kyprianidis, Kang and Döllner): eight overlapping sectors of an
// ellipse stretched along the local stroke direction, read on a fixed lattice of taps over the ellipse, from land alone.
// A lattice of 13 taps (two from the centre to the rim along each axis): finer lattices cost far more and looked no better.
const LATTICE = 2, K = [0, 1, 2, 3, 4, 5, 6, 7];
const KUWAHARA = `uniform sampler2D src,tensor,depth;uniform vec2 texel,clip,reach;uniform float radius,sharpness;varying vec2 vUv;
const float ZETA=.33,ETA=(ZETA+.92387953)/.14644661; // (zeta + cos(pi/8)) / sin²(pi/8)
// A sector's mean colour, weighted by how calm it is.
vec4 sector(vec4 m,vec3 s,float q){
  if(m.w<1e-6)return vec4(0.);
  vec3 mu=m.rgb/m.w,var=abs(s/m.w-mu*mu);
  float w=1./(1.+pow(255.*(var.r+var.g+var.b),.5*q));
  return vec4(mu*w,w);
}
void main(){
  vec4 centre=texture(src,vUv);
  if(centre.a<.5){gl_FragColor=centre;return;}
  // Near surfaces already carry their painted strokes at a size the eye reads, so the filter only tidies them; farther off,
  // where the textures' strokes shrink below a brush's width, it lays the colour down in strokes of its own.
  float z=clip.x*clip.y/(clip.y-texture(depth,vUv).r*(clip.y-clip.x)),far=smoothstep(reach.x,reach.y,z);
  float size=radius*mix(.3,1.,far);
  vec3 t=vec3(0.);
  for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++)t+=texture(tensor,vUv+vec2(float(i),float(j))*texel*1.5).rgb*(i==0&&j==0?4.:1.);
  t/=12.;
  float E=t.x,F=t.y,G=t.z,root=sqrt((E-G)*(E-G)+4.*F*F),l1=.5*(E+G+root),l2=.5*(E+G-root);
  vec2 dir=vec2(l1-E,-F);dir=length(dir)>1e-7?normalize(dir):vec2(0.,1.);
  float A=(l1+l2)>1e-7?(l1-l2)/(l1+l2):0.;
  // The ellipse's half axes in texture coordinates, along the stroke and across it.
  vec2 along=dir*size*clamp(1.+A,.1,2.)*texel*2.,across=vec2(-dir.y,dir.x)*size*clamp(1./(1.+A),.1,2.)*texel*2.;
  // Eight sectors' weighted sums (colour, weight) and sums of squares, kept in named registers rather than arrays.
  ${K.map(k => `vec4 m${k}=vec4(0.);vec3 s${k}=vec3(0.);`).join('')}
  for(int j=-${LATTICE};j<=${LATTICE};j++)for(int i=-${LATTICE};i<=${LATTICE};i++){
    vec2 v=vec2(float(i),float(j))*${(.5 / LATTICE).toFixed(6)}; // |v| <= .5 inside the ellipse
    if(dot(v,v)>.26)continue;
    vec4 c=texture(src,vUv+along*v.x+across*v.y);
    vec2 d=.70710678*vec2(v.x-v.y,v.x+v.y);
    vec4 xx=ZETA-ETA*vec4(v.x*v.x,v.y*v.y,d.x*d.x,d.y*d.y);
    vec4 w0=max(vec4(0.),vec4(v.y+xx.x,-v.x+xx.y,-v.y+xx.x,v.x+xx.y)),w1=max(vec4(0.),vec4(d.y+xx.z,-d.x+xx.w,-d.y+xx.z,d.x+xx.w));
    w0*=w0;w1*=w1;
    // Sky taps carry no weight (alpha is the land mask).
    float g=c.a*exp(-3.125*dot(v,v))/max(dot(w0+w1,vec4(1.)),1e-6);
    w0*=g;w1*=g;
    vec4 q=vec4(c.rgb,1.);vec3 qq=c.rgb*c.rgb;
    ${K.map(k => `m${k}+=q*w${k % 2}.${'xyzw'[k >> 1]};s${k}+=qq*w${k % 2}.${'xyzw'[k >> 1]};`).join('')}
  }
  vec4 o=vec4(0.);
  ${K.map(k => `o+=sector(m${k},s${k},sharpness);`).join('')}
  gl_FragColor=vec4(o.w>1e-9?o.rgb/o.w:centre.rgb,1.);
}`;
// Impasto light from the upper left on the painted strokes' edges, then the linen.
const CANVAS = `uniform sampler2D paint,scene,depth;uniform vec2 texel,sceneTexel,clip,reach;uniform float dpr,impasto,relief,thread;uniform vec2 weave,steps,detail;varying vec2 vUv;
float h1(float x){return fract(sin(x*91.37)*43758.55);}
float h2(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.55);}
float L(vec4 c){return dot(c.rgb,vec3(.3,.59,.11));}
void main(){
  float d=texture(depth,vUv).r,land=d<${SKY_DEPTH}?1.:0.;
  float near=1.-smoothstep(reach.x,reach.y,clip.x*clip.y/(clip.y-d*(clip.y-clip.x)));
  vec4 c=texture(paint,vUv);
  // Land: the painted frame (upsampled smoothly when the filter runs small), with a share of the frame at full resolution
  // kept, more near by where the surfaces' own strokes read. Sky: the frame as drawn.
  vec3 drawn=texture(scene,vUv).rgb,col=land>.5?mix(c.rgb,drawn,mix(detail.x,detail.y,near)):drawn;
  vec4 e=texture(paint,vUv+vec2(texel.x,0.)),w=texture(paint,vUv-vec2(texel.x,0.)),n=texture(paint,vUv+vec2(0.,texel.y)),s=texture(paint,vUv-vec2(0.,texel.y));
  vec4 e2=texture(paint,vUv+vec2(texel.x,0.)*2.5),w2=texture(paint,vUv-vec2(texel.x,0.)*2.5),n2=texture(paint,vUv+vec2(0.,texel.y)*2.5),s2=texture(paint,vUv-vec2(0.,texel.y)*2.5);
  // Off within a few pixels of sky, and faded across large steps of tone (a form's edge, not a stroke's).
  float inland=land*min(min(min(e2.a,w2.a),min(n2.a,s2.a)),min(min(e.a,w.a),min(n.a,s.a)));
  // The relief: the painted strokes' edges and, near by, the surfaces' own finest strokes, which the filter flattened in colour.
  // Off where tone steps more than a stroke's edge does, over one pixel or a few (a form's edge, or mist on a far ridge).
  vec2 g=vec2(L(e)-L(w),L(n)-L(s))*.5,trend=vec2(L(e2)-L(w2),L(n2)-L(s2))*.2;
  vec2 fine=vec2(L(texture(scene,vUv+vec2(sceneTexel.x,0.)))-L(texture(scene,vUv-vec2(sceneTexel.x,0.))),
    L(texture(scene,vUv+vec2(0.,sceneTexel.y)))-L(texture(scene,vUv-vec2(0.,sceneTexel.y))))*.5;
  float fade=inland*(1.-smoothstep(steps.x,steps.y,max(length(g),length(trend))));
  g=clamp(g+fine*relief*near,-.02,.02)*fade;
  col*=clamp(1.+impasto*dot(g,vec2(.65,-.76)),.94,1.06);
  // Linen: an over/under weave of slightly uneven threads, set in CSS pixels so the cloth is the same at every pixel ratio.
  vec2 p=gl_FragCoord.xy/dpr;
  float hx=abs(sin(p.y*3.14159/thread)),vx=abs(sin(p.x*3.14159/thread));
  float over=step(0.,sin(p.x*3.14159/(2.*thread))*sin(p.y*3.14159/(2.*thread)));
  float th=mix(hx*(.8+.4*h1(floor(p.y/thread))),vx*(.8+.4*h1(floor(p.x/thread)+7.)),over);
  float depthOfWeave=mix(weave.y,weave.x,land);
  col*=1.+(th-.62)*depthOfWeave+(h2(floor(p))-.5)*depthOfWeave*.35;
  gl_FragColor=vec4(col,1.);
}`;

export class PainterlyPass {
  constructor(THREE, renderer) {
    this.renderer = renderer; this.scale = 1; this.pixelRatio = 1; this.width = 1; this.height = 1;
    // The scene target is marked as an XR target so three shades into it as it would into the canvas (tone mapping and the
    // sRGB output transfer in the shaders, not linear), and its storage is plain RGBA8 so the values are kept as encoded.
    this.depth = new THREE.DepthTexture(1, 1);
    this.sceneTarget = new THREE.WebGLRenderTarget(1, 1, {samples: 4, depthBuffer: true, depthTexture: this.depth, colorSpace: THREE.SRGBColorSpace});
    this.sceneTarget.texture.internalFormat = 'RGBA8'; this.sceneTarget.isXRRenderTarget = true;
    const flat = {depthBuffer: false, colorSpace: THREE.NoColorSpace};
    this.prepared = new THREE.WebGLRenderTarget(1, 1, flat);
    this.structure = new THREE.WebGLRenderTarget(1, 1, {...flat, type: THREE.HalfFloatType});
    this.painted = new THREE.WebGLRenderTarget(1, 1, flat);
    // The camera's clip planes (to read distance from depth) and the reach of the near strokes, shared by two passes.
    const clip = {value: new THREE.Vector2(.1, 4000)}, reach = {value: new THREE.Vector2(...REACH)};
    const material = (fragmentShader, uniforms) => new THREE.ShaderMaterial({vertexShader: QUAD_VERTEX, fragmentShader, uniforms, depthTest: false, depthWrite: false});
    this.prepare = material(PREPARE, {colour: {value: this.sceneTarget.texture}, depth: {value: this.depth}});
    this.tensor = material(TENSOR, {src: {value: this.prepared.texture}, texel: {value: new THREE.Vector2()}});
    this.kuwahara = material(KUWAHARA, {src: {value: this.prepared.texture}, tensor: {value: this.structure.texture}, depth: {value: this.depth},
      texel: {value: new THREE.Vector2()}, clip, reach,
      radius: {value: RADIUS}, sharpness: {value: SHARPNESS}});
    this.canvas = material(CANVAS, {paint: {value: this.painted.texture}, scene: {value: this.sceneTarget.texture}, depth: {value: this.depth},
      texel: {value: new THREE.Vector2()}, sceneTexel: {value: new THREE.Vector2()}, clip, reach, dpr: {value: 1}, impasto: {value: IMPASTO}, relief: {value: RELIEF}, thread: {value: THREAD},
      weave: {value: new THREE.Vector2(WEAVE_LAND, WEAVE_SKY)}, detail: {value: new THREE.Vector2(...DETAIL)}, steps: {value: new THREE.Vector2(...IMPASTO_STEP)}});
    // One triangle over the whole frame.
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    this.quad = new THREE.Mesh(this.geometry, this.canvas); this.quad.frustumCulled = false;
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }
  // width and height in CSS pixels; the targets are sized in device pixels, as the canvas is.
  setSize(width, height, pixelRatio) {
    this.width = Math.max(1, Math.floor(width * pixelRatio)); this.height = Math.max(1, Math.floor(height * pixelRatio)); this.pixelRatio = pixelRatio;
    this.sceneTarget.setSize(this.width, this.height); this.canvas.uniforms.sceneTexel.value.set(1 / this.width, 1 / this.height);
    this.resizeFilter();
  }
  // The filter's resolution as a share of the frame (1, or .6 on the light tier); its result is upsampled smoothly.
  setScale(scale) {
    if (scale === this.scale) return;
    this.scale = scale; this.resizeFilter();
  }
  resizeFilter() {
    const w = Math.max(1, Math.round(this.width * this.scale)), h = Math.max(1, Math.round(this.height * this.scale));
    for (const target of [this.prepared, this.structure, this.painted]) target.setSize(w, h);
    for (const m of [this.tensor, this.kuwahara]) m.uniforms.texel.value.set(1 / w, 1 / h);
    this.canvas.uniforms.texel.value.set(1 / w, 1 / h);
    this.kuwahara.uniforms.radius.value = RADIUS * this.pixelRatio * this.scale;
    this.canvas.uniforms.detail.value.y = this.scale < 1 ? LIGHT_NEAR_DETAIL : DETAIL[1];
    this.canvas.uniforms.dpr.value = this.pixelRatio;
  }
  render(scene, camera) {
    const {renderer} = this;
    this.kuwahara.uniforms.clip.value.set(camera.near, camera.far);
    renderer.setRenderTarget(this.sceneTarget); renderer.render(scene, camera);
    this.draw(this.prepare, this.prepared); this.draw(this.tensor, this.structure); this.draw(this.kuwahara, this.painted);
    this.draw(this.canvas, null);
  }
  draw(material, target) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target); this.renderer.render(this.quad, this.camera);
  }
  dispose() {
    for (const target of [this.sceneTarget, this.prepared, this.structure, this.painted]) target.dispose();
    this.depth.dispose(); this.geometry.dispose();
    for (const m of [this.prepare, this.tensor, this.kuwahara, this.canvas]) m.dispose();
  }
}
