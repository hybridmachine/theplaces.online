const AXES = {
  KeyW: ['forward', 1], KeyS: ['forward', -1], KeyD: ['strafe', 1], KeyA: ['strafe', -1],
  // The arrow keys turn the camera: left/right swing the heading, up/down tilt the gaze.
  ArrowRight: ['turn', 1], ArrowLeft: ['turn', -1], KeyE: ['turn', 1], KeyQ: ['turn', -1],
  ArrowUp: ['tilt', 1], ArrowDown: ['tilt', -1],
};
const clampAxis = v => Math.max(-1, Math.min(1, v));
const FAST = new Set(['ShiftLeft', 'ShiftRight']);
const ARROWS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
const TYPING = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

const typing = t => !!t && (TYPING.has(String(t.tagName).toUpperCase()) || t.isContentEditable === true);

// Turns held keys into walking and looking input. Keys held while blocked() stay held but count for nothing.
export class WalkKeys {
  constructor(target, {blocked = () => false} = {}) {
    this.target = target; this.blocked = blocked; this.held = new Set();
    this.onDown = e => {
      if (this.blocked() || e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
      if (!AXES[e.code] && !FAST.has(e.code)) return;
      this.held.add(e.code);
      if (ARROWS.has(e.code)) e.preventDefault();
    };
    this.onUp = e => { this.held.delete(e.code); };
    this.onBlur = () => this.release();
    target.addEventListener('keydown', this.onDown); target.addEventListener('keyup', this.onUp); target.addEventListener('blur', this.onBlur);
  }
  input() {
    const out = {forward: 0, strafe: 0, turn: 0, tilt: 0, fast: false};
    if (this.blocked()) return out;
    for (const code of this.held) {
      if (FAST.has(code)) out.fast = true;
      else { const [axis, sign] = AXES[code]; out[axis] += sign; }
    }
    // Two keys for one direction (an arrow and Q/E) are no faster than one.
    out.turn = clampAxis(out.turn);
    return out;
  }
  moving() { const i = this.input(); return i.forward !== 0 || i.strafe !== 0 || i.turn !== 0 || i.tilt !== 0; }
  release() { this.held.clear(); }
  dispose() {
    this.target.removeEventListener('keydown', this.onDown); this.target.removeEventListener('keyup', this.onUp); this.target.removeEventListener('blur', this.onBlur);
    this.release();
  }
}
