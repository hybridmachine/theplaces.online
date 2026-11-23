// Which rooms of a cabin interior can be seen from which, worked out from the blueprint's rooms, openings and stair alone.
// Pure: no three.js. Generous: furniture is ignored and each opening's span is widened by SIGHT.widen at each end.
import {doorwayPoint, roomAt} from './interior.js';

export const SIGHT = Object.freeze({grid: .5, widen: .1});

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
  for (const o of ops) {
    const [a, d] = doorwayPoint(o);
    pts.push(o.line === 'a'
      ? [Math.abs(o.at - room.a[0]) < EPS ? o.at + NUDGE : o.at - NUDGE, d]
      : [a, Math.abs(o.at - room.d[0]) < EPS ? o.at + NUDGE : o.at - NUDGE]);
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
