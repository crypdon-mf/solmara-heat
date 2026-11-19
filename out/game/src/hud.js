// The HUD: DOM readouts (cash, health, wanted stars, speed, mission line,
// message toast) plus a 2D canvas minimap drawn top-down — roads, the player
// arrow, the mission marker, police blips and a north tick. The screens
// (title, pause, busted/wasted, mission results, story complete) are DOM
// panels this module shows and hides; the game logic only calls show/hide.
import { WANTED } from './config.js';

export function createHud() {
  const el = (id) => document.getElementById(id);
  const cashEl = el('hud-cash');
  const healthEl = el('hud-health-fill');
  const healthWrap = el('hud-health');
  const starsEl = el('hud-stars');
  const speedEl = el('hud-speed');
  const missionEl = el('hud-mission');
  const ammoEl = el('hud-ammo');
  const toastEl = el('hud-toast');
  const mapCanvas = el('minimap');
  const mapCtx = mapCanvas.getContext('2d');
  const screens = {
    title: el('screen-title'),
    pause: el('screen-pause'),
    over: el('screen-over'),
    mission: el('screen-mission'),
    story: el('screen-story'),
    missions: el('screen-missions'),
  };
  let toastTimer = null;

  function showScreen(name) {
    for (const key of Object.keys(screens)) {
      if (screens[key]) screens[key].classList.toggle('hidden', key !== name);
    }
  }
  function hideScreens() {
    for (const key of Object.keys(screens)) if (screens[key]) screens[key].classList.add('hidden');
  }

  function toast(message, ms) {
    toastEl.textContent = message;
    toastEl.classList.remove('hidden');
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toastEl.classList.add('hidden'), ms || 3500);
  }

  function update(state) {
    cashEl.textContent = `$${Math.floor(state.cash)}`;
    healthEl.style.width = `${Math.max(0, state.player.health)}%`;
    healthWrap.classList.toggle('low', state.player.health < 30);
    let stars = '';
    for (let i = 0; i < WANTED.maxStars; i += 1) stars += i < state.wanted.stars ? '★' : '☆';
    starsEl.textContent = stars;
    starsEl.classList.toggle('hot', state.wanted.stars > 0);
    const speed = state.player.inCar ? Math.abs(state.player.car.speed) * 3.2 : 0;
    speedEl.textContent = state.player.inCar ? `${Math.round(speed)} km/h` : '';
    ammoEl.textContent = state.player.inCar ? '' : `🔫 ${state.player.ammo}/${state.player.reserveAmmo}`;
    if (state.mission.active) {
      const m = state.mission;
      const time = m.timeLeft > 0 ? ` — ${Math.ceil(m.timeLeft)}s` : '';
      missionEl.textContent = `${m.def.name}: ${m.objective}${time}`;
      missionEl.classList.remove('hidden');
    } else if (state.mission.doneCount > 0 && state.mission.doneCount < 5) {
      missionEl.textContent = 'Press Q for jobs — Mara is waiting';
      missionEl.classList.remove('hidden');
    } else {
      missionEl.classList.add('hidden');
    }
  }

  // Minimap: the whole city scaled into 180 px, north up.
  function drawMinimap(state, city) {
    const size = 180;
    const half = 260;
    const scale = size / (half * 2);
    const toMap = (x, z) => [(x + half) * scale, (z + half) * scale];
    mapCtx.fillStyle = '#1d2733';
    mapCtx.fillRect(0, 0, size, size);
    mapCtx.strokeStyle = '#5a6b7d';
    mapCtx.lineWidth = 2;
    for (const v of city.lines) {
      const [x1, y1] = toMap(v, -half);
      const [x2, y2] = toMap(v, half);
      mapCtx.beginPath(); mapCtx.moveTo(x1, y1); mapCtx.lineTo(x2, y2); mapCtx.stroke();
      const [x3, y3] = toMap(-half, v);
      const [x4, y4] = toMap(half, v);
      mapCtx.beginPath(); mapCtx.moveTo(x3, y3); mapCtx.lineTo(x4, y4); mapCtx.stroke();
    }
    // Beach strip at the bottom.
    mapCtx.fillStyle = '#e8d8a0';
    mapCtx.fillRect(0, size - 10, size, 10);
    mapCtx.fillStyle = '#2a7fa8';
    mapCtx.fillRect(0, size - 4, size, 4);
    // Mission marker: pulsing gold diamond.
    if (state.mission.active && state.mission.marker) {
      const [mx, my] = toMap(state.mission.marker.x, state.mission.marker.z);
      const pulse = 5 + Math.sin(performance.now() / 200) * 2;
      mapCtx.fillStyle = '#ffd23c';
      mapCtx.beginPath();
      mapCtx.moveTo(mx, my - pulse - 3); mapCtx.lineTo(mx + pulse, my); mapCtx.lineTo(mx, my + pulse + 3); mapCtx.lineTo(mx - pulse, my);
      mapCtx.closePath(); mapCtx.fill();
    }
    // Police blips: flashing blue/red dots.
    for (const cop of state.police.cars) {
      const [cx, cy] = toMap(cop.x, cop.z);
      mapCtx.fillStyle = Math.floor(performance.now() / 300) % 2 ? '#3c6fd8' : '#d8433c';
      mapCtx.beginPath(); mapCtx.arc(cx, cy, 3.5, 0, Math.PI * 2); mapCtx.fill();
    }
    // Player arrow, pointing along the heading.
    const p = state.player;
    const [px, py] = toMap(p.x, p.z);
    mapCtx.save();
    mapCtx.translate(px, py);
    mapCtx.rotate(p.heading);
    mapCtx.fillStyle = '#ffffff';
    mapCtx.beginPath();
    mapCtx.moveTo(0, -7); mapCtx.lineTo(5, 6); mapCtx.lineTo(-5, 6);
    mapCtx.closePath(); mapCtx.fill();
    mapCtx.restore();
    // North tick.
    mapCtx.fillStyle = '#ffffff';
    mapCtx.font = 'bold 11px system-ui, sans-serif';
    mapCtx.fillText('N', 4, 13);
  }

  function setTitleStats(save) {
    const elBest = document.getElementById('title-stats');
    if (!elBest) return;
    if (save && save.missionsDone > 0) {
      elBest.textContent = `Continue: ${save.missionsDone}/5 jobs done · $${Math.floor(save.cash)} · best ${save.bestStars || 0}★ survived`;
    } else {
      elBest.textContent = 'A new driver in Solmara. Mara Voss has work for you.';
    }
  }

  function setOver(kind, cashLost) {
    const title = document.getElementById('over-title');
    const text = document.getElementById('over-text');
    if (title) title.textContent = kind === 'busted' ? 'BUSTED' : 'WASTED';
    if (text) {
      text.textContent = kind === 'busted'
        ? `The Solmara PD hauled you in. You lost $${Math.floor(cashLost)} in fines and impound fees.`
        : 'You woke up at Solmara General, patched up and lighter in the pocket.';
    }
  }

  function setMissionResult(ok, name, reward) {
    const title = document.getElementById('mission-title');
    const text = document.getElementById('mission-text');
    if (title) title.textContent = ok ? 'JOB DONE' : 'JOB FAILED';
    if (text) text.textContent = ok ? `${name} — Mara paid you $${reward}.` : `${name} — the job fell through. Mara will let you try again.`;
  }

  return { showScreen, hideScreens, toast, update, drawMinimap, setTitleStats, setOver, setMissionResult, screens };
}
