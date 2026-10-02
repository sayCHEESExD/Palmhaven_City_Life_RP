import musicUrl from '../../../assets/audio/background.mp3?url';
import seaUrl from '../../../assets/audio/sea.mp3?url';
import jumpUrl from '../../../assets/audio/jump.mp3?url';
import swimUrl from '../../../assets/audio/swim.mp3?url';
import fallUrl from '../../../assets/audio/fall.mp3?url';
import punchUrl from '../../../assets/audio/punch.mp3?url';
import shineUrl from '../../../assets/audio/anime-shine.mp3?url';
import { logger } from '../util/logger.js';

const SCOPE = 'audio';

export type SoundName =
  | 'jump'
  | 'land'
  | 'step'
  | 'swim'
  | 'splash'
  | 'click'
  | 'open'
  | 'close'
  | 'buy'
  | 'cash'
  | 'refuse'
  | 'notify'
  | 'success'
  | 'door'
  | 'horn'
  | 'crash'
  | 'cuff'
  | 'jail'
  | 'heal'
  | 'photo'
  | 'eat'
  | 'note'
  | 'strum'
  | 'fish'
  | 'party'
  | 'beep';

const COOLDOWN: Partial<Record<SoundName, number>> = { step: 0.09, swim: 0.35, click: 0.04, horn: 0.25, crash: 0.25, beep: 0.6, note: 0.05, strum: 0.08 };
const SAMPLE_URLS: Partial<Record<SoundName, string>> = { jump: jumpUrl, swim: swimUrl, land: fallUrl, crash: punchUrl, success: shineUrl };
const MAX_VOICES = 14;

const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1);

/**
 * EVERY SOUND IN PALMHAVEN. Two kinds:
 *
 *   - ONE-SHOTS: the supplied samples (jump, splash, a crash's thump, a job's
 *     sparkle) and tiny synthesised voices (UI clicks, the cash register, a
 *     car horn, piano and guitar notes, the camera shutter) - bytes, not files.
 *   - LOOPS that follow the game: the ocean (the supplied surf, louder near
 *     the water), a city hum (filtered noise, muffled indoors), your engine
 *     (oscillators pitched by speed: a car purrs, a heli chops, a boat
 *     drones), the nearest police or ambulance siren, and the radio.
 *
 * Nothing starts before the first gesture; everything is bounded.
 */
export class AudioManager {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfx: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private ambienceBus: GainNode | null = null;
  private voices = 0;
  private readonly lastPlayed = new Map<SoundName, number>();
  private readonly samples = new Map<SoundName, AudioBuffer>();
  private started = false;
  private muted = false;
  private masterLevel = 1;
  private musicLevel = 0.7;
  private sfxLevel = 1;

  // Loops.
  private sea: { source: AudioBufferSourceNode; gain: GainNode } | null = null;
  private city: { gain: GainNode; filter: BiquadFilterNode } | null = null;
  private engine: { a: OscillatorNode; b: OscillatorNode; noise: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode; chop: GainNode } | null = null;
  private siren: { osc: OscillatorNode; lfo: OscillatorNode; gain: GainNode } | null = null;
  private music: HTMLAudioElement | null = null;
  private musicSource: MediaElementAudioSourceNode | null = null;
  private musicFilter: BiquadFilterNode | null = null;
  private musicGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  resume(): void {
    if (!this.context) {
      try {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.context = new Ctor();
      } catch (error) {
        logger.warn(SCOPE, `no audio context: ${String(error)}`);
        return;
      }
      const ctx = this.context;
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.masterLevel;
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -4;
      limiter.ratio.value = 10;
      this.master.connect(limiter);
      limiter.connect(ctx.destination);
      this.sfx = ctx.createGain();
      this.sfx.gain.value = 0.42 * this.sfxLevel;
      this.sfx.connect(this.master);
      this.musicBus = ctx.createGain();
      this.musicBus.gain.value = 0.26 * this.musicLevel;
      this.musicBus.connect(this.master);
      this.ambienceBus = ctx.createGain();
      this.ambienceBus.gain.value = 0.5 * this.sfxLevel;
      this.ambienceBus.connect(this.master);
      const frames = ctx.sampleRate * 2;
      this.noiseBuffer = ctx.createBuffer(1, frames, ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      let brown = 0;
      for (let i = 0; i < frames; i += 1) {
        brown = (brown + 0.02 * (Math.random() * 2 - 1)) / 1.02;
        data[i] = brown * 3.2;
      }
    }
    void this.context.resume().catch(() => undefined);
    if (!this.started) {
      this.started = true;
      this.loadSamples();
      this.startAmbience();
      this.startMusic();
      logger.info(SCOPE, 'audio started');
    }
    if (this.music?.paused && !this.muted) void this.music.play().catch(() => undefined);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.context) this.master.gain.setTargetAtTime(muted ? 0 : this.masterLevel, this.context.currentTime, 0.05);
    if (muted) this.music?.pause();
    else if (this.started) void this.music?.play().catch(() => undefined);
  }

