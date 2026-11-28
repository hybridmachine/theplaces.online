import {walkable} from '../../shared/space.js';
import {WALK} from '../../shared/walker.js';
import {floorArea, onStair} from '../../shared/interior.js';

import {PLACE_KEY, forgetStoredPlace} from '../visit-memory.js';
export {PLACE_KEY};
export const STILL_MS = 3000;
const MAX_TEXT = 512, TAU = Math.PI * 2;

const placeOf = s => s.place === 'cabin' ? 'cabin' : 'yard';
const same = (a, b) => !!a && !!b && placeOf(a) === placeOf(b) && a.floor === b.floor && a.position[0] === b.position[0] && a.position[1] === b.position[1] && a.yaw === b.yaw && a.pitch === b.pitch;
const plain = s => placeOf(s) === 'cabin'
  ? {place: 'cabin', floor: s.floor, position: [s.position[0], s.position[1]], yaw: s.yaw, pitch: s.pitch}
  : {place: 'yard', position: [s.position[0], s.position[1]], yaw: s.yaw, pitch: s.pitch};

// Remembers where a visitor stopped. Any storage failure ends all further storage use for this instance.
export class PlaceMemory {
  constructor({storage, space, interior = null, clock = Date.now}) {
    this.storage = storage; this.space = space; this.interior = interior; this.clock = clock;
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
    if (!r || typeof r !== 'object') return null;
    const cabin = r.version === 2 && r.place === 'cabin' && !!this.interior;
    if (r.version !== 1 && !cabin) return null;
    const {position: p, yaw, pitch, floor} = r;
    if (!Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite) || !Number.isFinite(yaw) || !Number.isFinite(pitch)) return null;
    if (!cabin && !walkable(this.space, p)) return null;
    if (Math.abs(pitch) > WALK.pitchLimit) return null;
    const turned = ((yaw % TAU) + TAU) % TAU;
    if (!cabin) return this.written = {place: 'yard', position: [p[0], p[1]], yaw: turned, pitch};
    if (floor !== 0 && floor !== 1) return null;
    if (!floorArea(this.interior, floor, p) && !onStair(this.interior, p)) return null;
    return this.written = {place: 'cabin', floor, position: [p[0], p[1]], yaw: turned, pitch};
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
    const ok = this.#use(s => (s.setItem(PLACE_KEY, JSON.stringify(next.place === 'cabin' ? {version: 2, ...next, savedAt: this.clock()} : {version: 1, position: next.position, yaw: next.yaw, pitch: next.pitch, savedAt: this.clock()})), true));
    if (ok) this.written = next;
  }
  forget(state) {
    if (state) this.flush(state);
    const written = this.written;
    this.forgotten = state ? plain(state) : this.noted ?? written;
    this.written = null; this.stillSince = null;
    const restore = this.#use(forgetStoredPlace);
    if (!restore) return null;
    return () => {
      if (!this.#use(restore)) return false;
      this.written = written; this.forgotten = null;
      return true;
    };
  }
}
