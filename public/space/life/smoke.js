import {smokePuffs} from '../../../shared/cottage.js';
import {smokePlace} from '../../../shared/lakeside-life.js';

// The hearth's smoke above the chimney: the same puffs the 2D painting draws, each a soft viewer-facing quad that rises, drifts
// south with the wind, wanders more as it ages and swells as it thins. Each puff's edge is broken by a few octaves of value noise,
// offset by its own seed and turning slowly with its age, so neighbours differ and the column reads as puffs, not a tube. It fogs
// like the cottage behind it. A study, reduced motion or a cottage this cannot read shows none. three.js is handed in, so this
// runs in Node. It is clipped by renderer.clippingPlanes, like the yard it rises over.

const COUNT = 16, TINT = [209 / 255, 206 / 255, 188 / 255], BOOST = 9, CAP = .45;
const toThree = ([x, y, z]) => [x, z, -y];
const VERTEX = `varying vec2 vUv;
#include <fog_pars_vertex>
#include <clipping_planes_pars_vertex>
void main(){vUv=uv;vec4 mvPosition=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mvPosition;
#include <clipping_planes_vertex>
#include <fog_vertex>
}`;
const FRAGMENT = `uniform vec3 tint;uniform float opacity,seed,age;varying vec2 vUv;
#include <common>
#include <fog_pars_fragment>
#include <clipping_planes_pars_fragment>
float cell(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float value(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
return mix(mix(cell(i),cell(i+vec2(1.,0.)),f.x),mix(cell(i+vec2(0.,1.)),cell(i+vec2(1.)),f.x),f.y);}
void main(){
#include <clipping_planes_fragment>
vec2 c=vUv-.5;float d=length(c)*2.;if(d>=1.)discard;
float t=age*1.6+seed*6.2831853,s=sin(t),k=cos(t);vec2 p=mat2(k,s,-s,k)*c*2.6+seed*vec2(37.,17.);
float n=.5*value(p)+.28*value(p*2.03+3.1)+.14*value(p*4.1+7.7)+.08*value(p*8.2+1.3);
float a=opacity*.7*(1.-smoothstep(.1,1.,d))*smoothstep(.44,.8,n+.2*(1.-d));if(a<=0.)discard;
gl_FragColor=vec4(tint,min(a,1.));
#include <fog_fragment>
}`;

export function createSmoke(THREE, ctx) {
  const {scene, layout} = ctx, geometry = new THREE.PlaneGeometry(2, 2);
  const group = new THREE.Group(); group.name = 'hearth-smoke'; scene.add(group);
  const pool = Array.from({length: COUNT}, () => {
    const material = new THREE.ShaderMaterial({vertexShader: VERTEX, fragmentShader: FRAGMENT, transparent: true, depthWrite: false, fog: true, clipping: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {tint: {value: new THREE.Color(...TINT)}, opacity: {value: 0}, seed: {value: 0}, age: {value: 0}}])});
    const mesh = new THREE.Mesh(geometry, material);
    mesh.visible = false; mesh.renderOrder = 10; mesh.frustumCulled = false; group.add(mesh);
    return mesh;
  });
  const hide = () => { for (const mesh of pool) mesh.visible = false; };
  return {
    update(frame) {
      const puffs = frame.study || !frame.motion ? [] : smokePuffs(frame.snapshot?.world?.cottage, frame.epoch, frame.now);
      if (!puffs.length) { hide(); return false; }
      const shade = .3 + .7 * frame.calendar.light;
      pool.forEach((mesh, i) => {
        const puff = puffs[i];
        mesh.visible = !!puff;
        if (!puff) return;
        const {position, radius, alpha, seed} = smokePlace(puff, layout);
        mesh.position.set(...toThree(position)); mesh.scale.setScalar(radius);
        if (frame.camera?.quaternion) mesh.quaternion.copy(frame.camera.quaternion);
        const u = mesh.material.uniforms;
        u.tint.value.setRGB(TINT[0] * shade, TINT[1] * shade, TINT[2] * shade); u.opacity.value = Math.min(alpha * BOOST, CAP);
        u.seed.value = seed; u.age.value = puff.age;
      });
      return true;
    },
    // Turns the puffs to face `camera`, leaving where they are and how far on they are as the last update left them.
    aim(camera) { if (camera?.quaternion) for (const mesh of pool) if (mesh.visible) mesh.quaternion.copy(camera.quaternion); },
    dispose() {
      scene.remove(group); geometry.dispose();
      for (const mesh of pool) mesh.material.dispose();
    },
  };
}
