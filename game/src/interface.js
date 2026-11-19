// HUD, minimap, toasts and all screens: title, pause, jobs menu, busted /
// wasted / story-complete. Pure DOM over the 3D canvas.
import { JOBS } from './tuning.js';
import { districtAt } from './metropolis.js';

export class Interface {
  constructor() {
    this.el = (id) => document.getElementById(id);
    this.map = this.el('minimap');
    this.mapCtx = this.map?.getContext('2d');
    this.toasts = [];
    this._toastTimer = null;
  }

  toast(msg, ms = 4200) {
    const box = this.el('toasts');
    if (!box) return;
    const div = document.createElement('div');
    div.className = 'toast';
    div.textContent = msg;
    box.appendChild(div);
    this.toasts.push(div);
    while (this.toasts.length > 4) this.toasts.shift().remove();
    setTimeout(() => { div.classList.add('fade'); setTimeout(() => div.remove(), 600); }, ms);
  }

  update(state) {
    // state: { cash, health, stars, speed, mag, reserve, hour, wanted, objective, playerX, playerZ, heading, city, life, police, missionTarget, inCar, carHp, muted }
    const $ = this.el.bind(this);
    $('cash').textContent = `$${Math.round(state.cash).toLocaleString()}`;
    $('healthfill').style.width = `${Math.max(0, state.health)}%`;
    $('healthfill').style.background = state.health > 50 ? '#4ade80' : state.health > 25 ? '#f2b705' : '#ef4444';
    $('stars').innerHTML = [1, 2, 3, 4, 5].map((i) => `<span class="${i <= state.stars ? 'on' : ''}">★</span>`).join('');
    $('speed').textContent = state.inCar ? `${Math.round(Math.abs(state.speed) * 3.6)} km/h` : '';
    $('ammo').textContent = state.inCar ? '' : `🔫 ${state.mag}/${state.reserve}`;
    $('carhp').textContent = state.inCar ? `CAR ${Math.max(0, Math.round(state.carHp))}%` : '';
    const h = Math.floor(state.hour) % 24, m = Math.floor((state.hour % 1) * 60);
    $('clock').textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} · ${state.isNight ? 'NIGHT' : 'DAY'}`;
    $('district').textContent = districtAt(state.playerX, state.playerZ).toUpperCase();
    $('mute').textContent = state.muted ? '🔇 MUTED' : '🔊 SOUND';
    // objective panel
    const obj = $('objective');
    if (state.objective) {
      obj.style.display = 'block';
      $('objname').textContent = state.objective.name;
      $('objtext').textContent = state.objective.text;
      $('objdist').textContent = state.objective.dist != null ? `${state.objective.dist}m` : '';
      $('objtimer').textContent = state.objective.timer != null ? `⏱ ${Math.ceil(state.objective.timer)}s` : '';
    } else obj.style.display = 'none';
    // damage vignette
    $('vignette').style.opacity = state.health < 40 ? String((40 - state.health) / 40 * 0.8) : '0';
    $('crosshair').style.display = !state.inCar ? 'block' : 'none';
    this._drawMap(state);
  }

  _drawMap(s) {
    const c = this.mapCtx; if (!c) return;
    const W = this.map.width, H = this.map.height;
    const scale = W / 430;
    const toX = (x) => W / 2 + x * scale;
    const toY = (z) => H / 2 + z * scale;
    c.clearRect(0, 0, W, H);
    c.fillStyle = '#10151d'; c.fillRect(0, 0, W, H);
    // sea (south)
    c.fillStyle = '#1e6f8e'; c.fillRect(0, toY(190), W, H - toY(190));
    // blocks
    c.fillStyle = '#2b3138';
    for (let bx = -5; bx <= 5; bx++) for (let bz = -5; bz <= 5; bz++) {
      c.fillRect(toX(bx * 34 - 13), toY(bz * 34 - 13), 26 * scale, 26 * scale);
    }
    // roads
    c.strokeStyle = '#565d66'; c.lineWidth = 2;
    for (let k = -5; k <= 5; k++) {
      c.beginPath(); c.moveTo(toX(k * 34), 0); c.lineTo(toX(k * 34), H); c.stroke();
      c.beginPath(); c.moveTo(0, toY(k * 34)); c.lineTo(W, toY(k * 34)); c.stroke();
    }
    // mission target
    if (s.missionTarget) {
      c.fillStyle = '#ffc800';
      c.beginPath(); c.arc(toX(s.missionTarget.x), toY(s.missionTarget.z), 6, 0, 7); c.fill();
      c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.stroke();
    }
    // traffic (pale dots) + police (red)
    c.fillStyle = '#c8ccd2';
    for (const car of s.traffic || []) c.fillRect(toX(car.x) - 1, toY(car.z) - 1, 2, 2);
    c.fillStyle = '#ff2a2a';
    for (const u of s.police || []) { c.beginPath(); c.arc(toX(u.x), toY(u.z), 3.5, 0, 7); c.fill(); }
    // player arrow
    const px = toX(s.playerX), py = toY(s.playerZ);
    c.save();
    c.translate(px, py); c.rotate(Math.atan2(Math.sin(s.heading), Math.cos(s.heading)));
    c.fillStyle = '#4ade80';
    c.beginPath(); c.moveTo(0, -7); c.lineTo(5, 6); c.lineTo(-5, 6); c.closePath(); c.fill();
    c.restore();
    // north
    c.fillStyle = '#fff'; c.font = 'bold 11px sans-serif'; c.fillText('N', W - 14, 14);
  }

  // ---- screens ----
  show(id) {
    for (const s of ['title', 'pause', 'jobsmenu', 'endscreen']) {
      const e = this.el(s); if (e) e.style.display = s === id ? 'flex' : 'none';
    }
    if (!id) for (const s of ['title', 'pause', 'jobsmenu', 'endscreen']) { const e = this.el(s); if (e) e.style.display = 'none'; }
  }
  setEnd(title, body, buttonLabel) {
    this.el('endtitle').textContent = title;
    this.el('endbody').textContent = body;
    this.el('endbutton').textContent = buttonLabel;
    this.show('endscreen');
  }
  buildJobsList(jobs, onPick) {
    const list = this.el('jobslist');
    list.innerHTML = '';
    JOBS.forEach((job, i) => {
      const done = jobs.doneJobs.includes(job.id);
      const locked = i > jobs.firstUndone;
      const row = document.createElement('button');
      row.className = 'jobrow' + (done ? ' done' : '') + (locked ? ' locked' : '');
      row.innerHTML = `<b>${done ? '✓ ' : ''}${i + 1}. ${job.name}</b><span>$${job.pay}</span><em>${locked ? 'Finish earlier jobs to unlock' : job.brief}</em>`;
      if (!locked) row.addEventListener('click', () => onPick(i));
      list.appendChild(row);
    });
  }
  setTitleStats(save) {
    const el = this.el('titlestats');
    if (!el) return;
    if (save) {
      el.textContent = `Continue: $${Math.round(save.cash)} · ${save.done.length}/8 jobs done · best ${save.bestStars}★ · ${Math.round(save.playSeconds / 60)} min played`;
      this.el('continuebtn').style.display = 'inline-block';
    } else {
      el.textContent = 'A new story in Solmara — no save yet.';
      this.el('continuebtn').style.display = 'none';
    }
  }
}
