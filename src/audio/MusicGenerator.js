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

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  const value = clean.length === 3
    ? clean.split("").map((char) => char + char).join("")
    : clean;

  return {
    r: parseInt(value.slice(0, 2), 16) / 255,
    g: parseInt(value.slice(2, 4), 16) / 255,
    b: parseInt(value.slice(4, 6), 16) / 255,
  };
}

function analyzeImagePalette(palette = []) {
  if (!palette.length) {
    return {
      warmth: 0.5,
      brightness: 0.5,
      saturation: 0.5,
    };
  }

  const totals = palette.reduce((acc, color) => {
    const { r, g, b } = hexToRgb(color);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const chroma = max - min;
    const luminance = r * 0.299 + g * 0.587 + b * 0.114;

    acc.warmth += clamp((r - b + 1) * 0.5, 0, 1);
    acc.brightness += luminance;
    acc.saturation += clamp(chroma, 0, 1);
    return acc;
  }, { warmth: 0, brightness: 0, saturation: 0 });

  const count = palette.length;
  return {
    warmth: totals.warmth / count,
    brightness: totals.brightness / count,
    saturation: totals.saturation / count,
  };
}

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
    const paletteInfluence = analyzeImagePalette(moodParameters.imagePalette);

    this.reverb.wet.value    = clamp(
      moodParameters.reverbWet
      + (paletteInfluence.brightness - 0.5) * 0.06
      + (paletteInfluence.saturation - 0.5) * 0.04,
      0.26,
      0.56,
    );
    this.delay.feedback.value = clamp(
      0.08
      + (paletteInfluence.warmth - 0.5) * 0.04
      + (paletteInfluence.saturation - 0.5) * 0.03,
      0.05,
      0.14,
    );
    Tone.Transport.bpm.value = clamp(
      moodParameters.bpm + (paletteInfluence.brightness - 0.5) * 4,
      48,
      84,
    );

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

      const voiceToneBias = (paletteInfluence.warmth - 0.5) * 0.06 - vi * (paletteInfluence.brightness - 0.5) * 0.015;
      const velocity   = clamp(VOICE_VELOCITY_BASE[vi] + layer.prominence * 0.12 + voiceToneBias, 0.10, 0.4);
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
