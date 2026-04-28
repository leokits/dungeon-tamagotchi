/**
 * Procedural Audio System for Dungeon Tamagotchi
 *
 * Generates all game sound effects and ambient music procedurally
 * using the Web Audio API — no external audio files needed.
 *
 * Sounds are designed for a dark fantasy dungeon crawler aesthetic:
 * deep, atmospheric, slightly eerie.
 */

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

type VolumeChannel = "master" | "sfx" | "ambient" | "music";

type PendingSound = () => void;

// ═══════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Generate a noise buffer filled with random values (-1 to 1).
 */
function createNoiseBuffer(
  duration: number,
  sampleRate: number
): AudioBuffer {
  const length = Math.ceil(sampleRate * duration);
  const buffer = new AudioBuffer({
    length,
    sampleRate,
    numberOfChannels: 1,
  });
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

/**
 * Apply an ADSR-style envelope to a gain node.
 *
 * @param gainNode - The GainNode to shape
 * @param attack - Attack time in seconds
 * @param decay - Decay time in seconds
 * @param sustainLevel - Sustain gain level (0-1)
 * @param release - Release time in seconds
 * @param totalDuration - Total duration in seconds (attack + decay + sustain + release)
 */
function createEnvelope(
  gainNode: GainNode,
  attack: number,
  decay: number,
  sustainLevel: number,
  release: number,
  totalDuration: number
): void {
  const ctx = gainNode.context;
  const now = ctx.currentTime;
  const sustainDuration = totalDuration - attack - decay - release;

  gainNode.gain.setValueAtTime(0, now);
  gainNode.gain.linearRampToValueAtTime(1, now + attack);
  gainNode.gain.linearRampToValueAtTime(
    sustainLevel,
    now + attack + decay
  );
  if (sustainDuration > 0) {
    gainNode.gain.setValueAtTime(sustainLevel, now + attack + decay + sustainDuration);
  }
  gainNode.gain.linearRampToValueAtTime(
    0,
    now + attack + decay + sustainDuration + release
  );
}

/**
 * Play a simple tone with configurable parameters.
 */
function playTone(
  ctx: AudioContext,
  destination: AudioNode,
  frequency: number,
  duration: number,
  type: OscillatorType = "sine",
  volume: number = 0.3,
  detune: number = 0,
  startDelay: number = 0
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(frequency, ctx.currentTime + startDelay);
  osc.detune.setValueAtTime(detune, ctx.currentTime + startDelay);

  gain.gain.setValueAtTime(0, ctx.currentTime + startDelay);
  gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + startDelay + 0.01);
  gain.gain.linearRampToValueAtTime(0, ctx.currentTime + startDelay + duration);

  osc.connect(gain);
  gain.connect(destination);

  osc.start(ctx.currentTime + startDelay);
  osc.stop(ctx.currentTime + startDelay + duration);
}

/**
 * Play a tone with a frequency sweep (glide).
 */
function playSweep(
  ctx: AudioContext,
  destination: AudioNode,
  startFreq: number,
  endFreq: number,
  duration: number,
  type: OscillatorType = "sine",
  volume: number = 0.3,
  startDelay: number = 0
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(startFreq, ctx.currentTime + startDelay);
  osc.frequency.linearRampToValueAtTime(endFreq, ctx.currentTime + startDelay + duration);

  gain.gain.setValueAtTime(0, ctx.currentTime + startDelay);
  gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + startDelay + 0.01);
  gain.gain.linearRampToValueAtTime(0, ctx.currentTime + startDelay + duration);

  osc.connect(gain);
  gain.connect(destination);

  osc.start(ctx.currentTime + startDelay);
  osc.stop(ctx.currentTime + startDelay + duration);
}

/**
 * Play filtered noise through a destination node.
 */
function playNoise(
  ctx: AudioContext,
  destination: AudioNode,
  duration: number,
  filterType: BiquadFilterType,
  filterFreq: number,
  volume: number = 0.2,
  startDelay: number = 0
): void {
  const source = ctx.createBufferSource();
  source.buffer = createNoiseBuffer(duration + 0.1, ctx.sampleRate);

  const filter = ctx.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.setValueAtTime(filterFreq, ctx.currentTime + startDelay);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, ctx.currentTime + startDelay);
  gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + startDelay + 0.005);
  gain.gain.linearRampToValueAtTime(0, ctx.currentTime + startDelay + duration);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(destination);

  source.start(ctx.currentTime + startDelay);
  source.stop(ctx.currentTime + startDelay + duration + 0.05);
}

