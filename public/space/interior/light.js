import {DIALS} from '../../../shared/interior-light.js';

// The cabin's painted-in light: no light source, only each surface's colour times the frame's dials summed by the weights its
// vertices carry. Every vertex has a `light` attribute (day, lamp, fire, room index; shared/interior-light.js's weigh), and the
// vertex shader forms vLight = day × light.x + fill + warm × lamps[room] × light.y + fireWarm × fire × light.z, as lightAt does in
// JS; a room index of −1 takes no lamp. The fragment multiplies the basic material's diffuse colour (its map times its vertex
// tint, plus the material's own pale `base` if it has one: plaster's ground under its brushwork, as the flat light's emissive was)
// by vLight, before three's tone mapping and colour space, so the painterly pass sees what it always has. Every material shares
// one set of uniforms, so a frame's light is set once whatever the number of rooms or surfaces. Colours are linear.

// Spliced into three 0.170's MeshBasicMaterial: declarations after <common>, the sum after <color_vertex> in main (so its result
// sits beside vColor), and the product after <color_fragment>, where diffuseColor already holds the map and the vertex tint.
const vertexDeclarations = rooms => `
uniform vec3 day;
uniform vec3 fill;
uniform vec3 warm;
uniform vec3 fireWarm;
uniform float lamps[${rooms}];
uniform float fire;
attribute vec4 light;
varying vec3 vLight;`;
const vertexSum = rooms => `
	float roomLamp = 0.0;
	if ( light.w > -0.5 ) roomLamp = lamps[ int( clamp( light.w, 0.0, ${rooms - 1}.0 ) + 0.5 ) ];
	vLight = day * light.x + fill + warm * ( roomLamp * light.y ) + fireWarm * ( fire * light.z );`;

export function createInteriorLight(THREE, {rooms}) {
  const n = Math.max(1, rooms | 0), made = new Set();
  const uniforms = {day: {value: new THREE.Vector3()}, fill: {value: new THREE.Vector3()}, lamps: {value: new Float32Array(n)}, fire: {value: 0},
    warm: {value: new THREE.Vector3(...DIALS.warm)}, fireWarm: {value: new THREE.Vector3(...DIALS.fireWarm)}};
  const glsl = v => v.map(x => Number(x).toFixed(4)).join(', ');
  const patch = base => shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>${vertexDeclarations(n)}`)
      .replace('#include <color_vertex>', `#include <color_vertex>${vertexSum(n)}`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vLight;')
      .replace('#include <color_fragment>', base ? `#include <color_fragment>\n\tdiffuseColor.rgb = ( diffuseColor.rgb + vec3( ${glsl(base)} ) ) * vLight;`
        : '#include <color_fragment>\n\tdiffuseColor.rgb *= vLight;');
  };
  return {uniforms,
    // A basic material with vertex colours, lit by the weights; `base` (linear [r, g, b], optional) is added to its map and tint before
    // the light; the other `options` pass through (map, side, stencil settings and the rest). Materials with one base share a program.
    material({base = null, ...options} = {}) {
      const m = new THREE.MeshBasicMaterial({...options, vertexColors: true}), key = `interior-light-${n}${base ? `-base-${glsl(base)}` : ''}`;
      m.onBeforeCompile = patch(base); m.customProgramCacheKey = () => key;
      made.add(m); return m;
    },
    // A frame's dials (shared/interior-light.js's interiorDials) into the shared uniforms; a room the dials do not name is dark.
    set({day, fill, lamps, fire}) {
      uniforms.day.value.set(...day); uniforms.fill.value.set(...fill);
      for (let i = 0; i < n; i++) uniforms.lamps.value[i] = lamps[i] ?? 0;
      uniforms.fire.value = fire;
    },
    dispose() { for (const m of made) m.dispose(); made.clear(); }};
}
