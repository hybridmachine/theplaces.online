import {ceilingHeight} from '../../../shared/interior.js';
import {mergeGeometries, toThree, tube} from '../geometry.js';
import {haloMaterial} from '../scene/lights.js';
import {lightSum} from '../../../shared/interior-light.js';

// The lamp in every room (the blueprint's interior.fittings, one per room, `at` the glass's centre [a, d, z], z above the ground
// floor). A hanging lamp is a thin dark rod from the ceiling over its place down to a small shade over the glass; a wall lamp is a
// short dark bracket from its room's nearest wall line to a cup holding the glass. The ironwork is built here from tubes, weighed
// by the light field at the glass (so it takes its own room's lamp and a neighbour's spill, as a wall there would) and tinted dark through the shell's boards tint;
// it draws with the shell's surface material, lit or the Lambert fallback. The glasses are one instanced mesh and the halos one
// merged mesh (in `overlay`, which the view draws after the live windows), both emitted and none of it a light source: each glass takes its colour from its room's level, set per instance, and
// each halo ball carries its room's index to read that level from a small uniform array, so a frame sets a number per room and
// the cost does not follow the rooms lit. Interior frame [a, d, z]; three x = a, y = z, z = −d.

const IRON = .5;                                   // how much of the boards' tint the ironwork keeps (linear)
const GLASS = {radius: .06, height: .16};          // the glass, a short upright cylinder about `at`
// Linear: an unlit glass is a pale surface, PALE times the room's light where it hangs (dim and bluish at night, pale by day); lit, it
// glows WARM whatever the light (above 1 so it blooms).
const PALE = [1.3, 1.24, 1.08], WARM = [2.4, 1.45, .6];
const HALO = {radius: .18, opacity: .55, reach: .24};   // each halo is a ball about the glass; added over the room. A wall lamp's ball ends within `reach` of the wall's face (a walking eye stays .25 off it)
const ROD = .012, SHADE = {radius: .12, from: .09, top: .2}, ARM = .018, CUP = {radius: .07, low: .1};
const clamp01 = x => Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0;

