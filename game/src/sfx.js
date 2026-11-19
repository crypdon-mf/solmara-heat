// All sound is synthesised with WebAudio — no audio files, no network.
// Engine hum tracks speed, sirens wail, a bassline loop plays under the city.
export class Sfx {
  constructor() {
    this.ctx = null; this.muted = false;
    this.engineOsc = null; this.engineGain = null; this.engineFilter = null;
    this.musicTimer = null; this.musicStep = 0;
    this.sirenOsc = null; this.sirenGain = null; this.sirenOn = false;
  }
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    // Engine: two detuned saws through a lowpass, gain follows speed.
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    const sub = this.ctx.createOscillator();
    sub.type = 'square'; sub.frequency.value = 28;
    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass'; this.engineFilter.frequency.value = 500;
    this.engineGain = this.ctx.createGain(); this.engineGain.gain.value = 0;
    const subGain = this.ctx.createGain(); subGain.gain.value = 0.5;
    this.engineOsc.connect(this.engineFilter);
    sub.connect(subGain); subGain.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.ctx.destination);
    this.engineOsc.start(); sub.start();
    this._sub = sub;
    // Siren: triangle that the update loop bends up and down.
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'triangle'; this.sirenOsc.frequency.value = 700;
    this.sirenGain = this.ctx.createGain(); this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(this.ctx.destination);
    this.sirenOsc.start();
    this.startMusic();
  }
  setEngine(speedNorm, on) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const rpm = 55 + speedNorm * 165 + (on ? 8 : 0);
    this.engineOsc.frequency.setTargetAtTime(rpm, t, 0.08);
    this._sub.frequency.setTargetAtTime(rpm / 2, t, 0.08);
    this.engineFilter.frequency.setTargetAtTime(320 + speedNorm * 1400, t, 0.1);
    this.engineGain.gain.setTargetAtTime(this.muted ? 0 : (on ? 0.05 + speedNorm * 0.075 : 0), t, 0.1);
  }
  setSiren(on, dt) {
    if (!this.ctx) return;
    this.sirenOn = on;
    if (!on) { this.sirenGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1); return; }
    this._sirenPhase = (this._sirenPhase || 0) + dt * 2.4;
    const f = 620 + 260 * Math.sin(this._sirenPhase);
    this.sirenOsc.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.05);
    this.sirenGain.gain.setTargetAtTime(this.muted ? 0 : 0.028, this.ctx.currentTime, 0.2);
  }
  blip(freq, dur, type = 'sine', vol = 0.12) {
    if (!this.ctx || this.muted) return;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    o.connect(g); g.connect(this.ctx.destination);
    o.start(); o.stop(this.ctx.currentTime + dur);
  }
  noise(dur, vol = 0.2, low = 400) {
    if (!this.ctx || this.muted) return;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = low;
    const g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.ctx.destination);
    src.start();
  }
  gunshot() { this.noise(0.14, 0.3, 2400); this.blip(140, 0.09, 'square', 0.1); }
  crash(intensity = 1) { this.noise(0.25, 0.25 * intensity, 700); this.blip(70, 0.2, 'sine', 0.22 * intensity); }
  punch() { this.noise(0.08, 0.18, 900); }
  pickup() { this.blip(880, 0.12); setTimeout(() => this.blip(1318, 0.16), 90); }
  jingle(win = true) {
    const notes = win ? [523, 659, 784, 1046] : [392, 330, 262, 196];
    notes.forEach((n, i) => setTimeout(() => this.blip(n, 0.22, 'triangle', 0.14), i * 130));
  }
  horn() { this.blip(370, 0.25, 'square', 0.05); setTimeout(() => this.blip(370, 0.2, 'square', 0.05), 260); }
  toggleMute() { this.muted = !this.muted; return this.muted; }
  startMusic() {
    // 8-step bassline + hats, 132 BPM, scheduled with lookahead via setInterval.
    const bass = [55, 0, 55, 65.4, 55, 0, 82.4, 73.4];
    this.musicTimer = setInterval(() => {
      if (!this.ctx || this.muted) return;
      const step = this.musicStep++ % 8;
      const f = bass[step];
      if (f) this.blip(f, 0.32, 'triangle', 0.055);
      if (step % 2 === 0) this.noise(0.03, 0.02, 6000);
    }, 227);
  }
}