// ═══════════════════════════════════════════════════════════════════
// AMBIENT MUSIC STATE
// ═══════════════════════════════════════════════════════════════════

interface AmbientState {
  oscillators: OscillatorNode[];
  gains: GainNode[];
  noiseSource: AudioBufferSourceNode | null;
  noiseGain: GainNode | null;
  randomToneInterval: ReturnType<typeof setInterval> | null;
}

// ═══════════════════════════════════════════════════════════════════
// AUDIO MANAGER
// ═══════════════════════════════════════════════════════════════════

export class AudioManager {
  private static _instance: AudioManager | null = null;

  private _audioContext: AudioContext | null = null;
  private _masterGain: GainNode | null = null;
  private _sfxGain: GainNode | null = null;
  private _ambientGain: GainNode | null = null;
  private _musicGain: GainNode | null = null;
  private _initialized = false;
  private _muted = false;
  private _pendingSounds: PendingSound[] = [];
  private _ambient: AmbientState | null = null;

  private constructor() {}

  /**
   * Get the singleton instance of AudioManager.
   */
  static get instance(): AudioManager {
    if (!AudioManager._instance) {
      AudioManager._instance = new AudioManager();
    }
    return AudioManager._instance;
  }

  // ─── Getters ───────────────────────────────────────────────────

  get audioContext(): AudioContext | null {
    return this._audioContext;
  }

  get masterGain(): GainNode | null {
    return this._masterGain;
  }

  get sfxGain(): GainNode | null {
    return this._sfxGain;
  }

  get ambientGain(): GainNode | null {
    return this._ambientGain;
  }

  get musicGain(): GainNode | null {
    return this._musicGain;
  }

  get initialized(): boolean {
    return this._initialized;
  }

  get muted(): boolean {
    return this._muted;
  }

  // ─── Initialization ────────────────────────────────────────────

  /**
   * Create AudioContext and gain nodes.
   * Must be called after user interaction (click, tap, keypress).
   */
  init(): void {
    if (this._initialized) return;

    this._audioContext = new AudioContext();
    this._masterGain = this._audioContext.createGain();
    this._sfxGain = this._audioContext.createGain();
    this._ambientGain = this._audioContext.createGain();
    this._musicGain = this._audioContext.createGain();

    // Set default volumes
    this._sfxGain.gain.setValueAtTime(0.7, this._audioContext.currentTime);
    this._ambientGain.gain.setValueAtTime(0.3, this._audioContext.currentTime);
    this._musicGain.gain.setValueAtTime(0.4, this._audioContext.currentTime);
    this._masterGain.gain.setValueAtTime(1, this._audioContext.currentTime);

    // Route: channel gains → master gain → destination
    this._sfxGain.connect(this._masterGain);
    this._ambientGain.connect(this._masterGain);
    this._musicGain.connect(this._masterGain);
    this._masterGain.connect(this._audioContext.destination);

    this._initialized = true;

    // Play any sounds that were queued before initialization
    this._flushPendingSounds();
  }

  /**
   * Execute all pending sounds that were queued before init.
   */
  private _flushPendingSounds(): void {
    const pending = [...this._pendingSounds];
    this._pendingSounds = [];
    for (const fn of pending) {
      fn();
    }
  }

  /**
   * Queue a sound to play later if not yet initialized, or play immediately.
   */
  private _playOrQueue(fn: () => void): void {
    if (!this._initialized) {
      this._pendingSounds.push(fn);
      return;
    }
    fn();
  }

  /**
   * Get the appropriate destination gain node for a sound type.
   */
  private _getDestination(type: "sfx" | "ambient" | "music"): GainNode | null {
    switch (type) {
      case "sfx":
        return this._sfxGain;
      case "ambient":
        return this._ambientGain;
      case "music":
        return this._musicGain;
    }
  }

  // ─── Volume Controls ───────────────────────────────────────────

  /**
   * Set volume for a specific channel (0-1).
   */
  setVolume(type: VolumeChannel, value: number): void {
    const clamped = Math.max(0, Math.min(1, value));

    if (!this._initialized) return;

    switch (type) {
      case "master":
        this._masterGain?.gain.setTargetAtTime(clamped, this._audioContext!.currentTime, 0.01);
        break;
      case "sfx":
        this._sfxGain?.gain.setTargetAtTime(clamped, this._audioContext!.currentTime, 0.01);
        break;
      case "ambient":
        this._ambientGain?.gain.setTargetAtTime(clamped, this._audioContext!.currentTime, 0.01);
        break;
      case "music":
        this._musicGain?.gain.setTargetAtTime(clamped, this._audioContext!.currentTime, 0.01);
        break;
    }
  }

