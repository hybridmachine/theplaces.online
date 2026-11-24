// Which rooms of a cabin interior can be seen from which, worked out from the blueprint's rooms, openings and stair alone.
// Pure: no three.js. Generous: furniture is ignored and each opening's span is widened by SIGHT.widen at each end.
import {roomAt} from './interior.js';

export const SIGHT = Object.freeze({grid: .5, door: .1, widen: .1});

const EPS = 1e-9;
const NUDGE = 1e-3;
const pairKey = (a, b) => a < b ? `${a}\0${b}` : `${b}\0${a}`;

function samplesOf(I, room, ops) {
  const inset = I.eyeClear, step = SIGHT.grid;
  const axis = ([lo, hi]) => {
    const a = lo + inset, b = hi - inset;
    if (a > b + EPS) return [(lo + hi) / 2];
    const out = [];
    for (let v = a; v <= b + EPS; v += step) out.push(Math.min(v, b));
    if (out[out.length - 1] < b - EPS) out.push(b);
    return out;
  };
  const pts = [];
  for (const a of axis(room.a)) for (const d of axis(room.d)) pts.push([a, d]);
  // Each opening's own span, just inside the room, every SIGHT.door: any line of sight out of the room crosses one of its openings,
  // and a sampled line within half a step of it still passes each doorway on the way, as their spans are widened by more than that.
  for (const o of ops) {
    const [lo, hi] = o.span, n = Math.max(1, Math.ceil((hi - lo) / SIGHT.door - EPS));
    const lines = o.line === 'a' ? room.a : room.d, across = Math.abs(o.at - lines[0]) < EPS ? o.at + NUDGE : o.at - NUDGE;
    for (let k = 0; k <= n; k++) { const along = lo + (hi - lo) * k / n; pts.push(o.line === 'a' ? [across, along] : [along, across]); }
  }
  return pts;
}

function exitsThroughOpening(room, ops, p, q) {
  const da = q[0] - p[0], dd = q[1] - p[1];
  const ta = da > EPS ? (room.a[1] - p[0]) / da : da < -EPS ? (room.a[0] - p[0]) / da : Infinity;
  const td = dd > EPS ? (room.d[1] - p[1]) / dd : dd < -EPS ? (room.d[0] - p[1]) / dd : Infinity;
  if (Math.abs(ta - td) < 1e-6) return true;
  if (ta < td) {
    const at = da > 0 ? room.a[1] : room.a[0], along = p[1] + ta * dd;
    return ops.some(o => o.line === 'a' && Math.abs(o.at - at) < 1e-6 && along >= o.lo && along <= o.hi);
  }
  const at = dd > 0 ? room.d[1] : room.d[0], along = p[0] + td * da;
  return ops.some(o => o.line === 'd' && Math.abs(o.at - at) < 1e-6 && along >= o.lo && along <= o.hi);
}

function clearLine(I, floor, xs, ys, pairOps, p, q) {
  const da = q[0] - p[0], dd = q[1] - p[1], raw = [0, 1];
  if (Math.abs(da) > EPS) for (const x of xs) { const t = (x - p[0]) / da; if (t > EPS && t < 1 - EPS) raw.push(t); }
  if (Math.abs(dd) > EPS) for (const y of ys) { const t = (y - p[1]) / dd; if (t > EPS && t < 1 - EPS) raw.push(t); }
  raw.sort((a, b) => a - b);
  const ts = [raw[0]];
  for (let i = 1; i < raw.length; i++) if (raw[i] - ts[ts.length - 1] > 1e-7) ts.push(raw[i]);
  let prev = null;
  for (let i = 0; i < ts.length - 1; i++) {
    const mid = (ts[i] + ts[i + 1]) / 2;
    const cur = roomAt(I, floor, [p[0] + mid * da, p[1] + mid * dd]);
    if (!cur) return false;
    if (prev && prev.id !== cur.id) {
      const ops = pairOps.get(pairKey(prev.id, cur.id));
      if (!ops) return false;
      const ca = p[0] + ts[i] * da, cd = p[1] + ts[i] * dd;
      const ok = ops.some(o => {
        const [across, along] = o.line === 'a' ? [ca, cd] : [cd, ca];
        return Math.abs(across - o.at) < 1e-6 && along >= o.lo && along <= o.hi;
      });
      if (!ok) return false;
    }
    prev = cur;
  }
  return true;
}

