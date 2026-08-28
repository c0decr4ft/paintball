import plantedSfx from "./sfx/bomb-planted.mp3?url";
import defusedSfx from "./sfx/bomb-defused.mp3?url";

export class AudioEngine {
  constructor() {
    this.ctx = null;
  }

  unlock() {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === "suspended") this.ctx.resume();
  }

  playFile(url, volume = 0.9) {
    this.unlock();
    const a = new Audio(url);
    a.volume = volume;
    a.play().catch(() => {});
  }

  tone(freq, dur, type = "square", gain = 0.08, slide = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  noise(dur, gain = 0.12, hp = 800) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const n = this.ctx.sampleRate * dur;
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = hp;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(g).connect(this.ctx.destination);
    src.start(t);
  }

  shoot() {
    this.noise(0.12, 0.34, 220);
    this.noise(0.07, 0.18, 1100);
    this.tone(62, 0.16, "sine", 0.16, -22);
    this.tone(105, 0.12, "sawtooth", 0.18, -60);
    this.tone(250, 0.06, "square", 0.11, -150);
  }

  impact() {
    this.noise(0.04, 0.06, 900);
    this.tone(160, 0.04, "triangle", 0.03, -80);
  }

  splat() {
    this.noise(0.1, 0.12, 280);
    this.tone(110, 0.09, "sine", 0.05, -40);
  }

  hit() {
    this.tone(140, 0.18, "sawtooth", 0.09, -90);
    this.noise(0.2, 0.16, 200);
  }

  elim() {
    this.tone(320, 0.12, "square", 0.06, 80);
    this.tone(480, 0.18, "square", 0.04, 40);
  }

  empty() {
    this.tone(90, 0.08, "square", 0.04);
  }

  reload() {
    this.tone(220, 0.08, "triangle", 0.05);
    this.tone(160, 0.12, "triangle", 0.04, -20);
  }

  explode() {
    this.noise(0.55, 0.28, 80);
    this.tone(70, 0.4, "sawtooth", 0.16, -40);
    this.tone(48, 0.55, "sine", 0.12, -20);
    this.tone(180, 0.18, "square", 0.06, -100);
  }

  bombBlast() {
    this.explode();
    this.noise(1.05, 0.42, 40);
    this.tone(28, 1.15, "sine", 0.22, -8);
    this.tone(52, 0.85, "sawtooth", 0.18, -18);
    this.tone(140, 0.35, "square", 0.08, -70);
  }

  bombBeep(urgent = false) {
    this.tone(urgent ? 1040 : 620, 0.045, "square", urgent ? 0.07 : 0.04);
  }

  plant() {
    this.playFile(plantedSfx, 0.92);
  }

  defuse() {
    this.playFile(defusedSfx, 0.92);
  }
}
