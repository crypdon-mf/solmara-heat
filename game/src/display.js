// display.js — HUD, minimap, screens and touch controls for Solmara Heat.
// The HUD is DOM (cash, health, stars, speed, objective); the minimap
// is a 2D canvas drawn top-down every frame. Screens are overlay divs
// the app shows and hides; buttons here call back into the app.

export function makeDisplay(controls) {
  const $ = (id) => document.getElementById(id);
  const el = {
    cash: $('hud-cash'), health: $('hud-health-fill'), healthWrap: $('hud-health'),
    stars: $('hud-stars'), speed: $('hud-speed'), objective: $('hud-objective'),
    timer: $('hud-timer'), banner: $('hud-banner'), minimap: $('minimap'),
    ammo: $('hud-ammo'), mute: $('hud-mute'),
    title: $('screen-title'), pause: $('screen-pause'), busted: $('screen-busted'),
    wasted: $('screen-wasted'), story: $('screen-story'), jobs: $('screen-jobs'),
    jobList: $('job-list'), titleCash: $('title-cash'), titleStats: $('title-stats'),
    storyStats: $('story-stats'), touch: $('touch-controls'),
  };
  const mapCtx = el.minimap.getContext('2d');
  let bannerTimer = null;
  let jobClick = null, newGame = null, continueGame = null, resumeGame = null,
    retryJob = null, quitToTitle = null, playAgain = null, jobsBack = null,
    showJobs = null;

  function showOnly(name) {
    for (const key of ['title', 'pause', 'busted', 'wasted', 'story', 'jobs']) {
      el[key].classList.toggle('hidden', key !== name);
    }
    document.getElementById('hud').classList.toggle('hidden', name === 'title' || name === 'jobs');
  }

  function banner(text, ms = 3200) {
    el.banner.textContent = text;
    el.banner.classList.remove('hidden');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => el.banner.classList.add('hidden'), ms);
  }

  function starsText(n) {
    return '★'.repeat(n) + '☆'.repeat(5 - n);
  }

  function drawMinimap(world) {
    const S = 168, C = S / 2, scale = S / 460;
    const ctx = mapCtx;
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = 'rgba(12, 18, 28, 0.82)';
    ctx.fillRect(0, 0, S, S);
    // Roads.
    ctx.strokeStyle = '#5a6270';
    ctx.lineWidth = 3;
    for (const line of world.city.roadLines) {
      const p = C + line * scale;
      ctx.beginPath(); ctx.moveTo(p, 4); ctx.lineTo(p, S - 4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(4, p); ctx.lineTo(S - 4, p); ctx.stroke();
    }
    // Beach + water.
    ctx.fillStyle = '#3f7d9c';
    ctx.fillRect(0, 0, Math.max(0, C + world.city.waterX * scale), S);
    ctx.fillStyle = '#d9c08a';
    ctx.fillRect(Math.max(0, C + world.city.waterX * scale), 0, 8, S);
    // Mission marker.
    if (world.marker) {
      const mx = C + world.marker.x * scale, my = C + world.marker.z * scale;
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath(); ctx.arc(mx, my, 5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffd23f';
      ctx.beginPath(); ctx.arc(mx, my, 9 + Math.sin(performance.now() / 300) * 2, 0, Math.PI * 2); ctx.stroke();
    }
    // Police blips.
    ctx.fillStyle = '#3a86ff';
    for (const c of world.cops.cruisers) {
      ctx.beginPath();
      ctx.arc(C + c.x * scale, C + c.z * scale, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Player arrow.
    const px = C + world.playerX * scale, py = C + world.playerZ * scale;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(world.playerHeading);
    ctx.fillStyle = '#ff5a3c';
    ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(-5, 6); ctx.closePath();
    ctx.fill();
    ctx.restore();
    // North tick.
    ctx.fillStyle = '#e8ecf2';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('N', C - 4, 13);
  }

  // --- touch controls: on-screen buttons feeding the same input ---
  function bindTouch(id, name) {
    const btn = $(id);
    if (!btn) return;
    const down = (e) => { e.preventDefault(); controls.touchDown(name); };
    const up = (e) => { e.preventDefault(); controls.touchUp(name); };
    btn.addEventListener('touchstart', down, { passive: false });
    btn.addEventListener('touchend', up);
    btn.addEventListener('touchcancel', up);
    btn.addEventListener('mousedown', down);
    btn.addEventListener('mouseup', up);
  }
  for (const [id, name] of [
    ['tc-up', 'up'], ['tc-down', 'down'], ['tc-left', 'left'], ['tc-right', 'right'],
    ['tc-brake', 'brake'], ['tc-enter', 'enter'], ['tc-punch', 'punch'],
  ]) bindTouch(id, name);
  if ('ontouchstart' in window) el.touch.classList.remove('hidden');

  // --- wiring: the app hands in its callbacks ---
  $('btn-new').addEventListener('click', () => newGame?.());
  $('btn-continue').addEventListener('click', () => continueGame?.());
  $('btn-jobs').addEventListener('click', () => showJobs?.());
  $('btn-resume').addEventListener('click', () => resumeGame?.());
  $('btn-quit').addEventListener('click', () => quitToTitle?.());
  $('btn-retry').addEventListener('click', () => retryJob?.());
  $('btn-busted-title').addEventListener('click', () => quitToTitle?.());
  $('btn-wasted-title').addEventListener('click', () => quitToTitle?.());
  $('btn-story-title').addEventListener('click', () => quitToTitle?.());
  $('btn-story-again').addEventListener('click', () => playAgain?.());
  $('btn-jobs-back').addEventListener('click', () => jobsBack?.());
  el.mute.addEventListener('click', () => {
    const m = el.mute.dataset.muted === '1';
    el.mute.dataset.muted = m ? '0' : '1';
    el.mute.textContent = m ? '🔊' : '🔇';
  });

  return {
    showOnly, banner,
    onNew(fn) { newGame = fn; },
    onContinue(fn) { continueGame = fn; },
    onResume(fn) { resumeGame = fn; },
    onQuitToTitle(fn) { quitToTitle = fn; },
    onRetry(fn) { retryJob = fn; },
    onPlayAgain(fn) { playAgain = fn; },
    onJobClick(fn) { jobClick = fn; },
    onJobsBack(fn) { jobsBack = fn; },
    onShowJobs(fn) { showJobs = fn; },

    setMuted(m) {
      el.mute.dataset.muted = m ? '1' : '0';
      el.mute.textContent = m ? '🔇' : '🔊';
    },
    isMuted() { return el.mute.dataset.muted === '1'; },

    renderJobs(jobs, done) {
      el.jobList.innerHTML = '';
      for (const job of jobs) {
        const row = document.createElement('button');
        row.className = 'job-row' + (done.includes(job.id) ? ' done' : '');
        row.innerHTML = `<span class="job-name">${done.includes(job.id) ? '✓ ' : ''}${job.name}</span>
          <span class="job-pay">$${job.payout}</span>
          <span class="job-brief">${job.brief}</span>`;
        row.addEventListener('click', () => jobClick?.(job.id));
        el.jobList.appendChild(row);
      }
    },

    setTitle(save) {
      if (save && (save.cash > 0 || save.done.length > 0)) {
        $('btn-continue').classList.remove('hidden');
        el.titleCash.textContent = `$${save.cash.toLocaleString()} — ${save.done.length}/8 jobs done`;
        el.titleStats.textContent = `Best wanted: ${'★'.repeat(save.bestStars) || 'none yet'} · ${Math.round(save.playtime / 60)} min played`;
      } else {
        $('btn-continue').classList.add('hidden');
        el.titleCash.textContent = '';
        el.titleStats.textContent = 'New driver in Solmara. Mara Voss has work for you.';
      }
    },

    setStoryStats(cash, playtime, bestStars) {
      el.storyStats.textContent = `$${cash.toLocaleString()} earned · ${Math.round(playtime / 60)} min on the streets · best wanted ${'★'.repeat(bestStars) || '—'}`;
    },

    update(hud) {
      el.cash.textContent = `$${Math.floor(hud.cash).toLocaleString()}`;
      el.health.style.width = `${Math.max(0, hud.health)}%`;
      el.health.style.background = hud.health > 50 ? '#37b24d' : hud.health > 25 ? '#f2b705' : '#e03131';
      el.stars.textContent = starsText(hud.stars);
      el.stars.style.color = hud.stars > 0 ? '#ff5a3c' : '#8a94a8';
      el.speed.textContent = hud.inCar ? `${Math.round(hud.speedKmh)} km/h` : '';
      el.objective.textContent = hud.objective || 'Open the job list (J) — Mara has work';
      el.timer.textContent = hud.timer > 0 ? `⏱ ${Math.ceil(hud.timer)}s` : '';
      el.ammo.textContent = hud.inCar ? '' : `🔫 ${hud.ammo}/${hud.reserve}${hud.reloading ? ' …' : ''}`;
      drawMinimap(hud.minimap);
    },
  };
}