export function seenFrom(I) {
  const rooms = I.rooms, openings = I.openings || [];
  const adj = new Map(rooms.map(r => [r.id, new Set([r.id])]));
  const link = (a, b) => { adj.get(a)?.add(b); adj.get(b)?.add(a); };
  const roomOps = new Map(rooms.map(r => [r.id, []]));
  const pairOps = new Map();
  for (const o of openings) {
    const w = {...o, lo: o.span[0] - SIGHT.widen - EPS, hi: o.span[1] + SIGHT.widen + EPS};
    link(o.rooms[0], o.rooms[1]);
    roomOps.get(o.rooms[0])?.push(w);
    roomOps.get(o.rooms[1])?.push(w);
    const k = pairKey(o.rooms[0], o.rooms[1]);
    if (!pairOps.has(k)) pairOps.set(k, []);
    pairOps.get(k).push(w);
  }
  for (const floor of [0, 1]) {
    const onFloor = rooms.filter(r => r.floor === floor);
    const xs = [...new Set(onFloor.flatMap(r => r.a))].sort((a, b) => a - b);
    const ys = [...new Set(onFloor.flatMap(r => r.d))].sort((a, b) => a - b);
    const samples = new Map(onFloor.map(r => [r.id, samplesOf(I, r, roomOps.get(r.id))]));
    for (let i = 0; i < onFloor.length; i++) {
      const ra = onFloor[i], opsA = roomOps.get(ra.id), ptsA = samples.get(ra.id);
      for (let j = i + 1; j < onFloor.length; j++) {
        const rb = onFloor[j];
        if (adj.get(ra.id).has(rb.id)) continue;
        const opsB = roomOps.get(rb.id), ptsB = samples.get(rb.id);
        let found = false;
        for (let ia = 0; ia < ptsA.length && !found; ia++) {
          const p = ptsA[ia];
          for (let ib = 0; ib < ptsB.length; ib++) {
            const q = ptsB[ib];
            if (!exitsThroughOpening(ra, opsA, p, q) || !exitsThroughOpening(rb, opsB, q, p)) continue;
            if (clearLine(I, floor, xs, ys, pairOps, p, q)) { found = true; break; }
          }
        }
        if (found) link(ra.id, rb.id);
      }
    }
  }
  if (I.stair) {
    const stairRoom = floor => rooms.find(r => r.floor === floor
      && I.stair.a[0] >= r.a[0] - EPS && I.stair.a[1] <= r.a[1] + EPS
      && I.stair.d[0] >= r.d[0] - EPS && I.stair.d[1] <= r.d[1] + EPS);
    const s0 = stairRoom(0), s1 = stairRoom(1);
    if (s0 && s1) {
      const from0 = rooms.filter(r => r.floor === 0 && adj.get(r.id).has(s0.id));
      const from1 = rooms.filter(r => r.floor === 1 && adj.get(r.id).has(s1.id));
      for (const a of from0) for (const b of from1) link(a.id, b.id);
    }
  }
  const order = rooms.map(r => r.id);
  const out = {};
  for (const r of rooms) {
    const set = adj.get(r.id);
    out[r.id] = Object.freeze(order.filter(id => set.has(id)));
  }
  return Object.freeze(out);
}

