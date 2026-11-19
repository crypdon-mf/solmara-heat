// sound.js — every sound in Solmara Heat is synthesized with WebAudio.
// No audio files, no network: oscillators for the engine and siren,
// filtered noise for gunshots and crashes, and a small bassline + hats
// loop for music. Created lazily on the first user gesture.

export function makeSound() {
  let ctx = null;
  let master = null;
  let muted = false;

  // --- engine loop (two detuned saws through a low-pass) ---
  let engineOscA = null, engineOscB = null, engineFilter = null, engineGain = null;
  // --- music ---
  let musicTimer = null, musicStep = 0;
  let sirenOn = false, sirenOsc = null, sirenGain = null, sirenLfo = null;

  const BASSLINE = [55, 0, 55, 65.4, 0, 55, 49, 58.3, 55, 0, 55, 65.4, 73.4, 0, 65.4, 49];
  const HAT_EVERY = 2; // hats on every other 16th step

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      startEngine();
      startMusic();
      return true;
    } catch {
      return false;
    }
  }

  function startEngine() {
    engineOscA = ctx.createOscillator();
    engineOscB = ctx.createOscillator();
    engineOscA.type = 'sawtooth';
    engineOscB.type = 'sawtooth';
    engineOscA.frequency.value = 52;
    engineOscB.frequency.value = 53.5;
    engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 320;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineOscA.connect(engineFilter);
    engineOscB.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(master);
    engineOscA.start();
    engineOscB.start();
  }

  function startMusic() {
    // 16-step loop at 116 BPM: a moody A-minor bassline with hats.
    const stepMs = 60000 / 116 / 4;
    musicTimer = window.setInterval(() => {
      if (!ctx || muted) { musicStep = (musicStep + 1) % 16; return; }
      const step = musicStep;
      const note = BASSLINE[step];
      if (note > 0) blip(note, 0.16, 'triangle', 0.20, stepMs / 1000 * 0.9);
      if (step % HAT_EVERY === 0) hat(step % 4 === 2 ? 0.05 : 0.03);
      musicStep = (musicStep + 1) % 16;
    }, stepMs);
  }

  function blip(freq, dur, type, vol, when = 0) {
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noiseBurst(dur, filterFreq, vol, type = 'lowpass') {
    if (!ctx) return;
    const t = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t);
  }

  function hat(vol) {
    noiseBurst(0.045, 8000, vol, 'highpass');
  }

  return {
    unlock() { ensure(); },
    get isMuted() { return muted; },
    setMuted(m) {
      muted = m;
      if (master) master.gain.value = m ? 0 : 0.5;
    },

    // speed01: 0..1, rpm-ish. Called every frame while driving.
    engine(speed01, onFoot) {
      if (!ctx || !engineGain) return;
      const target = onFoot ? 0 : 0.02 + speed01 * 0.075;
      engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
      const f = 48 + speed01 * 150;
      engineOscA.frequency.setTargetAtTime(f, ctx.currentTime, 0.06);
      engineOscB.frequency.setTargetAtTime(f * 1.02 + 1.5, ctx.currentTime, 0.06);
      engineFilter.frequency.setTargetAtTime(280 + speed01 * 1400, ctx.currentTime, 0.1);
    },

    siren(on) {
      if (on === sirenOn) return;
      sirenOn = on;
      if (!ctx) return;
      if (on) {
        sirenOsc = ctx.createOscillator();
        sirenOsc.type = 'sine';
        sirenOsc.frequency.value = 720;
        sirenLfo = ctx.createOscillator();
        sirenLfo.type = 'square';
        sirenLfo.frequency.value = 0.55;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 190;
        sirenLfo.connect(lfoGain);
        lfoGain.connect(sirenOsc.frequency);
        sirenGain = ctx.createGain();
        sirenGain.gain.value = 0.045;
        sirenOsc.connect(sirenGain);
        sirenGain.connect(master);
        sirenOsc.start(); sirenLfo.start();
      } else if (sirenOsc) {
        try { sirenOsc.stop(); sirenLfo.stop(); } catch { /* already stopped */ }
        sirenOsc.disconnect(); sirenLfo.disconnect(); sirenGain.disconnect();
        sirenOsc = null; sirenLfo = null; sirenGain = null;
      }
    },

    shot() { noiseBurst(0.14, 2600, 0.5, 'bandpass'); blip(160, 0.08, 'square', 0.18); },
    punch() { noiseBurst(0.09, 500, 0.4); },
    crash(hard) { noiseBurst(hard ? 0.4 : 0.18, 320, hard ? 0.7 : 0.35); },
    chime() { blip(880, 0.12, 'sine', 0.22); blip(1318, 0.2, 'sine', 0.18, 0.09); },
    jingle() {
      [523, 659, 784, 1046].forEach((f, i) => blip(f, 0.22, 'triangle', 0.2, i * 0.11));
    },
    fail() { blip(220, 0.3, 'sawtooth', 0.16); blip(165, 0.45, 'sawtooth', 0.16, 0.18); },
    reload() { blip(1200, 0.05, 'square', 0.12); blip(900, 0.05, 'square', 0.12, 0.12); },
    jump() { blip(300, 0.12, 'sine', 0.1); },
  };
}
