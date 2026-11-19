// Keyboard and mouse input. Held keys are read every frame; one-shot presses
// (confirm, pause, enter car, punch, reload, mute, mission menu) are queued as
// bit flags and taken once by the loop, so a press between frames is never lost
// and never counted twice. Mouse drag orbits the camera; a click is a gunshot.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER = 4;
export const ACTION_PUNCH = 8;
export const ACTION_RELOAD = 16;
export const ACTION_MUTE = 32;
export const ACTION_MISSIONS = 64;
export const ACTION_JUMP = 128;

const KEYMAP = {
  KeyW: 'forward', ArrowUp: 'forward',
  KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'sprint', ShiftRight: 'sprint',
  Space: 'handbrake',
};

export function createInput(canvas) {
  const held = { forward: false, back: false, left: false, right: false, sprint: false, handbrake: false };
  let actions = 0;
  let mouseDown = false;
  let dragX = 0;
  let dragY = 0;
  let clickQueued = false;

  window.addEventListener('keydown', (event) => {
    const name = KEYMAP[event.code];
    if (name) { held[name] = true; event.preventDefault(); return; }
    if (event.repeat) return;
    if (event.code === 'Enter') actions |= ACTION_CONFIRM;
    else if (event.code === 'Escape' || event.code === 'KeyP') actions |= ACTION_PAUSE;
    else if (event.code === 'KeyE') actions |= ACTION_ENTER;
    else if (event.code === 'KeyF') actions |= ACTION_PUNCH;
    else if (event.code === 'KeyR') actions |= ACTION_RELOAD;
    else if (event.code === 'KeyM') actions |= ACTION_MUTE;
    else if (event.code === 'KeyQ' || event.code === 'Tab') actions |= ACTION_MISSIONS;
    else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    const name = KEYMAP[event.code];
    if (name) held[name] = false;
  });
  window.addEventListener('blur', () => {
    for (const key of Object.keys(held)) held[key] = false;
    mouseDown = false;
  });

  canvas.addEventListener('pointerdown', (event) => {
    mouseDown = true;
    dragX = 0; dragY = 0;
    clickQueued = true;
    actions |= ACTION_CONFIRM;
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!mouseDown) return;
    dragX += event.movementX || 0;
    dragY += event.movementY || 0;
  });
  canvas.addEventListener('pointerup', () => { mouseDown = false; });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    held,
    // -1..1 steering / throttle helpers read by the driving and walking code.
    steer() { return (held.right ? 1 : 0) - (held.left ? 1 : 0); },
    throttle() { return (held.forward ? 1 : 0) - (held.back ? 1 : 0); },
    takeActions() { const taken = actions; actions = 0; return taken; },
    // Mouse drag since last call, in pixels; also consumes the click flag.
    takeDrag() { const d = { x: dragX, y: dragY, clicked: clickQueued }; dragX = 0; dragY = 0; clickQueued = false; return d; },
  };
}