// Each opening as a box in the interior frame [a, d, z], stored under both of its rooms:
// span along the wall, the outside half of the wall's thickness (from the opening's line to the neighbour's face,
// which every sight line into the room from outside must cross), and floor to doorHead in height.
// Each room's box list is also paired (via a WeakMap) with the neighbour room on the far side of each opening.
const BOX_OTHERS = new WeakMap();

export function doorBoxes(I) {
  const half = I.wall / 2;
  const byId = new Map((I.rooms || []).map(r => [r.id, r]));
  const byRoom = new Map((I.rooms || []).map(r => [r.id, []]));
  const othersByRoom = new Map((I.rooms || []).map(r => [r.id, []]));
  for (const o of I.openings || []) {
    const along = Object.freeze([o.span[0], o.span[1]]);
    const z0 = (o.floor || 0) * I.floorRise;
    const z = Object.freeze([z0, z0 + I.doorHead]);
    for (let i = 0; i < o.rooms.length; i++) {
      const id = o.rooms[i], other = o.rooms[1 - i] ?? null, room = byId.get(id);
      const span = room ? (o.line === 'a' ? room.a : room.d) : null;
      const across = span && Math.abs(o.at - span[0]) < EPS ? Object.freeze([o.at - half, o.at])
        : span && Math.abs(o.at - span[1]) < EPS ? Object.freeze([o.at, o.at + half])
        : Object.freeze([o.at - half, o.at + half]);
      const box = Object.freeze(o.line === 'a' ? {a: across, d: along, z} : {a: along, d: across, z});
      if (!byRoom.has(id)) { byRoom.set(id, []); othersByRoom.set(id, []); }
      byRoom.get(id).push(box);
      othersByRoom.get(id).push(other);
    }
  }
  const out = {}, others = {};
  for (const [id, list] of byRoom) {
    out[id] = Object.freeze(list);
    others[id] = Object.freeze(othersByRoom.get(id));
  }
  const frozen = Object.freeze(out);
  BOX_OTHERS.set(frozen, others);
  return frozen;
}

function capPolygon(cuts, na, nd, nz) {
  const uniq = [];
  for (const p of cuts) {
    if (!uniq.some(q => Math.abs(p[0] - q[0]) < 1e-7 && Math.abs(p[1] - q[1]) < 1e-7 && Math.abs(p[2] - q[2]) < 1e-7)) uniq.push(p);
  }
  if (uniq.length < 3) return null;
  let ca = 0, cd = 0, cz = 0;
  for (const p of uniq) { ca += p[0]; cd += p[1]; cz += p[2]; }
  ca /= uniq.length; cd /= uniq.length; cz /= uniq.length;
  const nl = Math.hypot(na, nd, nz) || 1, u = [na / nl, nd / nl, nz / nl];
  const ref = Math.abs(u[2]) > .9 ? [1, 0, 0] : [0, 0, 1];
  const bx0 = ref[1] * u[2] - ref[2] * u[1], bx1 = ref[2] * u[0] - ref[0] * u[2], bx2 = ref[0] * u[1] - ref[1] * u[0];
  const bl = Math.hypot(bx0, bx1, bx2) || 1, bx = [bx0 / bl, bx1 / bl, bx2 / bl];
  const by = [u[1] * bx[2] - u[2] * bx[1], u[2] * bx[0] - u[0] * bx[2], u[0] * bx[1] - u[1] * bx[0]];
  return uniq
    .map(p => {
      const da = p[0] - ca, dd = p[1] - cd, dz = p[2] - cz;
      return [Math.atan2(da * by[0] + dd * by[1] + dz * by[2], da * bx[0] + dd * bx[1] + dz * bx[2]), p];
    })
    .sort((x, y) => x[0] - y[0])
    .map(x => x[1]);
}

