import {smokePuffs} from '../../../shared/cottage.js';
import {smokePlace} from '../../../shared/lakeside-life.js';

// The hearth's smoke above the chimney: the same puffs the 2D painting draws, each a soft round viewer-facing quad that rises,
// drifts south with the wind and swells as it thins. A study, reduced motion or a cottage this cannot read shows none.
// three.js is handed in, so this runs in Node.

const COUNT = 16, TINT = [209 / 255, 206 / 255, 188 / 255], BOOST = 9, CAP = .45;
const toThree = ([x, y, z]) => [x, z, -y];
const VERTEX = `varying vec2 vUv;
void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const FRAGMENT = `uniform vec3 tint;uniform float opacity;varying vec2 vUv;
void main(){float d=length(vUv-.5)*2.;float a=opacity*(1.-smoothstep(0.,1.,d));if(a<=0.)discard;gl_FragColor=vec4(tint,a);}`;

export function createSmoke(THREE, ctx) {
  const {scene, layout} = ctx, geometry = new THREE.PlaneGeometry(2, 2);
  const group = new THREE.Group(); group.name = 'hearth-smoke'; scene.add(group);
  const pool = Array.from({length: COUNT}, () => {
    const material = new THREE.ShaderMaterial({vertexShader: VERTEX, fragmentShader: FRAGMENT, transparent: true, depthWrite: false,
      uniforms: {tint: {value: new THREE.Color(...TINT)}, opacity: {value: 0}}});
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
        const {position, radius, alpha} = smokePlace(puff, layout);
        mesh.position.set(...toThree(position)); mesh.scale.setScalar(radius);
        if (frame.camera?.quaternion) mesh.quaternion.copy(frame.camera.quaternion);
        const {tint, opacity} = mesh.material.uniforms;
        tint.value.setRGB(TINT[0] * shade, TINT[1] * shade, TINT[2] * shade); opacity.value = Math.min(alpha * BOOST, CAP);
      });
      return true;
    },
    dispose() {
      scene.remove(group); geometry.dispose();
      for (const mesh of pool) mesh.material.dispose();
    },
  };
}
