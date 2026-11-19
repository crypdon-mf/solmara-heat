// Save / continue via localStorage. Only numbers and job ids — nothing
// personal, nothing that can identify the player.
const KEY = 'solmara-heat-v2-save';

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (typeof s !== 'object' || !s) return null;
    return {
      cash: Number(s.cash) || 0,
      done: Array.isArray(s.done) ? s.done.filter((x) => typeof x === 'string') : [],
      bestStars: Number(s.bestStars) || 0,
      playSeconds: Number(s.playSeconds) || 0,
      totalEarned: Number(s.totalEarned) || 0,
    };
  } catch { return null; }
}

export function writeSave(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      cash: Math.round(state.cash),
      done: state.doneJobs,
      bestStars: state.bestStars,
      playSeconds: Math.round(state.playSeconds),
      totalEarned: Math.round(state.totalEarned),
    }));
  } catch { /* storage full / private mode: play on without saving */ }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