  /**
   * Toggle master mute on/off.
   */
  toggleMute(): void {
    this._muted = !this._muted;
    if (!this._initialized) return;

    this._masterGain?.gain.setTargetAtTime(
      this._muted ? 0 : 1,
      this._audioContext!.currentTime,
      0.01
    );
  }

  // ─── Cleanup ───────────────────────────────────────────────────

  /**
   * Close AudioContext and clean up all resources.
   */
  dispose(): void {
    this.stopAmbient();

    if (this._audioContext) {
      this._audioContext.close();
      this._audioContext = null;
    }
    this._masterGain = null;
    this._sfxGain = null;
    this._ambientGain = null;
    this._musicGain = null;
    this._initialized = false;
    this._pendingSounds = [];
  }

  // ═══════════════════════════════════════════════════════════════
  // PROCEDURAL SFX
  // ═══════════════════════════════════════════════════════════════

  /**
   * Short noise burst — digging sound.
   * White noise through bandpass filter, 100ms decay.
   */
  playDig(): void {
    this._playOrQueue(() => {
      const ctx = this._audioContext!;
      const dest = this._getDestination("sfx")!;
      playNoise(ctx, dest, 0.1, "bandpass", 800, 0.25);
    });
  }

  /**
   * Short ascending tone — eating sound.
   * Sine wave, 200ms, 300→600Hz.
   */
  playEat(): void {
    this._playOrQueue(() => {
      const ctx = this._audioContext!;
      const dest = this._getDestination("sfx")!;
      playSweep(ctx, dest, 300, 600, 0.2, "sine", 0.3);
    });
  }

