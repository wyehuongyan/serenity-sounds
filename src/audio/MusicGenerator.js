import * as Tone from "https://esm.sh/tone@14.7.77";
import { ROOT_MIDI, SAFE_SCALES, clamp } from "../config.js";
import { createSeededRandom } from "./SeededRandom.js";

// Never more than 3 simultaneous voices — volume headroom stays clean
const MAX_VOICES = 3;

// Per-voice interval whitelist — only consonant intervals from root
// Prevents dissonant stacking when all voices sound together
const VOICE_INTERVALS = [
  [0, 7],      // voice 0 (bass pad):  root + perfect fifth
  [0, 4, 7],   // voice 1 (mid):       root + major third + fifth
  [0, 7, 9],   // voice 2 (high):      root + fifth + major sixth
];

// Pure sine/triangle only — no FM, no harsh overtones
const VOICE_CONFIGS = [
  { type: "sine",     attack: 2.2, decay: 1.2, sustain: 0.55, release: 9.0 },
  { type: "sine",     attack: 1.2, decay: 0.9, sustain: 0.45, release: 7.5 },
  { type: "triangle", attack: 0.7, decay: 0.7, sustain: 0.30, release: 6.0 },
];

// Slow intervals only — no quarter notes that feel percussive
const VOICE_SUBDIVISIONS = ["1m", "2n.", "2n"];

// Voice velocities decrease with index so higher voices sit lower in the mix
const VOICE_VELOCITY_BASE = [0.28, 0.22, 0.16];

function weightedChoice(items, random) {
  const total = items.reduce((sum, i) => sum + i.weight, 0);
  let cursor = 0;
  const target = random() * total;
  for (const item of items) {
    cursor += item.weight;
    if (target <= cursor) return item.value;
  }
  return items[items.length - 1].value;
}

function createVoiceSynth(voiceIndex) {
  const cfg = VOICE_CONFIGS[voiceIndex] ?? VOICE_CONFIGS[0];
  return new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: cfg.type },
    envelope: {
      attack:  cfg.attack,
      decay:   cfg.decay,
      sustain: cfg.sustain,
      release: cfg.release,
    },
    // Detune very slightly per voice — thickens without clashing
    detune: (voiceIndex - 1) * 2,
  });
}

export class MusicGenerator {
  constructor() {
    // Master chain: gain → compressor → limiter → destination
    // Limiter is the last safety net before the speakers
    this.limiter    = new Tone.Limiter(-2).toDestination();
    this.baseOutputGain = 0.50;
    this.output     = new Tone.Gain(this.baseOutputGain).connect(this.limiter);
    this.compressor = new Tone.Compressor({
      threshold: -22,
      ratio:     3.5,
      attack:    0.10,
      release:   0.50,
    }).connect(this.output);

    // Reverb → compressor (not via delay first, avoids muddy buildup)
    this.reverb = new Tone.Reverb({ decay: 9, wet: 0.38 }).connect(this.compressor);

    // Long half-note delay with minimal feedback — just a single echo, not buildup
    this.delay  = new Tone.FeedbackDelay("2n", 0.08).connect(this.reverb);

    this.meter  = new Tone.Meter({ normalRange: true });
    this.output.connect(this.meter);

    this.synths          = [];
    this.events          = [];
    this.stopEventId     = null;
    this.isPlaying       = false;
    this.playStartedAt   = 0;
    this.durationSeconds = 0;
    this.currentMood     = null;
    this.random          = createSeededRandom(1);
    this.isMuted         = false;
  }

  async resume() {
    await Tone.start();
  }

