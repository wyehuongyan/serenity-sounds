export const MIN_KEYPRESS_COUNT = 100;
export const CLUSTER_GAP_MS = 200;
export const MAX_CLUSTER_SIZE = 7;
export const CLUSTER_SPATIAL_RADIUS = 0.72;
export const CLUSTER_NEIGHBOR_RADIUS = 0.94;
export const CLUSTER_NEIGHBOR_GAP_MS = 72;
export const CLUSTER_SPLIT_SPREAD = 1.08;
export const CLUSTER_SPLIT_JUMP = 0.88;
export const CLUSTER_MERGE_GAP_MS = 110;
export const CLUSTER_MERGE_DISTANCE = 0.68;
export const CLUSTER_TINY_SIZE = 2;

export const KEYBOARD_ROWS = [
  ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7", "Digit8", "Digit9", "Digit0"],
  ["KeyQ", "KeyW", "KeyE", "KeyR", "KeyT", "KeyY", "KeyU", "KeyI", "KeyO", "KeyP"],
  ["KeyA", "KeyS", "KeyD", "KeyF", "KeyG", "KeyH", "KeyJ", "KeyK", "KeyL"],
  ["KeyZ", "KeyX", "KeyC", "KeyV", "KeyB", "KeyN", "KeyM"],
];

export const SAFE_SCALES = {
  pentatonic_major: [0, 2, 4, 7, 9],
  pentatonic_minor: [0, 3, 5, 7, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
};

export const ROOT_MIDI = 48;

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function lerp(min, max, amount) {
  return min + (max - min) * amount;
}

export function inverseLerp(min, max, value) {
  if (max === min) {
    return 0;
  }

  return clamp((value - min) / (max - min), 0, 1);
}
