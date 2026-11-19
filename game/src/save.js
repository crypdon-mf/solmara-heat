// save.js — localStorage persistence for Solmara Heat.
// Only progress is stored: cash, finished jobs, best wanted level,
// total playtime and the mute flag. Position and active jobs are NOT
// saved — a reload always drops Jax back at the Marina spawn.

const KEY = 'solmara-heat-save-v3';

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return {
      cash: Math.max(0, Number(data.cash) || 0),
      done: Array.isArray(data.done) ? data.done.filter((x) => typeof x === 'string') : [],
      bestStars: Math.min(5, Math.max(0, Number(data.bestStars) || 0)),
      playtime: Math.max(0, Number(data.playtime) || 0),
      muted: data.muted === true,
    };
  } catch {
    return null;
  }
}

export function writeSave(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      cash: Math.round(state.cash),
      done: state.done.slice(),
      bestStars: state.bestStars,
      playtime: Math.round(state.playtime),
      muted: state.muted,
    }));
  } catch {
    // Private mode / full storage: the game keeps running, progress just
    // does not survive a reload. Never let saving crash the loop.
  }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