  /**
   * Ascending arpeggio — evolution sound.
   * C-E-G-C, sine waves, 800ms total, each note 200ms.
   * Returns a promise that resolves when the arpeggio finishes.
   */
  playEvolution(): Promise<void> {
    return new Promise<void>((resolve) => {
      this._playOrQueue(() => {
        const ctx = this._audioContext!;
        const dest = this._getDestination("sfx")!;
        const now = ctx.currentTime;

        // C4, E4, G4, C5
        const notes = [261.63, 329.63, 392.0, 523.25];
        const noteDuration = 0.2;
        const gap = 0.02; // small gap between notes

        notes.forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();

          osc.type = "sine";
          osc.frequency.setValueAtTime(freq, now + i * (noteDuration + gap));

          const start = now + i * (noteDuration + gap);
          gain.gain.setValueAtTime(0, start);
          gain.gain.linearRampToValueAtTime(0.35, start + 0.02);
          gain.gain.linearRampToValueAtTime(0, start + noteDuration);

          osc.connect(gain);
          gain.connect(dest);

          osc.start(start);
          osc.stop(start + noteDuration + 0.05);
        });

        setTimeout(resolve, 800);
      });
    });
  }

  /**
   * Descending tone with distortion — death sound.
   * Sawtooth, 500ms, 400→100Hz.
   */
  playDeath(): void {
    this._playOrQueue(() => {
      const ctx = this._audioContext!;
      const dest = this._getDestination("sfx")!;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const distortion = ctx.createWaveShaper();

      // Create distortion curve
      const samples = 44100;
      const curve = new Float32Array(samples);
      for (let i = 0; i < samples; i++) {
        const x = (i * 2) / samples - 1;
        curve[i] = ((3 + 20) * x * 20 * (Math.PI / 180)) / (Math.PI + 20 * Math.abs(x));
      }
      distortion.curve = curve;

      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(400, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.5);

      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5);

      osc.connect(distortion);
      distortion.connect(gain);
      gain.connect(dest);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.55);
    });
  }

  /**
   * Dramatic chord — raid start.
   * C minor (C-Eb-G), triangle waves, 600ms, slight detune for thickness.
   */
  playRaidStart(): void {
    this._playOrQueue(() => {
      const ctx = this._audioContext!;
      const dest = this._getDestination("sfx")!;
      const now = ctx.currentTime;
      const duration = 0.6;

      // C3, Eb3, G3 with slight detune variations for thickness
      const notes = [
        { freq: 130.81, detune: -5 },
        { freq: 155.56, detune: 3 },
        { freq: 196.0, detune: -3 },
        // Add octave doubles for richness
        { freq: 261.63, detune: 5 },
        { freq: 311.13, detune: -7 },
        { freq: 392.0, detune: 7 },
      ];

      notes.forEach(({ freq, detune }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "triangle";
        osc.frequency.setValueAtTime(freq, now);
        osc.detune.setValueAtTime(detune, now);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.12, now + 0.05);
        gain.gain.linearRampToValueAtTime(0, now + duration);

        osc.connect(gain);
        gain.connect(dest);

        osc.start(now);
        osc.stop(now + duration + 0.05);
      });
    });
  }

  /**
   * Triumphant fanfare — raid victory.
   * C-E-G-C major arpeggio, brass-like using square waves, 1s.
   */
  playRaidVictory(): void {
    this._playOrQueue(() => {
      const ctx = this._audioContext!;
      const dest = this._getDestination("sfx")!;
      const now = ctx.currentTime;
      const duration = 1.0;

      // C4, E4, G4, C5 — major arpeggio
      const notes = [261.63, 329.63, 392.0, 523.25];
      const noteDuration = 0.2;
      const gap = 0.05;

      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "square";
        osc.frequency.setValueAtTime(freq, now + i * (noteDuration + gap));

        const start = now + i * (noteDuration + gap);
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.15, start + 0.02);
        gain.gain.linearRampToValueAtTime(0.12, start + noteDuration * 0.7);
        gain.gain.linearRampToValueAtTime(0, start + noteDuration);

        osc.connect(gain);
        gain.connect(dest);

        osc.start(start);
        osc.stop(start + noteDuration + 0.05);
      });

      // Final sustained chord
      const chordFreqs = [261.63, 329.63, 392.0, 523.25];
      const chordStart = now + notes.length * (noteDuration + gap);
      chordFreqs.forEach((freq) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "square";
        osc.frequency.setValueAtTime(freq, chordStart);

        gain.gain.setValueAtTime(0, chordStart);
        gain.gain.linearRampToValueAtTime(0.1, chordStart + 0.03);
        gain.gain.linearRampToValueAtTime(0, chordStart + 0.4);

        osc.connect(gain);
        gain.connect(dest);

        osc.start(chordStart);
        osc.stop(chordStart + 0.45);
      });
    });
  }

  /**
   * Somber descending — raid defeat.
   * G-E-C, minor, 800ms.
   */
  playRaidDefeat(): void {
    this._playOrQueue(() => {
      const ctx = this._audioContext!;
      const dest = this._getDestination("sfx")!;
      const now = ctx.currentTime;

      // G3, E3, C3 — descending minor
      const notes = [196.0, 164.81, 130.81];
      const noteDuration = 0.25;
      const gap = 0.03;

      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "triangle";
        osc.frequency.setValueAtTime(freq, now + i * (noteDuration + gap));

        const start = now + i * (noteDuration + gap);
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.25, start + 0.03);
        gain.gain.linearRampToValueAtTime(0, start + noteDuration);

        osc.connect(gain);
        gain.connect(dest);

        osc.start(start);
        osc.stop(start + noteDuration + 0.05);
      });
    });
  }

  /**
   * Gentle chirp — hatch sound.
   * Sine wave, 300ms, 500→800→500Hz, like a bird.
   */
  playHatch(): void {
    this._playOrQueue(() => {
      const ctx = this._audioContext!;
      const dest = this._getDestination("sfx")!;
      const now = ctx.currentTime;
      const duration = 0.3;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(500, now);
      osc.frequency.linearRampToValueAtTime(800, now + duration * 0.5);
      osc.frequency.linearRampToValueAtTime(500, now + duration);

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.3, now + 0.02);
      gain.gain.linearRampToValueAtTime(0, now + duration);

      osc.connect(gain);
      gain.connect(dest);

      osc.start(now);
      osc.stop(now + duration + 0.05);
    });
  }

  /**
   * UI click sound.
   * Very short sine burst, 50ms, 800Hz.
   */
  playClick(): void {
    this._playOrQueue(() => {
      const ctx = this._audioContext!;
      const dest = this._getDestination("sfx")!;
      playTone(ctx, dest, 800, 0.05, "sine", 0.2);
    });
  }

  /**
   * Error buzz.
   * Square wave, 200ms, 150Hz.
   */
  playError(): void {
    this._playOrQueue(() => {
      const ctx = this._audioContext!;
      const dest = this._getDestination("sfx")!;
      playTone(ctx, dest, 150, 0.2, "square", 0.2);
    });
  }

  /**
   * Celebration — level up.
   * Ascending scale C-D-E-F-G, 500ms.
   */
  playLevelUp(): void {
    this._playOrQueue(() => {
      const ctx = this._audioContext!;
      const dest = this._getDestination("sfx")!;
      const now = ctx.currentTime;
      const totalDuration = 0.5;

      // C4, D4, E4, F4, G4
      const notes = [261.63, 293.66, 329.63, 349.23, 392.0];
      const noteDuration = totalDuration / notes.length;
      const gap = 0.01;

      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now + i * (noteDuration + gap));

        const start = now + i * (noteDuration + gap);
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.3, start + 0.01);
        gain.gain.linearRampToValueAtTime(0, start + noteDuration);

        osc.connect(gain);
        gain.connect(dest);

        osc.start(start);
        osc.stop(start + noteDuration + 0.05);
      });
    });
  }

  /**
   * Impact sound — damage.
   * Short noise burst + low tone, 150ms.
   */
  playDamage(): void {
    this._playOrQueue(() => {
      const ctx = this._audioContext!;
      const dest = this._getDestination("sfx")!;
      const now = ctx.currentTime;
      const duration = 0.15;

      // Noise burst
      playNoise(ctx, dest, duration, "lowpass", 600, 0.3);

      // Low thud
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(120, now);
      osc.frequency.exponentialRampToValueAtTime(60, now + duration);

      gain.gain.setValueAtTime(0.35, now);
      gain.gain.linearRampToValueAtTime(0, now + duration);

      osc.connect(gain);
      gain.connect(dest);

      osc.start(now);
      osc.stop(now + duration + 0.05);
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // PROCEDURAL AMBIENT MUSIC
  // ═══════════════════════════════════════════════════════════════

  /**
   * Start a looping ambient drone.
   *
   * Components:
   * - Low drone: sine wave at 55Hz (A1), very quiet
   * - Sub-bass: sine wave at 40Hz, barely audible
   * - Occasional high tones: random pentatonic notes (sine, very quiet, every 3-8 seconds)
   * - Filtered noise for "cave atmosphere" (lowpass filtered white noise)
   */
  startAmbient(): void {
    this._playOrQueue(() => {
      if (this._ambient) return; // Already playing

      const ctx = this._audioContext!;
      const dest = this._getDestination("ambient")!;
      const now = ctx.currentTime;

      const state: AmbientState = {
        oscillators: [],
        gains: [],
        noiseSource: null,
        noiseGain: null,
        randomToneInterval: null,
      };

      // Low drone: A1 at 55Hz
      const droneOsc = ctx.createOscillator();
      const droneGain = ctx.createGain();
      droneOsc.type = "sine";
      droneOsc.frequency.setValueAtTime(55, now);
      droneGain.gain.setValueAtTime(0, now);
      droneGain.gain.linearRampToValueAtTime(0.08, now + 2); // slow fade in
      droneOsc.connect(droneGain);
      droneGain.connect(dest);
      droneOsc.start(now);
      state.oscillators.push(droneOsc);
      state.gains.push(droneGain);

      // Sub-bass: 40Hz
      const subOsc = ctx.createOscillator();
      const subGain = ctx.createGain();
      subOsc.type = "sine";
      subOsc.frequency.setValueAtTime(40, now);
      subGain.gain.setValueAtTime(0, now);
      subGain.gain.linearRampToValueAtTime(0.04, now + 3);
      subOsc.connect(subGain);
      subGain.connect(dest);
      subOsc.start(now);
      state.oscillators.push(subOsc);
      state.gains.push(subGain);

      // Second drone layer: E2 at 82.41Hz (fifth above A1) for harmonic richness
      const drone2Osc = ctx.createOscillator();
      const drone2Gain = ctx.createGain();
      drone2Osc.type = "sine";
      drone2Osc.frequency.setValueAtTime(82.41, now);
      drone2Gain.gain.setValueAtTime(0, now);
      drone2Gain.gain.linearRampToValueAtTime(0.03, now + 4);
      drone2Osc.connect(drone2Gain);
      drone2Gain.connect(dest);
      drone2Osc.start(now);
      state.oscillators.push(drone2Osc);
      state.gains.push(drone2Gain);

      // Filtered noise for cave atmosphere
      const noiseBuffer = createNoiseBuffer(4, ctx.sampleRate);
      const noiseSource = ctx.createBufferSource();
      noiseSource.buffer = noiseBuffer;
      noiseSource.loop = true;

      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = "lowpass";
      noiseFilter.frequency.setValueAtTime(300, now);
      noiseFilter.Q.setValueAtTime(1, now);

      // Slowly modulate the filter for movement
      const filterLfo = ctx.createOscillator();
      const filterLfoGain = ctx.createGain();
      filterLfo.type = "sine";
      filterLfo.frequency.setValueAtTime(0.1, now); // very slow
      filterLfoGain.gain.setValueAtTime(150, now); // ±150Hz modulation
      filterLfo.connect(filterLfoGain);
      filterLfoGain.connect(noiseFilter.frequency);
      filterLfo.start(now);
      state.oscillators.push(filterLfo);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0, now);
      noiseGain.gain.linearRampToValueAtTime(0.06, now + 3);

      noiseSource.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(dest);
      noiseSource.start(now);
      state.noiseSource = noiseSource;
      state.noiseGain = noiseGain;

      // Random pentatonic high tones every 3-8 seconds
      // A minor pentatonic: A, C, D, E, G (spread across octaves)
      const pentatonicNotes = [
        220.0, 261.63, 293.66, 329.63, 392.0, // A3-C4-D4-E4-G4
        440.0, 523.25, 587.33, 659.25, 783.99, // A4-C5-D5-E5-G5
      ];

      const playRandomTone = () => {
        if (!this._audioContext || !this._initialized) return;

        const freq = pentatonicNotes[Math.floor(Math.random() * pentatonicNotes.length)];
        const toneDuration = 1.5 + Math.random() * 2; // 1.5-3.5s
        const toneNow = this._audioContext.currentTime;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, toneNow);

        // Slight vibrato for organic feel
        const vibrato = ctx.createOscillator();
        const vibratoGain = ctx.createGain();
        vibrato.type = "sine";
        vibrato.frequency.setValueAtTime(4 + Math.random() * 2, toneNow);
        vibratoGain.gain.setValueAtTime(1.5, toneNow);
        vibrato.connect(vibratoGain);
        vibratoGain.connect(osc.frequency);
        vibrato.start(toneNow);
        vibrato.stop(toneNow + toneDuration + 0.5);

        gain.gain.setValueAtTime(0, toneNow);
        gain.gain.linearRampToValueAtTime(0.025, toneNow + 0.5);
        gain.gain.linearRampToValueAtTime(0.02, toneNow + toneDuration * 0.6);
        gain.gain.linearRampToValueAtTime(0, toneNow + toneDuration);

        osc.connect(gain);
        gain.connect(dest);

        osc.start(toneNow);
        osc.stop(toneNow + toneDuration + 0.5);
      };

      // Schedule first tone after a random delay, then repeat
      const scheduleNextTone = () => {
        const delay = 3000 + Math.random() * 5000; // 3-8 seconds
        state.randomToneInterval = setTimeout(() => {
          playRandomTone();
          scheduleNextTone();
        }, delay);
      };

      scheduleNextTone();

      this._ambient = state;
    });
  }

  /**
   * Stop ambient music with a 1-second fade-out.
   */
  stopAmbient(): void {
    if (!this._ambient || !this._initialized) {
      this._ambient = null;
      return;
    }

    const ctx = this._audioContext!;
    const now = ctx.currentTime;
    const fadeDuration = 1.0;

    // Fade out all gains
    for (const gain of this._ambient.gains) {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0, now + fadeDuration);
    }

    if (this._ambient.noiseGain) {
      this._ambient.noiseGain.gain.cancelScheduledValues(now);
      this._ambient.noiseGain.gain.setValueAtTime(
        this._ambient.noiseGain.gain.value,
        now
      );
      this._ambient.noiseGain.gain.linearRampToValueAtTime(0, now + fadeDuration);
    }

    // Clear the random tone interval
    if (this._ambient.randomToneInterval) {
      clearTimeout(this._ambient.randomToneInterval);
    }

    // Stop all oscillators after fade
    const fadeMs = fadeDuration * 1000 + 100;
    setTimeout(() => {
      for (const osc of this._ambient!.oscillators) {
        try {
          osc.stop();
        } catch {
          // Already stopped
        }
      }
      if (this._ambient!.noiseSource) {
        try {
          this._ambient!.noiseSource.stop();
        } catch {
          // Already stopped
        }
      }
      this._ambient = null;
    }, fadeMs);
  }
}
