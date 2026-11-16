import {walkable} from '../../shared/space.js';
import {WALK} from '../../shared/walker.js';

export const PLACE_KEY = 'a-view:place:lakeside-cottage';
export const STILL_MS = 3000;
const MAX_TEXT = 512, TAU = Math.PI * 2;

const same = (a, b) => !!a && !!b && a.position[0] === b.position[0] && a.position[1] === b.position[1] && a.yaw === b.yaw && a.pitch === b.pitch;
const plain = s => ({position: [s.position[0], s.position[1]], yaw: s.yaw, pitch: s.pitch});

// Remembers where a visitor stopped. Any storage failure ends all further storage use for this instance.
export class PlaceMemory {
  constructor({storage, space, clock = Date.now}) {
    this.storage = storage; this.space = space; this.clock = clock;
    this.dead = !storage; this.written = null; this.noted = null; this.stillSince = null; this.forgotten = null;
  }
  #use(fn) {
    if (this.dead) return null;
    try { return fn(this.storage); } catch { this.dead = true; return null; }
  }
  load() {
    const text = this.#use(s => s.getItem(PLACE_KEY));
    if (typeof text !== 'string' || text.length > MAX_TEXT) return null;
    let r; try { r = JSON.parse(text); } catch { return null; }
    if (!r || typeof r !== 'object' || r.version !== 1) return null;
    const {position: p, yaw, pitch} = r;
    if (!Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite) || !Number.isFinite(yaw) || !Number.isFinite(pitch)) return null;
    if (Math.abs(pitch) > WALK.pitchLimit || !walkable(this.space, p)) return null;
    return this.written = {position: [p[0], p[1]], yaw: ((yaw % TAU) + TAU) % TAU, pitch};
  }
  note(state, moving) {
    if (moving) this.forgotten = null;
    else if (this.forgotten && same(state, this.forgotten)) { this.noted = plain(state); this.stillSince = null; return; }
    else this.forgotten = null;
    if (moving || !same(state, this.noted)) this.stillSince = null;
    this.noted = plain(state);
    if (moving) return;
    const now = this.clock();
    this.stillSince ??= now;
    if (now - this.stillSince >= STILL_MS) this.flush(state);
  }
  flush(state) {
    if (this.forgotten) { if (same(state, this.forgotten)) return; this.forgotten = null; }
    if (same(state, this.written)) return;
    const next = plain(state);
    const ok = this.#use(s => (s.setItem(PLACE_KEY, JSON.stringify({version: 1, ...next, savedAt: this.clock()})), true));
    if (ok) this.written = next;
  }
  forget() {
    this.forgotten = this.noted ?? this.written; this.written = null; this.stillSince = null;
    this.#use(s => s.removeItem(PLACE_KEY));
  }
}