// True when `box` intersects the region where every plane [na, nd, nz, c] has na*a + nd*d + nz*z + c >= 0.
// Missing, empty or non-finite planes hide nothing.
export function boxInView(box, planes) {
  if (!Array.isArray(planes) || !planes.length || !box) return true;
  for (let i = 0; i < planes.length; i++) {
    const p = planes[i];
    if (!Array.isArray(p) || p.length < 4 || !Number.isFinite(p[0]) || !Number.isFinite(p[1]) || !Number.isFinite(p[2]) || !Number.isFinite(p[3])) return true;
  }
  const [a0, a1] = box.a, [d0, d1] = box.d, [z0, z1] = box.z;
  let allIn = true, sa = 0, sd = 0, sz = 0, sc = 0;
  for (let i = 0; i < planes.length; i++) {
    const [na, nd, nz, c] = planes[i];
    sa += na; sd += nd; sz += nz; sc += c;
    const hi = na * (na >= 0 ? a1 : a0) + nd * (nd >= 0 ? d1 : d0) + nz * (nz >= 0 ? z1 : z0) + c;
    if (hi < -EPS) return false;
    const lo = na * (na >= 0 ? a0 : a1) + nd * (nd >= 0 ? d0 : d1) + nz * (nz >= 0 ? z0 : z1) + c;
    if (lo < -EPS) allIn = false;
  }
  if (allIn) return true;
  // Positive sum of all planes is also valid for every interior point; rejects boxes strictly behind the camera apex in O(1).
  if (sa * (sa >= 0 ? a1 : a0) + sd * (sd >= 0 ? d1 : d0) + sz * (sz >= 0 ? z1 : z0) + sc < -EPS) return false;
  let faces = [
    [[a0, d0, z0], [a0, d1, z0], [a0, d1, z1], [a0, d0, z1]],
    [[a1, d0, z0], [a1, d0, z1], [a1, d1, z1], [a1, d1, z0]],
    [[a0, d0, z0], [a1, d0, z0], [a1, d0, z1], [a0, d0, z1]],
    [[a0, d1, z0], [a0, d1, z1], [a1, d1, z1], [a1, d1, z0]],
    [[a0, d0, z0], [a0, d1, z0], [a1, d1, z0], [a1, d0, z0]],
    [[a0, d0, z1], [a1, d0, z1], [a1, d1, z1], [a0, d1, z1]],
  ];
  for (let i = 0; i < planes.length; i++) {
    const [na, nd, nz, c] = planes[i];
    const next = [], cuts = [];
    for (const poly of faces) {
      const out = [], n = poly.length;
      for (let k = 0; k < n; k++) {
        const p = poly[k], q = poly[(k + 1) % n];
        const dp = na * p[0] + nd * p[1] + nz * p[2] + c;
        const dq = na * q[0] + nd * q[1] + nz * q[2] + c;
        const pIn = dp >= -EPS, qIn = dq >= -EPS;
        if (pIn) { out.push(p); if (Math.abs(dp) <= EPS) cuts.push(p); }
        if (pIn !== qIn) {
          const t = dp / (dp - dq);
          const m = [p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1]), p[2] + t * (q[2] - p[2])];
          out.push(m); cuts.push(m);
        }
      }
      if (out.length) next.push(out);
    }
    const cap = capPolygon(cuts, na, nd, nz);
    if (cap) next.push(cap);
    if (!next.length) return false;
    faces = next;
  }
  return faces.length > 0;
}

// True when any of `roomId`'s doorway boxes touches the view, or the room has no boxes.
// When `seen` (rooms seen from the visitor's room) is given, openings to rooms outside `seen` are skipped.
export function doorInView(boxes, roomId, planes, seen = null) {
  const list = boxes?.[roomId];
  if (!list || !list.length) return true;
  const others = seen ? BOX_OTHERS.get(boxes)?.[roomId] : null;
  const hasSeen = seen ? (typeof seen.has === 'function' ? id => seen.has(id) : id => seen.includes(id)) : null;
  for (let i = 0; i < list.length; i++) {
    if (others && others[i] && hasSeen && !hasSeen(others[i])) continue;
    if (boxInView(list[i], planes)) return true;
  }
  return false;
}
