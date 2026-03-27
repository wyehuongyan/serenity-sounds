import { clamp, inverseLerp, lerp } from "../config.js";

function hashInput(analysis) {
  const source = analysis.keys
    .map((entry) => `${entry.key}:${Math.round(entry.relativeTimestamp)}`)
    .join("|");
  let hash = 1779033703;

  for (let index = 0; index < source.length; index += 1) {
    hash = Math.imul(hash ^ source.charCodeAt(index), 3432918353);
    hash = (hash << 13) | (hash >>> 19);
  }

  return hash >>> 0;
}

function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360;
  s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if      (h < 60)  { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else              { r = c; g = 0; b = x; }
  const hex = (v) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

function buildPalette(moodValence, complexity) {
  // Analogous hue families: Teal/Sage for calm, Pearl/Silver for neutral
  const baseHue = moodValence >= 0 ? 180 : 210;
  // Tight spread for harmony (Analogous)
  const hueSpread = 40;
  // Low saturation = ghostly/ethereal minimalist ink
  const sat = 10 + complexity * 12;
  // Brighter and mistier — lightness 45-65%
  const lit = 45 + complexity * 15;

  return Array.from({ length: 8 }, (_, i) => {
    const t = i / 7;
    return hslToHex(
      baseHue + t * hueSpread,
      sat + Math.sin(t * Math.PI) * 4,
      lit + t * 6,
    );
  });
}

export function mapToMoodParameters(analysis) {
  const keyDensity = inverseLerp(10, 80, analysis.keyCount);
  const durationAmount = inverseLerp(800, 9000, analysis.totalDuration);
  const velocityAmount = 1 - inverseLerp(40, 340, analysis.averageVelocity || 340);
  const varianceAmount = inverseLerp(50, 14000, analysis.rhythmVariance);

  const trackLengthSeconds = Math.round(lerp(24, 88, durationAmount));
  const noteDensity = Math.round(lerp(2, 9, keyDensity));
  const bpm = Math.round(lerp(52, 82, velocityAmount));
  const rhythmRegularity = clamp(1 - varianceAmount, 0, 1);
  const stereoPanBias = clamp(analysis.leftRightBias, -1, 1);
  const pitchCenter = analysis.rowBias < 0 ? 65 : 57;
  const pitchSpread = Math.round(lerp(6, 14, keyDensity));
  const pitchRange = [pitchCenter - pitchSpread, pitchCenter + pitchSpread];
  const harmonicComplexity = clamp((keyDensity + varianceAmount) / 2, 0, 1);
  const moodValence = clamp(rhythmRegularity * 1.2 - varianceAmount * 0.5, -1, 1);

  let scale = "pentatonic_major";
  if (moodValence < -0.2) {
    scale = "pentatonic_minor";
  } else if (harmonicComplexity > 0.7) {
    scale = "lydian";
  } else if (analysis.clusters.length >= 4) {
    scale = "mixolydian";
  }

  const timbre = analysis.averageVelocity < 120 ? "sine_pad" : analysis.averageVelocity < 220 ? "fm_warm" : "triangle_bell";
  const reverbWet = clamp(lerp(0.28, 0.68, 1 - durationAmount), 0.2, 0.75);
  const inkWeight = lerp(0.7, 1.9, keyDensity);
  const inkStyle = varianceAmount > 0.65 ? "jittery" : varianceAmount > 0.32 ? "wavy" : "smooth";
  const bleedIntensity = clamp((durationAmount + harmonicComplexity) / 2, 0.25, 0.9);

  return {
    seed: hashInput(analysis),
    trackLengthSeconds,
    noteDensity,
    bpm,
    rhythmRegularity,
    stereoPanBias,
    pitchRange,
    clusterLayers: analysis.clusters.map((cluster, index) => ({
      clusterIndex: index,
      noteCount: clamp(cluster.size, 1, 8),
      velocity: clamp(1 - inverseLerp(50, 320, cluster.averageVelocity || analysis.averageVelocity || 180), 0.3, 1),
      prominence: clamp(cluster.size / Math.max(analysis.keyCount, 1) * 3, 0.2, 1),
      panPosition: clamp(cluster.averageHorizontal, -1, 1),
    })),
    scale,
    timbre,
    reverbWet,
    harmonicComplexity,
    moodValence,
    colorPalette: buildPalette(moodValence, harmonicComplexity),
    inkWeight,
    inkStyle,
    bleedIntensity,
  };
}