  toggleMuted(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  setMasterVolume(level: number): void {
    this.masterLevel = clamp01(level);
    if (this.master && this.context && !this.muted) this.master.gain.setTargetAtTime(this.masterLevel, this.context.currentTime, 0.05);
  }

  setMusicVolume(level: number): void {
    this.musicLevel = clamp01(level);
    if (this.musicBus && this.context) this.musicBus.gain.setTargetAtTime(0.26 * this.musicLevel, this.context.currentTime, 0.05);
  }

  setSfxVolume(level: number): void {
    this.sfxLevel = clamp01(level);
    if (this.sfx && this.context) this.sfx.gain.setTargetAtTime(0.42 * this.sfxLevel, this.context.currentTime, 0.05);
    if (this.ambienceBus && this.context) this.ambienceBus.gain.setTargetAtTime(0.5 * this.sfxLevel, this.context.currentTime, 0.05);
  }

  get musicVolume(): number {
    return this.musicLevel;
  }

  get sfxVolume(): number {
    return this.sfxLevel;
  }

  // ------------------------------------------------------------- loops

  private startAmbience(): void {
    const ctx = this.context;
    const bus = this.ambienceBus;
    if (!ctx || !bus || !this.noiseBuffer) return;
    // City hum: brown noise, low-passed.
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    noise.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 520;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    noise.connect(filter).connect(gain).connect(bus);
    noise.start();
    this.city = { gain, filter };
    // Engine: two detuned oscillators and a breath of noise.
    const a = ctx.createOscillator();
    a.type = 'sawtooth';
    const b = ctx.createOscillator();
    b.type = 'square';
    const en = ctx.createBufferSource();
    en.buffer = this.noiseBuffer;
    en.loop = true;
    const ef = ctx.createBiquadFilter();
    ef.type = 'lowpass';
    ef.frequency.value = 400;
    ef.Q.value = 2;
    const chop = ctx.createGain();
    chop.gain.value = 1;
    const eg = ctx.createGain();
    eg.gain.value = 0;
    const mixA = ctx.createGain();
    mixA.gain.value = 0.45;
    const mixB = ctx.createGain();
    mixB.gain.value = 0.25;
    const mixN = ctx.createGain();
    mixN.gain.value = 0.5;
    a.connect(mixA).connect(ef);
    b.connect(mixB).connect(ef);
    en.connect(mixN).connect(ef);
    ef.connect(chop).connect(eg).connect(this.sfx!);
    a.start();
    b.start();
    en.start();
    this.engine = { a, b, noise: en, filter: ef, gain: eg, chop };
    // Siren: an oscillator swept by a slow LFO.
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 900;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.55;
    const depth = ctx.createGain();
    depth.gain.value = 380;
    lfo.connect(depth).connect(osc.frequency);
    const sg = ctx.createGain();
    sg.gain.value = 0;
    osc.connect(sg).connect(this.sfx!);
    osc.start();
    lfo.start();
    this.siren = { osc, lfo, gain: sg };
  }

  private startMusic(): void {
    const ctx = this.context;
    const bus = this.musicBus;
    if (!ctx || !bus) return;
    const element = new Audio(musicUrl);
    element.loop = true;
    element.crossOrigin = 'anonymous';
    element.preload = 'auto';
    try {
      this.musicSource = ctx.createMediaElementSource(element);
      this.musicFilter = ctx.createBiquadFilter();
      this.musicFilter.type = 'lowpass';
      this.musicFilter.frequency.value = 20000;
      this.musicGain = ctx.createGain();
      this.musicGain.gain.value = 0.55;
      this.musicSource.connect(this.musicFilter).connect(this.musicGain).connect(bus);
    } catch (error) {
      logger.warn(SCOPE, `music not routed: ${String(error)}`);
      return;
    }
    this.music = element;
    if (!this.muted) void element.play().catch(() => undefined);
  }

  /**
   * Per frame: how loud the sea and the city are, whether we are indoors, the
   * engine of the vehicle we drive (null on foot), the nearest siren, and the
   * radio station (0 = off: on foot the music plays softly instead).
   */
  update(state: {
    ocean: number;
    indoors: boolean;
    engine: { speed: number; max: number; throttle: number; kind: 'car' | 'bike' | 'boat' | 'heli' | 'plane' | 'board' } | null;
    siren: number;
    radio: number;
    inVehicle: boolean;
  }): void {
    const ctx = this.context;
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    if (this.city) {
      this.city.gain.gain.setTargetAtTime((state.indoors ? 0.12 : 0.42) * (1 - state.ocean * 0.6), t, 0.4);
      this.city.filter.frequency.setTargetAtTime(state.indoors ? 220 : 520, t, 0.3);
    }
    this.ensureSea(state.ocean * (state.indoors ? 0.25 : 1));
    if (this.engine) {
      const e = state.engine;
      if (!e || e.kind === 'board') {
        this.engine.gain.gain.setTargetAtTime(0, t, 0.15);
      } else {
        const k = Math.min(1.3, Math.abs(e.speed) / Math.max(10, e.max));
        const base = e.kind === 'boat' ? 55 : e.kind === 'heli' ? 48 : e.kind === 'plane' ? 70 : e.kind === 'bike' ? 80 : 46;
        const freq = base + k * base * 2.2 + e.throttle * 18;
        this.engine.a.frequency.setTargetAtTime(freq, t, 0.08);
        this.engine.b.frequency.setTargetAtTime(freq * 0.5 + 3, t, 0.08);
        this.engine.filter.frequency.setTargetAtTime(280 + k * 900 + e.throttle * 300, t, 0.1);
        const loud = e.kind === 'heli' ? 0.5 : 0.2 + k * 0.22 + e.throttle * 0.1;
        this.engine.gain.gain.setTargetAtTime(loud * (state.indoors ? 0.3 : 1), t, 0.12);
        // A helicopter's chop.
        if (e.kind === 'heli') {
          const beat = 0.6 + 0.4 * Math.sin(performance.now() / 1000 * Math.PI * 2 * 11);
          this.engine.chop.gain.setTargetAtTime(beat, t, 0.005);
        } else {
          this.engine.chop.gain.setTargetAtTime(1, t, 0.05);
        }
      }
    }
    if (this.siren) this.siren.gain.gain.setTargetAtTime(0.16 * state.siren, t, 0.1);
    // Radio in a vehicle, background music on foot.
    if (this.musicGain && this.musicFilter && this.music) {
      const station = state.inVehicle ? state.radio : -1;
      const wanted = state.inVehicle ? (station === 0 ? 0 : 0.95) : 0.38;
      this.musicGain.gain.setTargetAtTime(wanted, t, 0.3);
      this.musicFilter.frequency.setTargetAtTime(station === 2 ? 1600 : station === 3 ? 900 : state.indoors ? 2400 : 20000, t, 0.3);
      this.music.playbackRate = station === 2 ? 0.94 : station === 3 ? 0.88 : 1;
    }
  }

  private ensureSea(level: number): void {
    const ctx = this.context;
    const bus = this.ambienceBus;
    if (!ctx || !bus) return;
    const buffer = this.samples.get('splash' as SoundName) ? null : null;
    void buffer;
    const sea = this.samples.get('sea' as SoundName);
    if (!this.sea && sea) {
      const source = ctx.createBufferSource();
      source.buffer = sea;
      source.loop = true;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      source.connect(gain).connect(bus);
      source.start();
      this.sea = { source, gain };
    }
    if (this.sea) this.sea.gain.gain.setTargetAtTime(0.85 * level, ctx.currentTime, 0.5);
  }

  // ----------------------------------------------------------- one-shots

  private loadSamples(): void {
    const ctx = this.context;
    if (!ctx) return;
    const all: [string, string][] = [...Object.entries(SAMPLE_URLS), ['sea', seaUrl]];
    for (const [name, url] of all) {
      void fetch(url)
        .then((r) => (r.ok ? r.arrayBuffer() : null))
        .then((data) => (data ? ctx.decodeAudioData(data) : null))
        .then((buffer) => {
          if (buffer) this.samples.set(name as SoundName, buffer);
        })
        .catch(() => undefined);
    }
  }

  /** Play a one-shot. `gain` 0..1, `pan` -1..1 (left..right), `pitch` rate. */
  play(name: SoundName, gain = 1, pitch = 1): void {
    const ctx = this.context;
    const bus = this.sfx;
    if (!ctx || !bus || this.muted || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const last = this.lastPlayed.get(name) ?? -Infinity;
    if (now - last < (COOLDOWN[name] ?? 0.06)) return;
    if (this.voices >= MAX_VOICES) return;
    this.lastPlayed.set(name, now);
    const g = Math.max(0, Math.min(1, gain));
    if (this.sample(name, now, g, pitch)) return;
    switch (name) {
      case 'step':
        this.thud(now, 0.12 * g, 140 * pitch);
        break;
      case 'land':
        this.thud(now, 0.3 * g, 110);
        break;
      case 'swim':
      case 'splash':
        this.noise(now, 0.35, 0.3 * g, 1800);
        break;
      case 'click':
        this.blip(now, 'square', 1300, 900, 0.03, 0.07);
        break;
      case 'open':
        this.blip(now, 'sine', 520, 880, 0.09, 0.16);
        break;
      case 'close':
        this.blip(now, 'sine', 700, 420, 0.08, 0.12);
        break;
      case 'buy':
      case 'cash':
        // A cash register: a bell ding and the drawer.
        this.blip(now, 'triangle', 1568, 1568, 0.35, 0.22 * g);
        this.blip(now + 0.05, 'triangle', 2093, 2093, 0.45, 0.16 * g);
        this.noise(now + 0.12, 0.12, 0.12 * g, 3000);
        break;
      case 'refuse':
        this.blip(now, 'square', 240, 160, 0.18, 0.16);
        break;
      case 'notify':
        this.arpeggio(now, [0, 7], 0.08, 'sine', 0.2);
        break;
      case 'success':
        this.arpeggio(now, [0, 4, 7, 12], 0.08, 'triangle', 0.3);
        break;
      case 'door':
        this.thud(now, 0.3 * g, 90);
        this.noise(now, 0.08, 0.1 * g, 2400);
        break;
      case 'horn':
        this.blip(now, 'sawtooth', 392 * pitch, 392 * pitch, 0.42, 0.18 * g);
        this.blip(now, 'sawtooth', 494 * pitch, 494 * pitch, 0.42, 0.15 * g);
        break;
      case 'crash':
        this.noise(now, 0.4, 0.5 * g, 500);
        this.thud(now, 0.6 * g, 70);
        break;
      case 'cuff':
        this.blip(now, 'square', 2200, 1900, 0.04, 0.12);
        this.blip(now + 0.07, 'square', 2400, 2000, 0.04, 0.12);
        break;
      case 'jail':
        this.thud(now, 0.5, 60);
        this.noise(now, 0.5, 0.25, 900);
        break;
      case 'heal':
        this.arpeggio(now, [0, 4, 7, 11, 14], 0.06, 'sine', 0.22);
        break;
      case 'photo':
        this.noise(now, 0.05, 0.3, 4000);
        this.noise(now + 0.07, 0.06, 0.2, 2500);
        break;
      case 'eat':
        this.noise(now, 0.06, 0.18, 1200);
        this.noise(now + 0.14, 0.06, 0.16, 1100);
        break;
      case 'note':
        this.pluck(now, 261.6 * pitch, 0.9, 0.22 * g, 'triangle');
        break;
      case 'strum':
        for (let i = 0; i < 4; i += 1) this.pluck(now + i * 0.025, 196 * pitch * [1, 1.26, 1.5, 2][i]!, 1.1, 0.12 * g, 'sawtooth');
        break;
      case 'fish':
        this.noise(now, 0.4, 0.3, 1600);
        this.arpeggio(now + 0.2, [0, 5, 9], 0.07, 'triangle', 0.22);
        break;
      case 'party':
        for (let i = 0; i < 8; i += 1) this.thud(now + i * 0.25, 0.25, 70);
        break;
      case 'beep':
        this.blip(now, 'sine', 1000, 1000, 0.12, 0.08 * g);
        break;
      case 'jump':
        this.blip(now, 'sine', 300, 700, 0.12, 0.2);
        break;
    }
  }

  private sample(name: SoundName, when: number, gain: number, rate: number): boolean {
    const ctx = this.context;
    const buffer = this.samples.get(name);
    if (!ctx || !buffer || !this.sfx) return false;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = Math.min(2.5, Math.max(0.4, rate));
    const g = ctx.createGain();
    g.gain.value = gain * (name === 'crash' ? 0.9 : 0.6);
    source.connect(g).connect(this.sfx);
    this.voices += 1;
    source.onended = () => {
      this.voices = Math.max(0, this.voices - 1);
    };
    source.start(when);
    return true;
  }

  private hold(node: AudioScheduledSourceNode, env: GainNode, at: number, length: number): void {
    this.voices += 1;
    node.start(at);
    node.stop(at + length + 0.03);
    node.onended = () => {
      this.voices = Math.max(0, this.voices - 1);
      node.disconnect();
      env.disconnect();
    };
  }

  private blip(at: number, shape: OscillatorType, from: number, to: number, length: number, gain: number): void {
    const ctx = this.context!;
    const osc = ctx.createOscillator();
    osc.type = shape;
    osc.frequency.setValueAtTime(from, at);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), at + length);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), at + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, at + length);
    osc.connect(env).connect(this.sfx!);
    this.hold(osc, env, at, length);
  }

  private pluck(at: number, freq: number, length: number, gain: number, shape: OscillatorType): void {
    const ctx = this.context!;
    const osc = ctx.createOscillator();
    osc.type = shape;
    osc.frequency.value = freq;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(freq * 6, at);
    filter.frequency.exponentialRampToValueAtTime(freq * 1.2, at + length);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), at + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, at + length);
    osc.connect(filter).connect(env).connect(this.sfx!);
    this.hold(osc, env, at, length);
  }

  private noise(at: number, length: number, gain: number, frequency: number): void {
    const ctx = this.context!;
    const frames = Math.max(1, Math.floor(ctx.sampleRate * length));
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = frequency;
    const env = ctx.createGain();
    env.gain.setValueAtTime(Math.max(0.0002, gain), at);
    env.gain.exponentialRampToValueAtTime(0.0001, at + length);
    source.connect(filter).connect(env).connect(this.sfx!);
    this.hold(source, env, at, length);
  }

  private thud(at: number, gain: number, frequency: number): void {
    const ctx = this.context!;
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(frequency, at);
    osc.frequency.exponentialRampToValueAtTime(frequency * 0.45, at + 0.09);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), at + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, at + 0.14);
    osc.connect(env).connect(this.sfx!);
    this.hold(osc, env, at, 0.14);
  }

  private arpeggio(at: number, semitones: readonly number[], step: number, shape: OscillatorType, gain: number): void {
    semitones.forEach((s, i) => this.blip(at + i * step, shape, 523 * 2 ** (s / 12), 523 * 2 ** (s / 12), step * 2.4, gain));
  }

  dispose(): void {
    this.music?.pause();
    void this.context?.close().catch(() => undefined);
    this.context = null;
  }
}
