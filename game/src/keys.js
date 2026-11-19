// Keyboard + mouse + touch input. One object, read by every system each
// frame; touch controls are built as DOM buttons that feed the same fields.
export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set();   // edge-triggered, consumed each frame
    this.mouseDX = 0; this.mouseDY = 0;
    this.mouseDown = false;
    this.mouseClicked = false;
    this.touch = { fwd: false, back: false, left: false, right: false, brake: false, action: false, punch: false, shoot: false };
    this.autoFwd = false; // staged shots hold the throttle open
    this.pointerLocked = false;
    this._onKeyDown = (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
    };
    this._onKeyUp = (e) => this.keys.delete(e.code);
    this._onMouseMove = (e) => {
      if (this.pointerLocked) { this.mouseDX += e.movementX; this.mouseDY += e.movementY; }
    };
    this._onMouseDown = (e) => {
      if (e.button === 0) { this.mouseDown = true; this.mouseClicked = true; }
    };
    this._onMouseUp = (e) => { if (e.button === 0) this.mouseDown = false; };
    this._onLockChange = () => { this.pointerLocked = document.pointerLockState != null; };
  }
  attach(canvas) {
    this.canvas = canvas;
    addEventListener('keydown', this._onKeyDown);
    addEventListener('keyup', this._onKeyUp);
    addEventListener('mousemove', this._onMouseMove);
    addEventListener('mousedown', this._onMouseDown);
    addEventListener('mouseup', this._onMouseUp);
    document.addEventListener('pointerlockchange', this._onLockChange);
    canvas.addEventListener('click', () => {
      if (!this.pointerLocked && document.pointerLockElement !== canvas) {
        canvas.requestPointerLock?.();
      }
    });
  }
  down(code) { return this.keys.has(code); }
  wasPressed(code) { return this.pressed.has(code); }
  axis() {
    // Returns { fwd: -1..1, steer: -1..1 } merged from keyboard + touch.
    let fwd = 0, steer = 0;
    if (this.autoFwd) fwd = 1;
    if (this.down('KeyW') || this.down('ArrowUp') || this.touch.fwd) fwd += 1;
    if (this.down('KeyS') || this.down('ArrowDown') || this.touch.back) fwd -= 1;
    if (this.down('KeyA') || this.down('ArrowLeft') || this.touch.left) steer -= 1;
    if (this.down('KeyD') || this.down('ArrowRight') || this.touch.right) steer += 1;
    return { fwd, steer };
  }
  get handbrake() { return this.down('Space') || this.touch.brake; }
  get sprint() { return this.down('ShiftLeft') || this.down('ShiftRight'); }
  endFrame() {
    this.pressed.clear();
    this.mouseDX = 0; this.mouseDY = 0;
    this.mouseClicked = false;
  }
}

// Builds the on-screen touch controls (phones) and wires them into Input.
export function buildTouchControls(input) {
  const pad = document.createElement('div');
  pad.id = 'touch';
  pad.innerHTML = `
    <div class="tcluster left">
      <button data-t="left">◀</button><button data-t="fwd">▲</button><button data-t="back">▼</button><button data-t="right">▶</button>
    </div>
    <div class="tcluster right">
      <button data-t="brake">DRIFT</button><button data-t="action">ENTER</button><button data-t="shoot">FIRE</button><button data-t="punch">HIT</button>
    </div>`;
  document.body.appendChild(pad);
  const map = { left: 'left', fwd: 'fwd', back: 'back', right: 'right', brake: 'brake', action: 'action', punch: 'punch', shoot: 'shoot' };
  pad.querySelectorAll('button').forEach((b) => {
    const key = map[b.dataset.t];
    const on = (e) => { e.preventDefault(); input.touch[key] = true; };
    const off = (e) => { e.preventDefault(); input.touch[key] = false; };
    b.addEventListener('pointerdown', on);
    b.addEventListener('pointerup', off);
    b.addEventListener('pointerleave', off);
    b.addEventListener('pointercancel', off);
  });
  // Show only on coarse pointers.
  if (!matchMedia('(pointer: coarse)').matches) pad.style.display = 'none';
}