  loadComposition(moodParameters) {
    this.stop();
    this.disposeVoices();
    this.currentMood     = moodParameters;
    this.durationSeconds = moodParameters.trackLengthSeconds;
    this.random          = createSeededRandom(moodParameters.seed);

    this.reverb.wet.value    = clamp(moodParameters.reverbWet, 0.28, 0.52);
    Tone.Transport.bpm.value = moodParameters.bpm;

    const [low, high] = moodParameters.pitchRange;
    const voiceCount  = Math.min(moodParameters.clusterLayers.length, MAX_VOICES);

    for (let vi = 0; vi < voiceCount; vi++) {
      const layer      = moodParameters.clusterLayers[vi];
      const allowed    = VOICE_INTERVALS[vi] ?? VOICE_INTERVALS[0];

      // Always use pentatonic_major — guaranteed consonance regardless of mood mapping
      const scaleIntervals = SAFE_SCALES.pentatonic_major;

      // Build note pool: only notes that satisfy BOTH the scale AND the voice interval whitelist
      const pool = [];
      for (let midi = low; midi <= high; midi++) {
        const interval = (midi - ROOT_MIDI + 120) % 12;
        if (scaleIntervals.includes(interval) && allowed.includes(interval)) {
          pool.push(Tone.Frequency(midi, "midi").toNote());
        }
      }
      const notePool = pool.length >= 2 ? pool : ["C3", "G3"];

      const synth  = createVoiceSynth(vi);
      const panner = new Tone.Panner(clamp(layer.panPosition * 0.5, -0.5, 0.5));

      // Route: synth → panner → delay → reverb → compressor → output → limiter
      synth.connect(panner);
      panner.connect(this.delay);
      this.synths.push({ synth, panner });

      const velocity   = clamp(VOICE_VELOCITY_BASE[vi] + layer.prominence * 0.12, 0.10, 0.38);
      const noteDur    = vi === 0 ? "1m" : "2n.";
      const interval   = VOICE_SUBDIVISIONS[vi] ?? "1m";

      // Stagger voices 1.2s apart so they phase in gradually — never all at once
      const startOffset = `+${vi * 1.2}`;

      const eventId = Tone.Transport.scheduleRepeat((time) => {
        const note = weightedChoice(
          notePool.map((n, i) => ({
            value:  n,
            // Strong preference for root (index 0), less for others
            weight: i === 0 ? 7 : i === 1 ? 3 : 1,
          })),
          this.random,
        );
        synth.triggerAttackRelease(note, noteDur, time, velocity);
      }, interval, startOffset);

      this.events.push(eventId);
    }

    this.stopEventId = Tone.Transport.scheduleOnce(() => {
      this.stop();
    }, `+${moodParameters.trackLengthSeconds}`);
  }

  async play() {
    if (!this.currentMood) return false;
    await Tone.start();
    Tone.Transport.stop();
    Tone.Transport.seconds = 0;
    Tone.Transport.start();
    this.playStartedAt = performance.now();
    this.isPlaying     = true;
    return true;
  }

  setMuted(muted) {
    this.isMuted = muted;
    const target = muted ? 0 : this.baseOutputGain;
    if (typeof this.output.gain.rampTo === "function") {
      this.output.gain.rampTo(target, 0.08);
    } else {
      this.output.gain.value = target;
    }
  }

  stop() {
    Tone.Transport.stop();
    Tone.Transport.cancel();
    this.events      = [];
    this.stopEventId = null;
    this.isPlaying   = false;
  }

  disposeVoices() {
    this.synths.forEach(({ synth, panner }) => {
      synth.dispose();
      panner.dispose();
    });
    this.synths = [];
  }

  async togglePlayback() {
    if (this.isPlaying) {
      this.stop();
      return false;
    }
    this.loadComposition(this.currentMood);
    return this.play();
  }

  getAmplitude() {
    return clamp(this.meter.getValue() || 0, 0, 1);
  }

  getProgress() {
    if (!this.isPlaying || !this.durationSeconds) return 0;
    return clamp(
      (performance.now() - this.playStartedAt) / (this.durationSeconds * 1000),
      0, 1,
    );
  }

  destroy() {
    this.stop();
    this.disposeVoices();
    this.meter.dispose();
    this.delay.dispose();
    this.reverb.dispose();
    this.compressor.dispose();
    this.output.dispose();
    this.limiter.dispose();
  }
}