export function buildFittings(THREE, {interior: I, light, field, tints, materials}) {
  const rise = I.floorRise, n = I.fittings.length, roomIndex = new Map(I.rooms.map((r, i) => [r.id, i]));
  const merged = list => { const g = mergeGeometries(THREE, list); for (const x of list) x.dispose(); return g; };
  const object = new THREE.Group(); object.name = 'fittings';

  // ── the ironwork, one group a fitting ──
  const owned = [];
  const tube6 = points => tube(THREE, points, {sides: 6});
  // A hanging lamp: the rod from the ceiling over `at` down to the shade's tip, and the shade, a cone over the glass.
  const hanging = ([a, d, z], r) => [
    tube6([[a, d, r.floor * rise + ceilingHeight(I, r.floor, d), ROD], [a, d, z + SHADE.top - .005, ROD]]),
    tube6([[a, d, z + SHADE.from, SHADE.radius], [a, d, z + (SHADE.from + SHADE.top) / 2, SHADE.radius * .55], [a, d, z + SHADE.top, .001]])];
  // A wall lamp: a bracket from the nearest wall line level with the glass, a small plate on the wall and the cup under the glass.
  // The wall line nearest a fitting, [axis, line]: axis 0 a line of constant a, 1 one of constant d.
  const nearestWall = ([a, d], r) => {
    const lines = [[0, r.a[0]], [0, r.a[1]], [1, r.d[0]], [1, r.d[1]]], gap = ([axis, at]) => Math.abs((axis ? d : a) - at);
    return lines.reduce((best, l) => gap(l) < gap(best) ? l : best);
  };
  const wall = ([a, d, z], r) => {
    const [axis, line] = nearestWall([a, d], r), sign = (axis ? d : a) > line ? 1 : -1, onWall = (off = 0) => axis ? [a, line + sign * off, z] : [line + sign * off, d, z];
    return [tube6([[...onWall(), ARM], [a, d, z, ARM]]), tube6([[...onWall(), .05], [...onWall(.03), .05]]),
      tube6([[a, d, z - CUP.low, ARM], [a, d, z - GLASS.height / 2 - .01, CUP.radius], [a, d, z - GLASS.height / 2 + .02, CUP.radius * .9]])];
  };
  // A halo's radius: the ball's, or for a wall lamp as much of it as keeps its surface within HALO.reach of the wall's face.
  const haloRadius = (f, r) => {
    if (f.kind !== 'wall') return HALO.radius;
    const [axis, line] = nearestWall(f.at, r);
    return Math.min(HALO.radius, HALO.reach - (Math.abs(f.at[axis] - line) - I.wall / 2));
  };
  const dark = list => {
    for (const g of list) { const p = g.getAttribute('position'), c = g.getAttribute('color'); for (let i = 0; i < c.count; i++) c.setXYZ(i, ...tints.boards([p.getX(i), -p.getZ(i), p.getY(i)]).map(v => v * IRON)); }
    return list;
  };
  // Each vertex's light: the field at the glass (inside the room) and the vertex's own normal.
  const weighed = (g, [a, d, z]) => {
    const nrm = g.getAttribute('normal'), out = new Float32Array(nrm.count * 4), spill = new Float32Array(nrm.count * 2), floor = z >= rise - 1e-6 ? 1 : 0;
    for (let i = 0; i < nrm.count; i++) { const w = field.weigh(floor, [a, d, z], [nrm.getX(i), -nrm.getZ(i), nrm.getY(i)]); out.set([w.day, w.lamp, w.fire, w.room], i * 4); spill.set([w.spill, w.spillRoom], i * 2); }
    g.setAttribute('light', new THREE.Float32BufferAttribute(out, 4)); g.setAttribute('spill', new THREE.Float32BufferAttribute(spill, 2));
    return g;
  };
  for (const f of I.fittings) {
    const r = I.rooms.find(x => x.id === f.room), group = new THREE.Group(); group.name = `lamp-${f.room}`;
    const geometry = merged(dark((f.kind === 'hanging' ? hanging : wall)(f.at, r)));
    if (light) weighed(geometry, f.at);
    const m = new THREE.Mesh(geometry, materials.surface); m.name = 'ironwork'; group.add(m); object.add(group);
  }

  // ── the glasses: one instanced mesh, each instance's colour its room's level ──
  const glassGeometry = new THREE.CylinderGeometry(GLASS.radius, GLASS.radius, GLASS.height, 10);
  const glassMaterial = new THREE.MeshBasicMaterial({fog: false});
  const glasses = new THREE.InstancedMesh(glassGeometry, glassMaterial, n); glasses.name = 'glasses';
  const matrix = new THREE.Matrix4();
  I.fittings.forEach((f, k) => { glasses.setMatrixAt(k, matrix.makeTranslation(...toThree(f.at))); glasses.setColorAt(k, new THREE.Color()); });
  glasses.frustumCulled = false; object.add(glasses);

  // ── the halos: one merged mesh of balls, each vertex carrying its room's index; the standard halo shader, its added light scaled
  //    by that room's entry in `levels` ──
  const balls = I.fittings.map(f => {
    const g = new THREE.IcosahedronGeometry(haloRadius(f, I.rooms.find(x => x.id === f.room)), 3); g.translate(...toThree(f.at));
    g.setAttribute('lampRoom', new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count).fill(roomIndex.get(f.room)), 1));
    return g;
  });
  const levels = new Float32Array(Math.max(1, I.rooms.length));
  let first = true;   // the glasses' colours are written the first time whatever the levels
  // The room's light where each glass hangs, but for its own lamp: its day, fire and spill weights, weighed once at the glass and
  // averaged over four sideways facings (the spill as the neighbour that gives the most gives it), and the frame's sum of them
  // (setLight, by lightSum, the one sum), by which an unlit glass is lit like any pale surface.
  const sideways = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0]], mean = (ws, k) => ws.reduce((t, w) => t + w[k], 0) / ws.length;
  const atGlass = I.fittings.map(f => { const ws = sideways.map(nrm => field.weigh(f.at[2] >= rise - 1e-6 ? 1 : 0, f.at, nrm));
    const spillRoom = ws.reduce((b, w) => w.spill > b.spill ? w : b).spillRoom;
    return {day: mean(ws, 'day'), fire: mean(ws, 'fire'), lamp: 0, room: -1, spillRoom, spill: mean(ws.map(w => w.spillRoom === spillRoom ? w : {spill: 0}), 'spill')}; });
  const ambient = new Float32Array(n * 3).fill(1); let ambientChanged = false;
  const finite = v => Number.isFinite(v) ? v : 0;
  const haloMat = haloMaterial(THREE); haloMat.uniforms.opacity.value = HALO.opacity; haloMat.uniforms.levels = {value: levels};
  // Each replacement must take: a halo shader that no longer matches would otherwise draw every halo at one constant opacity.
  const patched = (text, from, to) => { const out = text.replace(from, to); if (out === text) throw new Error(`The halo shader no longer has ${from}`); return out; };
  haloMat.onBeforeCompile = shader => {
    shader.vertexShader = patched(patched(shader.vertexShader, 'varying vec3 vNormal, vView;', `varying vec3 vNormal, vView; varying float vLevel;
attribute float lampRoom; uniform float levels[${levels.length}];`),
      'vNormal = normalMatrix * normal;', `vLevel = levels[ int( lampRoom + 0.5 ) ]; vNormal = normalMatrix * normal;`);
    shader.fragmentShader = patched(patched(shader.fragmentShader, 'varying vec3 vNormal, vView;', 'varying vec3 vNormal, vView; varying float vLevel;'), 'vec4( glow, opacity *', 'vec4( glow, opacity * vLevel *');
  };
  haloMat.customProgramCacheKey = () => `fitting-halos-${levels.length}`;
  // Added light, so in `overlay`, which the view draws after the yard seen through the live panes (see buildInterior).
  const overlay = new THREE.Group(); overlay.name = 'lamp-light';
  const halos = new THREE.Mesh(merged(balls), haloMat); halos.name = 'halos'; halos.frustumCulled = false; overlay.add(halos);

  // A frame's lamp levels, a number per room in interior.rooms order (a fully lit room is about 1.1; 1 and over is fully lit); a
  // room not named is out. Writes into the existing arrays: nothing is allocated, and nothing is uploaded when no level changed.
  function setLamps(given) {
    const colours = glasses.instanceColor.array; let any = false, changed = ambientChanged;
    for (let i = 0; i < levels.length; i++) { const v = Math.fround(clamp01(given?.[i])); changed ||= v !== levels[i]; levels[i] = v; }
    if (!changed && !first) return;
    first = false; ambientChanged = false;
    for (let k = 0; k < n; k++) {
      const level = levels[roomIndex.get(I.fittings[k].room)]; any ||= level > 0;
      for (let c = 0; c < 3; c++) colours[k * 3 + c] = PALE[c] * ambient[k * 3 + c] * (1 - level) + WARM[c] * level;
    }
    glasses.instanceColor.needsUpdate = true; halos.visible = any;
  }
  // A frame's dials (interiorDials): the room's light at each glass (daylight, the night fill and the fire, not its own lamp), then the
  // lamps. Nothing is allocated.
  // The dials as lightSum reads them, every value finite (a missing one is 0): refilled each frame, nothing allocated.
  const safe = {day: [0, 0, 0], fill: [0, 0, 0], fire: 0, lamps: new Float64Array(I.rooms.length)};
  function setLight(dials) {
    for (let c = 0; c < 3; c++) { safe.day[c] = finite(dials?.day?.[c]); safe.fill[c] = finite(dials?.fill?.[c]); }
    safe.fire = finite(dials?.fire); for (let i = 0; i < safe.lamps.length; i++) safe.lamps[i] = finite(dials?.lamps?.[i]);
    for (let k = 0; k < n; k++) for (let c = 0; c < 3; c++) {
      const v = Math.fround(lightSum(safe, atGlass[k], c));
      if (v !== ambient[k * 3 + c]) { ambient[k * 3 + c] = v; ambientChanged = true; }
    }
    setLamps(dials?.lamps);
  }
  setLamps();
  // The lit surfaces given up (buildInterior's fallBack): the ironwork takes the shell's flat surface; glasses and halos carry on.
  function fallBack(flat) { object.traverse(o => { if (o.name === 'ironwork') o.material = flat.surface; }); }
  return {object, overlay, setLamps, setLight, fallBack, dispose() {
    object.traverse(o => o.geometry?.dispose()); halos.geometry.dispose(); glassMaterial.dispose(); haloMat.dispose(); glasses.dispose();
  }};
}
