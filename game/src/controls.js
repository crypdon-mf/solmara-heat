// controls.js — keyboard, mouse and touch input for Solmara Heat.
// The game reads a frozen snapshot each frame (snap()), so a key pressed
// between frames is never dropped and held keys never double-fire.
// Touch buttons feed the same snapshot, so on-foot and driving share one
// input surface.

const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'sprint', ShiftRight: 'sprint',
  Space: 'brake',
  KeyE: 'enter',
  KeyF: 'punch',
  KeyR: 'reload',
  KeyM: 'mute',
  Escape: 'pause',
  Enter: 'confirm',
};

export function makeControls(canvas) {
  const held = new Set();
  const tapped = new Set();   // keys pressed since the last snapshot
  const touch = new Set();    // virtual buttons currently held
  let mouseDX = 0, mouseDY = 0;
  let firing = false;         // mouse held (pistol trigger)
  let locked = false;

  function onKeyDown(e) {
    const action = KEYMAP[e.code];
    if (!action) return;
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    if (!held.has(action)) tapped.add(action);
    held.add(action);
  }
  function onKeyUp(e) {
    const action = KEYMAP[e.code];
    if (action) held.delete(action);
  }
  function onMouseMove(e) {
    if (!locked) return;
    mouseDX += e.movementX || 0;
    mouseDY += e.movementY || 0;
  }
  function onMouseDown(e) {
    if (e.button === 0) firing = true;
  }
  function onMouseUp(e) {
    if (e.button === 0) firing = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('blur', () => { held.clear(); firing = false; });

  // Pointer lock gives the mouse-orbit camera; a click on the canvas
  // re-locks after Esc releases it.
  canvas.addEventListener('click', () => {
    if (document.pointerLockElement !== canvas) {
      canvas.requestPointerLock?.();
    }
  });
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
  });

  return {
    // Virtual touch button state, driven by the HUD buttons in display.js.
    touchDown(name) { touch.add(name); tapped.add(name); },
    touchUp(name) { touch.delete(name); },

    get pointerLocked() { return locked; },
    get mouseFiring() { return firing; },

    // Freeze the frame's input. Call once per update, before anything reads.
    snap() {
      const state = {
        up: held.has('up') || touch.has('up'),
        down: held.has('down') || touch.has('down'),
        left: held.has('left') || touch.has('left'),
        right: held.has('right') || touch.has('right'),
        sprint: held.has('sprint') || touch.has('sprint'),
        brake: held.has('brake') || touch.has('brake'),
        fire: firing,
        just: new Set(tapped),   // edge-triggered actions this frame
      };
      tapped.clear();
      const dx = mouseDX, dy = mouseDY;
      mouseDX = 0; mouseDY = 0;
      state.lookDX = dx;
      state.lookDY = dy;
      return state;
    },
  };
}
