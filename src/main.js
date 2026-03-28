import { MIN_KEYPRESS_COUNT } from "./config.js";
import { KeyboardCapture } from "./input/KeyboardCapture.js";
import { TouchMashCapture } from "./input/TouchMashCapture.js";
import { analyzeInput } from "./input/InputAnalyzer.js";
import { mapToMoodParameters } from "./analysis/MoodMapper.js";
import { SceneManager } from "./visual/SceneManager.js";
import { MusicGenerator } from "./audio/MusicGenerator.js";

function createUiSound(path, volume, { loop = false } = {}) {
  const audio = new Audio(new URL(path, import.meta.url).href);
  audio.preload = "auto";
  audio.loop = loop;
  audio.volume = volume;
  audio.dataset.baseVolume = String(volume);
  return audio;
}

function playUiSound(audio, { restart = true } = {}) {
  if (!audio || !soundEnabled) return;
  try {
    if (restart) audio.currentTime = 0;
    const playPromise = audio.play();
    if (playPromise?.catch) {
      playPromise.catch(() => {});
    }
  } catch (_) {
    // Ignore autoplay / decode failures for non-critical UI sounds.
  }
}

function pauseUiSound(audio, { reset = false } = {}) {
  if (!audio) return;
  audio.pause();
  if (reset) {
    audio.currentTime = 0;
  }
}

// ─── Custom cursor ───

const cursorDot = document.querySelector("#cursor-dot");
const cursorRing = document.querySelector("#cursor-ring");
const stoneLabelEl = document.querySelector("#stone-label");
const coordsDisplay = document.querySelector("#cursor-coords");
const themeToggle = document.querySelector("#theme-toggle");
const soundToggle = document.querySelector("#sound-toggle");
const sunIcon = document.querySelector("#sun-icon");
const moonIcon = document.querySelector("#moon-icon");
const soundOnIcon = document.querySelector("#sound-on-icon");
const soundOffIcon = document.querySelector("#sound-off-icon");
// Select inside function for robustness

let isOverlayVisible = false;
let currentTheme = localStorage.getItem("zen-theme") || "dark";
let soundEnabled = localStorage.getItem("serenity-sound-enabled") !== "false";
const beginHoverSound = createUiSound("../audio/water-hover.mp3", 0.38);
const beginPressSound = createUiSound("../audio/water-press.mp3", 0.52);
const mashDripSound = createUiSound("../audio/dripping.mp3", 0.22, { loop: true });
let lastBeginHover = false;
let lastBeginHoverAt = 0;
let mashDripStopTimeoutId = null;
let mashDripActive = false;
let uiAudioPrimed = false;
let tapGateActive = true;
let tapGateDismissing = false;

async function ensureAudioPrimed() {
  if (uiAudioPrimed) return;
  uiAudioPrimed = true;

  try {
    await musicGenerator.resume();
  } catch (_) {
    // Non-fatal; UI sounds can still be attempted below.
  }
}

function onMouseMove(e) {
  const x = (e.clientX / window.innerWidth) * 2 - 1;
  const y = -(e.clientY / window.innerHeight) * 2 + 1;
  
  // Block 3D cursor updates if an overlay is blocking the view
  if (!isOverlayVisible) {
    sceneManager.updateCursor(x, y);
  }
  
  if (coordsDisplay) {
    coordsDisplay.textContent = `${x.toFixed(2)}, ${y.toFixed(2)}`;
  }
}

function isTouchPointerEvent(event) {
  return event.pointerType === "touch" || event.pointerType === "pen";
}

function syncVisualPointer(clientX, clientY, eventTarget = null) {
  dotX = clientX;
  dotY = clientY;

  if (cursorDot && cursorRing) {
    cursorDot.style.left = `${dotX}px`;
    cursorDot.style.top = `${dotY}px`;
  }

  const x = (clientX / window.innerWidth) * 2 - 1;
  const y = -(clientY / window.innerHeight) * 2 + 1;

  if (!isOverlayVisible) {
    sceneManager.updateCursor(x, y);
  }

  if (coordsDisplay) {
    coordsDisplay.textContent = `${x.toFixed(2)}, ${y.toFixed(2)}`;
  }

  if (eventTarget && cursorDot && cursorRing) {
    const overInteractive = eventTarget.closest("button, input, a, [role='button']");
    cursorDot.classList.toggle("is-hovering", !!overInteractive);
    cursorRing.classList.toggle("is-hovering", !!overInteractive);
  }
}

let ringX = window.innerWidth / 2;
let ringY = window.innerHeight / 2;
let dotX = ringX;
let dotY = ringY;

document.addEventListener("mousemove", (event) => {
  onMouseMove(event);
  dotX = event.clientX;
  dotY = event.clientY;
  cursorDot.style.left = `${dotX}px`;
  cursorDot.style.top = `${dotY}px`;

  const overInteractive = event.target.closest("button, input, a, [role='button']");
  cursorDot.classList.toggle("is-hovering", !!overInteractive);
  cursorRing.classList.toggle("is-hovering", !!overInteractive);
});

document.addEventListener("pointerdown", (event) => {
  if (!isTouchPointerEvent(event)) {
    return;
  }

  syncVisualPointer(event.clientX, event.clientY, event.target instanceof Element ? event.target : null);
});

document.addEventListener("pointermove", (event) => {
  if (!isTouchPointerEvent(event)) {
    return;
  }

  syncVisualPointer(event.clientX, event.clientY, event.target instanceof Element ? event.target : null);
});

document.addEventListener("touchstart", (event) => {
  if (!touchMashMode) {
    return;
  }

  const touch = event.touches[0] || event.changedTouches[0];
  if (!touch) {
    return;
  }

  syncVisualPointer(
    touch.clientX,
    touch.clientY,
    event.target instanceof Element ? event.target : null,
  );
}, { passive: true });

document.addEventListener("touchmove", (event) => {
  if (!touchMashMode) {
    return;
  }

  const touch = event.touches[0] || event.changedTouches[0];
  if (touch) {
    syncVisualPointer(
      touch.clientX,
      touch.clientY,
      event.target instanceof Element ? event.target : null,
    );
  }

  const target = event.target;
  if (
    target instanceof Element &&
    target.closest(
      "button, input, a, #signup-modal, .history-drawer, .history-list, .modal-content",
    )
  ) {
    return;
  }

  event.preventDefault();
}, { passive: false });

// Click state — burst animation, then reset
document.addEventListener("mousedown", () => {
  ensureAudioPrimed();
  // Force-restart animation by removing, reflowing, re-adding
  cursorDot.classList.remove("is-clicking");
  cursorRing.classList.remove("is-clicking");
  void cursorDot.offsetWidth; // reflow
  void cursorRing.offsetWidth;
  cursorDot.classList.add("is-clicking");
  cursorRing.classList.add("is-clicking");

  if (!tapGateActive && !tapGateDismissing && !isOverlayVisible && sceneManager?.beginCubeHovered) {
    playUiSound(beginPressSound);
    sceneManager.triggerLandingRipple();
  }
});

cursorDot.addEventListener("animationend", () => cursorDot.classList.remove("is-clicking"));
cursorRing.addEventListener("animationend", () => cursorRing.classList.remove("is-clicking"));

// Animate the ring with a lag — runs independently
// Also picks up 3D begin-cube hover state each frame
function animateCursor() {
  if (appDestroyed) return;
  ringX += (dotX - ringX) * 0.14;
  ringY += (dotY - ringY) * 0.14;
  cursorRing.style.left = `${ringX}px`;
  cursorRing.style.top = `${ringY}px`;

  // Stone hover label — only show if no overlay is blocking the garden
  if (stoneLabelEl) {
    if (touchMashMode) {
      stoneLabelEl.classList.remove("is-visible", "is-hint");
    } else {
      const hoveredStoneLabel = (!isOverlayVisible && sceneManager?.beginCubeHovered)
        ? "Begin"
        : (!isOverlayVisible ? sceneManager?.hoveredStoneLabel : null);
      const mashCursorHint = !touchMashMode &&
        desktopMashCursorHintVisible &&
        !isOverlayVisible &&
        !hoveredStoneLabel
        ? "start mashing - droplets catch the letters"
        : null;
      const labelText = hoveredStoneLabel || mashCursorHint;

      stoneLabelEl.classList.toggle("is-hint", !!mashCursorHint && !hoveredStoneLabel);

      if (labelText) {
        stoneLabelEl.textContent = labelText;
        stoneLabelEl.style.left = `${dotX}px`;
        stoneLabelEl.style.top  = `${dotY}px`;
        stoneLabelEl.classList.add("is-visible");
      } else {
        stoneLabelEl.classList.remove("is-visible");
      }
    }
  }

  // Hide UI during stone focus
  if (sceneManager && playerBar) {
    const focus = sceneManager.focusBlend;
    playerBar.style.opacity = 1.0 - focus;
    playerBar.style.pointerEvents = focus > 0.5 ? "none" : "auto";
    if (historyToggle) {
      historyToggle.style.opacity = 1.0 - focus;
      historyToggle.style.pointerEvents = focus > 0.5 ? "none" : "auto";
    }
  }

  // Mirror 3D hover onto cursor
  const beginHovered = !isOverlayVisible && !!sceneManager?.beginCubeHovered;
  if (beginHovered) {
    cursorDot.classList.add("is-hovering");
    cursorRing.classList.add("is-hovering");
  }

  if (!tapGateActive && !tapGateDismissing && beginHovered && !lastBeginHover) {
    const now = performance.now();
    if (now - lastBeginHoverAt > 240) {
      playUiSound(beginHoverSound);
      lastBeginHoverAt = now;
    }
  }
  lastBeginHover = beginHovered;

  cursorAnimationFrameId = requestAnimationFrame(animateCursor);
}

// ─── Theme Management ───

function applyTheme(theme) {
  currentTheme = theme;
  localStorage.setItem("zen-theme", theme);
  
  if (theme === "light") {
    document.body.classList.add("light-mode");
    sunIcon.classList.remove("hidden");
    moonIcon.classList.add("hidden");
    sceneManager.setTheme(1.0); // 1.0 = Light
  } else {
    document.body.classList.remove("light-mode");
    sunIcon.classList.add("hidden");
    moonIcon.classList.remove("hidden");
    sceneManager.setTheme(0.0); // 0.0 = Dark
  }
}

themeToggle.addEventListener("click", () => {
  const nextTheme = currentTheme === "dark" ? "light" : "dark";
  applyTheme(nextTheme);
});

soundToggle?.addEventListener("click", () => {
  applySoundState(!soundEnabled);
});

// Initial application (deferred until sceneManager is ready)

// ─── DOM refs ───

const canvasContainer = document.querySelector("#canvas-container");
const phaseLanding = document.querySelector("#phase-landing");
const beginBtn = document.querySelector("#begin-btn");
const signupLink = document.querySelector("#signup-link");
const returnHomeLink = document.querySelector("#return-home-link");
const phaseInput = document.querySelector("#phase-input");
const mashInput = document.querySelector("#mash-input");
const mashProgressFill = document.querySelector("#mash-progress-fill");
const mashSurface = document.querySelector("#mash-surface");
const mashSurfaceLabel = document.querySelector(".mash-surface-label");
const uploadBtn = document.querySelector("#upload-btn");
const imageUploadInput = document.querySelector("#image-upload");
const uploadPalette = document.querySelector("#upload-palette");
const uploadPaletteSwatches = document.querySelector("#upload-palette-swatches");
const generateBtn = document.querySelector("#generate-btn");
const keystrokeCount = document.querySelector("#keystroke-count");

// ─── Core systems (Needs to be initialized before listeners use them) ───

const sceneManager = new SceneManager(canvasContainer);
const musicGenerator = new MusicGenerator();

function applySoundState(enabled) {
  soundEnabled = enabled;
  localStorage.setItem("serenity-sound-enabled", String(enabled));

  [beginHoverSound, beginPressSound, mashDripSound].forEach((audio) => {
    audio.muted = !enabled;
    audio.volume = Number(audio.dataset.baseVolume || audio.volume || 1);
  });

  if (!enabled) {
    pauseUiSound(mashDripSound);
  } else if (mashDripActive && mashDripSound.paused) {
    playUiSound(mashDripSound, { restart: false });
  }

  musicGenerator.setMuted(!enabled);

  if (soundToggle) {
    soundToggle.setAttribute("aria-label", enabled ? "Mute Sound" : "Enable Sound");
  }
  if (soundOnIcon && soundOffIcon) {
    soundOnIcon.classList.toggle("hidden", !enabled);
    soundOffIcon.classList.toggle("hidden", enabled);
  }
}

function touchMashDripSound() {
  mashDripActive = true;
  if (mashDripSound.paused) {
    playUiSound(mashDripSound, { restart: false });
  }

  window.clearTimeout(mashDripStopTimeoutId);
  mashDripStopTimeoutId = window.setTimeout(() => {
    mashDripActive = false;
    pauseUiSound(mashDripSound);
  }, 260);
}

function stopMashDripSound(reset = false) {
  mashDripActive = false;
  window.clearTimeout(mashDripStopTimeoutId);
  pauseUiSound(mashDripSound, { reset });
}

// Initial theme application
if (!localStorage.getItem("zen-theme")) {
  const prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
  currentTheme = prefersLight ? "light" : "dark";
}
applyTheme(currentTheme);
applySoundState(soundEnabled);

// ─── Zen Title Scramble ───

const brandTitle = document.querySelector(".brand-title");
if (brandTitle) {
  const text = brandTitle.textContent;
  brandTitle.innerHTML = text.split("").map(char => 
    char === " " ? "<span>&nbsp;</span>" : `<span class="zen-char">${char}</span>`
  ).join("");

  const scrambleChars = "᚛ᚙ✧֎⁛⁌⁍⁘⁙⁚⁛⁜";
  
  brandTitle.addEventListener("mouseover", (e) => {
    const span = e.target.closest(".zen-char");
    if (!span || span.dataset.scrambling) return;
    
    span.dataset.scrambling = "true";
    const originalChar = span.textContent;
    let iterations = 0;
    
    const interval = setInterval(() => {
      span.textContent = scrambleChars[Math.floor(Math.random() * scrambleChars.length)];
      if (iterations++ > 6) {
        clearInterval(interval);
        span.textContent = originalChar;
        delete span.dataset.scrambling;
      }
    }, 40);
  });
}
const playerBar = document.querySelector("#player-bar"); 
const focusReading = document.querySelector("#focus-reading");
const focusReadingRole = document.querySelector("#focus-reading-role");
const focusReadingEmotion = document.querySelector("#focus-reading-emotion");
const focusReadingLine = document.querySelector("#focus-reading-line");
const playPauseBtn = document.querySelector("#play-pause-btn");
const playIcon = document.querySelector("#play-icon");
const pauseIcon = document.querySelector("#pause-icon");
const progressFill = document.querySelector("#progress-fill");
const playheadEl = document.querySelector("#playhead");
const timeCurrent = document.querySelector("#timestamp-current");
const timeTotal = document.querySelector("#timestamp-total");
const resetBtn = document.querySelector("#reset-btn");
const historyToggle = document.querySelector("#history-toggle");
const historyDrawer = document.querySelector("#history-drawer");
const historyClear = document.querySelector("#history-clear");
const historyClose = document.querySelector("#history-close");
const historyList = document.querySelector("#history-list");
const signupModal = document.querySelector("#signup-modal");
const modalClose = document.querySelector("#modal-close");
const signupEmail = document.querySelector("#signup-email");
const signupSubmit = document.querySelector("#signup-submit");

// ─── Core systems ───

const touchMashMode = window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;

const keyboardCapture = new KeyboardCapture({
  input: mashInput,
  onUpdate: handleKeystrokeUpdate,
  shouldCapture: (event) => {
    if (!phaseInput || phaseInput.classList.contains("hidden")) {
      return false;
    }

    if (isOverlayVisible) {
      return false;
    }

    if (event.target instanceof HTMLElement && event.target.closest("#signup-modal")) {
      return false;
    }

    return true;
  },
});

const touchMashCapture = new TouchMashCapture({
  target: phaseInput,
  onUpdate: handleKeystrokeUpdate,
  shouldCapture: (event) => {
    if (!touchMashMode) {
      return false;
    }

    if (!phaseInput || phaseInput.classList.contains("hidden")) {
      return false;
    }

    if (isOverlayVisible) {
      return false;
    }

    if (event.target instanceof HTMLElement && event.target.closest("#upload-btn, #generate-btn, #image-upload")) {
      return false;
    }

    return true;
  },
});

const activeMashCapture = touchMashMode ? touchMashCapture : keyboardCapture;

// ─── State ───

let currentAnalysis = null;
let currentMoodParameters = null;
let buildReadyTimeoutId = null;
let hintDismissed = false;
let generateAllowed = false;
let uploadedImagePalette = [];
let uploadedImageUrl = null;
let desktopMashCursorHintVisible = false;
let focusReadingMap = new Map();
const PHASE_TRANSITION_MS = 920;
const PHASE_OVERLAP_MS = 140;
let cursorAnimationFrameId = null;
let tickAnimationFrameId = null;
let appDestroyed = false;

if (touchMashMode) {
  phaseInput?.classList.add("touch-mash-mode");
  if (mashSurfaceLabel) {
    mashSurfaceLabel.textContent = "drum the surface — droplets catch the gesture";
  }
} else {
  phaseInput?.classList.add("desktop-mash-mode");
}

animateCursor();

// ─── Keystroke feedback ───

let lastSplatterTime = 0;

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  const value = clean.length === 3
    ? clean.split("").map((char) => char + char).join("")
    : clean;

  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

function rgbToHex({ r, g, b }) {
  const part = (value) => Math.round(value).toString(16).padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}

function blendHexColors(baseHex, targetHex, amount) {
  const a = hexToRgb(baseHex);
  const b = hexToRgb(targetHex);
  const t = clamp01(amount);
  return rgbToHex({
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  });
}

function colorDistance(a, b) {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function getStoneReadingKey(clusterIndex, localIndex) {
  return `${clusterIndex}:${localIndex}`;
}

function computeClusterSpread(cluster) {
  const keys = cluster?.keys || [];
  if (!keys.length) return 0;
  const center = {
    x: keys.reduce((sum, entry) => sum + (entry.horizontal || 0), 0) / keys.length,
    y: keys.reduce((sum, entry) => sum + (entry.vertical || 0), 0) / keys.length,
  };

  return keys.reduce((maxSpread, entry) => {
    const dx = (entry.horizontal || 0) - center.x;
    const dy = (entry.vertical || 0) - center.y;
    return Math.max(maxSpread, Math.sqrt(dx * dx + dy * dy));
  }, 0);
}

function classifyClusterReading(cluster, analysis) {
  const size = cluster.size || cluster.keys?.length || 0;
  const spread = computeClusterSpread(cluster);
  const fast = (cluster.averageVelocity || analysis.averageVelocity || 0) < 125;
  const slow = (cluster.averageVelocity || analysis.averageVelocity || 0) > 220;
  const jagged = (analysis.rhythmVariance || 0) > 6000;
  const wide = spread > 0.72;
  const leftHeavy = (cluster.averageHorizontal || 0) < -0.22;
  const rightHeavy = (cluster.averageHorizontal || 0) > 0.22;
  const totalClusters = Math.max(analysis.clusters?.length || 1, 1);
  const phase = totalClusters === 1 ? 0.5 : cluster.index / (totalClusters - 1);

  if (phase > 0.7 && fast && size >= 4) {
    return { emotion: "you came back to this here", motif: "aftershock" };
  }
  if (fast && jagged && wide) {
    return { emotion: "this part scattered before it could settle", motif: "scatter" };
  }
  if (fast && size >= 5) {
    return { emotion: "you pushed hardest here, then it began to ease", motif: "tension" };
  }
  if (slow && size <= 3) {
    return { emotion: "this part arrived carefully", motif: "hesitation" };
  }
  if (leftHeavy && jagged) {
    return { emotion: "you were still holding something here", motif: "tension" };
  }
  if (rightHeavy && !jagged) {
    return { emotion: "this part felt heavier, but steadier", motif: "settling" };
  }
  if (phase < 0.35 && size >= 4) {
    return { emotion: "this restless part started to soften", motif: "restless" };
  }
  if (phase > 0.65) {
    return { emotion: "this one stayed with you longer", motif: "settling" };
  }
  if (wide) {
    return { emotion: "the strain started to spread out here", motif: "scatter" };
  }
  return { emotion: "the sharpness softened here", motif: "restless" };
}

function roleForStone(localIndex, clusterSize) {
  if (clusterSize <= 1) return "core fragment";
  if (localIndex === 0) return "first pulse";
  if (localIndex === clusterSize - 1) return "aftershock";
  if (localIndex === Math.floor(clusterSize / 2)) return "core fragment";
  if (localIndex <= Math.floor(clusterSize / 3)) return "surge";
  if (localIndex >= Math.ceil(clusterSize * 0.7)) return "linger";
  return localIndex % 2 === 0 ? "hinge" : "quiet edge";
}

function emotionForStone(baseEmotion, role, cluster, localIndex) {
  const clusterSize = cluster.size || cluster.keys?.length || 0;
  const spread = computeClusterSpread(cluster);
  const phase = clusterSize <= 1 ? 0.5 : localIndex / Math.max(clusterSize - 1, 1);

  if (role === "first pulse") {
    return baseEmotion.replace("this part", "this first part").replace("this one", "this first one");
  }
  if (role === "aftershock") {
    if (baseEmotion.includes("soften")) return "this softened later than the rest";
    if (baseEmotion.includes("steady")) return "this settled after everything else had moved through";
    return "you were still carrying this after the first rush";
  }
  if (role === "core fragment") {
    if (baseEmotion.includes("hardest")) return "this was where most of the pressure gathered";
    if (baseEmotion.includes("steady")) return "this was the heaviest part, but it held together";
    return "this was the center of what you were carrying";
  }
  if (role === "surge") {
    return spread > 0.7
      ? "this part reached outward before it found its shape"
      : "this part pressed forward more than the rest";
  }
  if (role === "linger") {
    return phase > 0.65
      ? "this part stayed behind after the sharper feeling passed"
      : "this part stayed with you quietly";
  }
  if (role === "hinge") {
    return "this was where the feeling started to turn";
  }
  if (role === "quiet edge") {
    return spread > 0.7
      ? "this sat at the edge while everything else spread around it"
      : "this sat off to the side, but it still belonged to the whole";
  }
  return baseEmotion;
}

function lineForStone(role, emotion, cluster, analysis, localIndex) {
  const size = cluster.size || cluster.keys?.length || 0;
  const avgVelocity = cluster.averageVelocity || analysis.averageVelocity || 180;
  const spread = computeClusterSpread(cluster);
  const leftRight = cluster.averageHorizontal || 0;
  const vertical = cluster.averageVertical || 0;
  const clusterSize = Math.max(size, 1);
  const phase = clusterSize <= 1 ? 0.5 : localIndex / Math.max(clusterSize - 1, 1);
  const opening = phase < 0.33;
  const closing = phase > 0.66;

  if (role === "first pulse") {
    return avgVelocity < 130
      ? "This is where it first came through."
      : leftRight < -0.12
        ? "This is where it first gathered itself and pushed through."
        : "This is where it first started to gather.";
  }
  if (role === "aftershock") {
    return avgVelocity < 150
      ? "This came after the first rush had already passed."
      : closing
        ? "This held on even after the rest had softened."
        : "This was still there after the main push had moved through.";
  }
  if (role === "core fragment") {
    if (size >= 5 && avgVelocity < 150) return "You pushed hardest here.";
    if (vertical > 0.18) return "This sat near the center, but it moved more lightly.";
    return "This is the part that carried most of the weight.";
  }
  if (role === "surge") {
    return spread > 0.7
      ? "The energy spread out here before it could settle."
      : opening
        ? "This part leaned forward before the rest could catch up."
        : "This part leaned forward more than the rest.";
  }
  if (role === "linger") {
    return closing
      ? "This part was quieter, but it stayed with you longer."
      : "This part asked for less attention, but it stayed.";
  }
  if (role === "hinge") {
    return leftRight < -0.15
      ? "This is where it began folding back in."
      : vertical > 0.15
        ? "This is where the feeling lifted and started to turn."
        : "This is where the feeling started to turn.";
  }
  if (emotion === "this one stayed with you longer") {
    return "It stayed with you quietly, even after the sharper part had gone.";
  }
  if (role === "quiet edge") {
    return localIndex % 2 === 0
      ? "This part sat at the edge, but it still shaped the whole thing."
      : "Its force was smaller, but it still changed the whole shape.";
  }
  return opening
    ? "This part arrived lightly, but it still changed the shape of everything."
    : "Its force was smaller, but it helped the rest settle.";
}

function buildFocusReadings(analysis) {
  const readings = new Map();

  (analysis.clusters || []).forEach((cluster) => {
    const reading = classifyClusterReading(cluster, analysis);
    const keys = cluster.keys || [];
    const clusterSize = keys.length || cluster.size || 0;
    const primaryIndices = new Set([
      0,
      Math.max(0, clusterSize - 1),
      Math.floor(clusterSize / 2),
    ]);

    keys.forEach((entry, localIndex) => {
      const role = roleForStone(localIndex, clusterSize);
      const stoneEmotion = emotionForStone(reading.emotion, role, cluster, localIndex);
      readings.set(
        getStoneReadingKey(cluster.index, localIndex),
        {
          role,
          emotion: stoneEmotion,
          motif: reading.motif,
          line: lineForStone(role, stoneEmotion, cluster, analysis, localIndex),
        },
      );
    });
  });

  return readings;
}

function updateFocusReadingOverlay() {
  if (!focusReading || !focusReadingRole || !focusReadingEmotion || !focusReadingLine) {
    return;
  }

  const focusedEntry = sceneManager.getActiveFocusEntry?.() || null;
  const focusVisible = !isOverlayVisible && focusedEntry && sceneManager.focusBlend > 0.025;

  if (!focusVisible) {
    focusReading.style.opacity = "";
    focusReading.classList.add("hidden");
    focusReading.classList.remove("is-visible");
    sceneManager.setFocusReading?.(null);
    return;
  }

  const reading = focusReadingMap.get(
    getStoneReadingKey(focusedEntry.clusterIndex, focusedEntry.localIndex),
  );

  if (!reading) {
    focusReading.style.opacity = "";
    focusReading.classList.add("hidden");
    focusReading.classList.remove("is-visible");
    sceneManager.setFocusReading?.(null);
    return;
  }

  focusReading.classList.remove("hidden");
  focusReadingRole.textContent = reading.role;
  focusReadingEmotion.textContent = reading.emotion;
  focusReadingLine.textContent = reading.line || "";
  focusReadingLine.style.display = reading.line ? "block" : "none";
  focusReading.style.opacity = String(Math.max(0, Math.min(1, sceneManager.focusBlend * 1.15)));
  focusReading.classList.add("is-visible");
  sceneManager.setFocusReading?.(reading);
}

function quantizeChannel(value) {
  return Math.round(value / 32) * 32;
}

function renderUploadPalette(colors) {
  if (!uploadPalette || !uploadPaletteSwatches) {
    return;
  }

  uploadPaletteSwatches.innerHTML = "";

  if (!colors.length) {
    uploadPalette.classList.add("hidden");
    return;
  }

  colors.forEach((color) => {
    const swatch = document.createElement("div");
    swatch.className = "upload-palette-swatch";
    swatch.style.background = color;
    uploadPaletteSwatches.appendChild(swatch);
  });

  uploadPalette.classList.remove("hidden");
}

async function extractPaletteFromFile(file, maxColors = 6) {
  const imageUrl = URL.createObjectURL(file);

  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = imageUrl;
    });

    const sampleSize = 42;
    const canvas = document.createElement("canvas");
    canvas.width = sampleSize;
    canvas.height = sampleSize;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      return [];
    }

    ctx.drawImage(image, 0, 0, sampleSize, sampleSize);
    const { data } = ctx.getImageData(0, 0, sampleSize, sampleSize);
    const buckets = new Map();

    for (let i = 0; i < data.length; i += 16) {
      const alpha = data[i + 3];
      if (alpha < 180) continue;

      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const qr = quantizeChannel(r);
      const qg = quantizeChannel(g);
      const qb = quantizeChannel(b);
      const key = `${qr},${qg},${qb}`;
      const bucket = buckets.get(key) || { r: 0, g: 0, b: 0, count: 0 };
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
      bucket.count += 1;
      buckets.set(key, bucket);
    }

    const ranked = [...buckets.values()]
      .filter((bucket) => bucket.count >= 3)
      .map((bucket) => ({
        r: bucket.r / bucket.count,
        g: bucket.g / bucket.count,
        b: bucket.b / bucket.count,
        count: bucket.count,
      }))
      .sort((a, b) => b.count - a.count);

    const selected = [];
    for (const color of ranked) {
      const tooClose = selected.some((existing) => colorDistance(existing, color) < 52);
      if (!tooClose) {
        selected.push(color);
      }
      if (selected.length >= maxColors) break;
    }

    return selected.map(rgbToHex);
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

function applyUploadedPaletteInfluence(moodParameters) {
  if (!uploadedImagePalette.length) {
    return moodParameters;
  }

  const blendedPalette = moodParameters.colorPalette.map((color, index) => {
    const imageColor = uploadedImagePalette[index % uploadedImagePalette.length];
    const influence = 0.34;
    return blendHexColors(color, imageColor, influence);
  });

  return {
    ...moodParameters,
    colorPalette: blendedPalette,
    imagePalette: [...uploadedImagePalette],
  };
}

function focusMashInput() {
  if (touchMashMode) {
    return;
  }

  if (!mashInput || !phaseInput || phaseInput.classList.contains("hidden")) {
    return;
  }

  mashInput.focus({ preventScroll: true });
}

function updateMashProgress(count) {
  const progress = Math.max(0, Math.min(1, count / MIN_KEYPRESS_COUNT));

  if (mashProgressFill) {
    mashProgressFill.style.width = `${progress * 100}%`;
  }

  if (keystrokeCount) {
    keystrokeCount.textContent = `${count} / ${MIN_KEYPRESS_COUNT}`;
  }
}

function handleKeystrokeUpdate(count) {
  updateMashProgress(count);

  if (count > 0) {
    ensureAudioPrimed();
    touchMashDripSound();
    // Trigger ink splatter with a small cooldown
    const now = Date.now();
    if (now - lastSplatterTime > 120) {
      const wx = sceneManager.cursorWorld.x;
      const wy = sceneManager.cursorWorld.y;
      
      // Kintsugi Gold vs Sumi Ink variety
      const isGold = Math.random() > 0.80; // 20% chance of gold
      const darkInkColor = currentTheme === "dark" ? "#8d7647" : "#000000";
      const inkColor = isGold ? "#f2d173" : darkInkColor;
      
      sceneManager.addSplatter(wx, wy, inkColor, isGold);
      lastSplatterTime = now;
    }
  }

  // Fade out hint after first keypress
  if (count === 1 && !hintDismissed) {
    hintDismissed = true;
  }

  // Reveal generate button at threshold
  if (count >= MIN_KEYPRESS_COUNT && !generateAllowed) {
    generateAllowed = true;
    generateBtn.getBoundingClientRect(); // force reflow before transition
    generateBtn.classList.add("is-visible");
  }
}

// ─── Helpers ───

function formatTime(seconds) {
  if (isNaN(seconds) || seconds < 0) return "0:00";
  const s = Math.floor(seconds);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem.toString().padStart(2, "0")}`;
}

function setPlayIcons(isPlaying) {
  if (isPlaying) {
    playIcon.classList.add("hidden");
    pauseIcon.classList.remove("hidden");
  } else {
    playIcon.classList.remove("hidden");
    pauseIcon.classList.add("hidden");
    // Reset progress bar and timer when stopping
    if (progressFill) progressFill.style.width = "0%";
    if (playheadEl) {
      playheadEl.style.left = "0%";
      playheadEl.classList.remove("is-active");
    }
    if (timeCurrent) timeCurrent.textContent = "0:00";
  }
}

function syncPlayerDuration() {
  if (timeTotal) {
    timeTotal.textContent = formatTime(musicGenerator.durationSeconds || 0);
  }
}

// Fade an overlay in: remove hidden, then trigger opacity transition
function fadeIn(el, delayMs = 0) {
  el.classList.remove("hidden");
  el.getBoundingClientRect(); // reflow
  window.setTimeout(() => {
    requestAnimationFrame(() => el.classList.add("is-visible"));
  }, delayMs);
}

// Fade an overlay out: remove is-visible, then hide after transition
function fadeOut(el, durationMs = 500, onDone) {
  el.classList.remove("is-visible");
  window.setTimeout(() => {
    el.classList.add("hidden");
    onDone?.();
  }, durationMs);
}

function initBeginPhase() {
  sceneManager.initBeginCube(() => {
    musicGenerator.resume(); // Fix browser audio policy
    desktopMashCursorHintVisible = !touchMashMode;
    fadeIn(phaseInput, PHASE_OVERLAP_MS);
    fadeOut(phaseLanding, PHASE_TRANSITION_MS, () => {
      fadeIn(historyToggle, 220);
      fadeIn(themeToggle, 220); // Show theme toggle here
      focusMashInput();
    });
  });
}

function showTapToBegin() {
  const tapToBegin = document.querySelector("#tap-to-begin");
  if (!tapToBegin) return;
  
  tapToBegin.classList.remove("hidden");
  
  const onFirstTap = (event) => {
    event.preventDefault();
    event.stopPropagation();
    tapGateDismissing = true;
    window.removeEventListener("click", onFirstTap);
    window.removeEventListener("touchstart", onFirstTap);
    
    // Resume audio context on user gesture
    musicGenerator.resume().then(() => {
      // Small delay for vibe
      setTimeout(() => {
        tapToBegin.classList.add("hidden");
        tapGateActive = false;
        tapGateDismissing = false;
        initBeginPhase();
      }, 400);
    }).catch(() => {
      tapToBegin.classList.add("hidden");
      tapGateActive = false;
      tapGateDismissing = false;
      initBeginPhase();
    });
  };

  window.addEventListener("click", onFirstTap);
  window.addEventListener("touchstart", onFirstTap);
}

// ─── Landing → Input ───

// Show "Tap to begin" gate instead of immediately showing the Begin Stone
showTapToBegin();

// Keep HTML button as a no-op fallback (hidden via CSS)
beginBtn.addEventListener("click", () => {
  musicGenerator.resume(); // Fix backup button (user gesture)
  sceneManager.dismissBeginCube();
});

// ─── Sign-up modal ───

signupLink.addEventListener("click", () => {
  isOverlayVisible = true;
  signupModal.classList.remove("hidden");
  setTimeout(() => signupEmail.focus(), 50);
});

modalClose.addEventListener("click", () => {
  isOverlayVisible = false;
  signupModal.classList.add("hidden");
});

signupModal.addEventListener("click", (event) => {
  if (event.target === signupModal) {
    isOverlayVisible = false;
    signupModal.classList.add("hidden");
  }
});

signupSubmit.addEventListener("click", () => {
  const email = signupEmail.value.trim();
  if (!email) return;
  localStorage.setItem("serenity-sounds-email", email);
  signupEmail.value = "";
  signupModal.classList.add("hidden");
});

// ─── Image upload ───

uploadBtn.addEventListener("click", () => imageUploadInput.click());

phaseInput.addEventListener("pointerdown", (event) => {
  if (event.target.closest("#upload-btn, #generate-btn")) {
    return;
  }

  if (touchMashMode) {
    return;
  }

  focusMashInput();
});

imageUploadInput.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  if (uploadedImageUrl) {
    URL.revokeObjectURL(uploadedImageUrl);
  }
  uploadedImageUrl = URL.createObjectURL(file);
  uploadBtn.style.backgroundImage = `url(${uploadedImageUrl})`;
  uploadBtn.classList.add("has-image");

  extractPaletteFromFile(file)
    .then((palette) => {
      uploadedImagePalette = palette;
      renderUploadPalette(uploadedImagePalette);
    })
    .catch((error) => {
      console.error("Palette extraction failed:", error);
      uploadedImagePalette = [];
      renderUploadPalette([]);
    });
});

// ─── Generate ───

generateBtn.addEventListener("click", (event) => {
  event.stopPropagation();
  sceneManager.suppressStoneClickOnce();
  generateComposition();
});

async function generateComposition() {
  const snapshot = activeMashCapture.getSnapshot();
  if (snapshot.keyCount < MIN_KEYPRESS_COUNT) return;
  desktopMashCursorHintVisible = false;

  // Fade and lock input immediately while the scene builds.
  phaseInput.style.pointerEvents = "none";

  currentAnalysis = analyzeInput(snapshot);
  focusReadingMap = buildFocusReadings(currentAnalysis);
  currentMoodParameters = applyUploadedPaletteInfluence(
    mapToMoodParameters(currentAnalysis),
  );

  const buildDuration = sceneManager.buildComposition(currentAnalysis, currentMoodParameters);
  musicGenerator.loadComposition(currentMoodParameters);
  syncPlayerDuration();
  stopMashDripSound();

  fadeOut(phaseInput, PHASE_TRANSITION_MS, () => {
    phaseInput.style.opacity = "";
    phaseInput.style.transition = "";
    phaseInput.style.pointerEvents = "";
  });

  window.clearTimeout(buildReadyTimeoutId);
  buildReadyTimeoutId = window.setTimeout(() => {
    fadeIn(playerBar, 120);
    saveToHistory(currentMoodParameters, currentAnalysis);
  }, buildDuration * 1000 + 420);
}

// ─── Playback ───

playPauseBtn.addEventListener("click", togglePlayback);

async function togglePlayback() {
    if (!musicGenerator) return;
    
    // Resume context on every play/pause gesture to stay robust
    try {
      if (typeof musicGenerator.resume === 'function') {
        await musicGenerator.resume();
      }
    } catch (e) { console.error("Audio resume failed:", e); }

    const isPlaying = await musicGenerator.togglePlayback();
  sceneManager.setPlaybackState(isPlaying);
  setPlayIcons(isPlaying);
}

// ─── Reset ───

resetBtn.addEventListener("click", resetExperience);

function resetExperience() {
  window.clearTimeout(buildReadyTimeoutId);
  stopMashDripSound(true);
  musicGenerator.stop();
  sceneManager.setPlaybackState(false);
  sceneManager.setAudioLevel(0);
  sceneManager.clearScene();

  currentAnalysis = null;
  currentMoodParameters = null;
  focusReadingMap = new Map();
  hintDismissed = false;
  generateAllowed = false;
  desktopMashCursorHintVisible = !touchMashMode;

  activeMashCapture.reset();

  if (uploadedImageUrl) {
    URL.revokeObjectURL(uploadedImageUrl);
    uploadedImageUrl = null;
  }
  uploadedImagePalette = [];
  uploadBtn.style.backgroundImage = "";
  uploadBtn.classList.remove("has-image");
  imageUploadInput.value = "";
  renderUploadPalette([]);

  generateBtn.classList.remove("is-visible");
  mashSurfaceLabel?.classList.remove("hidden", "fade-out");
  updateMashProgress(0);
  focusReading?.classList.add("hidden");
  focusReading?.classList.remove("is-visible");

  progressFill.style.width = "0%";
  playheadEl.style.left = "0%";
  playheadEl.classList.remove("is-active");
  timeCurrent.textContent = "0:00";
  timeTotal.textContent = "0:00";
  setPlayIcons(false);
  resetBtn.classList.add("hidden");

  fadeOut(playerBar, 560, () => {
    playerBar.classList.remove("is-visible");
    phaseInput.style.opacity = "";
    phaseInput.style.pointerEvents = "";
    phaseInput.style.transition = "";
    fadeIn(phaseInput, PHASE_OVERLAP_MS);
    focusMashInput();
  });
}

function returnHome() {
  window.clearTimeout(buildReadyTimeoutId);
  stopMashDripSound(true);
  musicGenerator.stop();
  sceneManager.setPlaybackState(false);
  sceneManager.setAudioLevel(0);

  currentAnalysis = null;
  currentMoodParameters = null;
  focusReadingMap = new Map();
  hintDismissed = false;
  generateAllowed = false;
  desktopMashCursorHintVisible = false;
  activeMashCapture.reset();

  if (uploadedImageUrl) {
    URL.revokeObjectURL(uploadedImageUrl);
    uploadedImageUrl = null;
  }
  uploadedImagePalette = [];
  uploadBtn.style.backgroundImage = "";
  uploadBtn.classList.remove("has-image");
  imageUploadInput.value = "";
  renderUploadPalette([]);

  generateBtn.classList.remove("is-visible");
  updateMashProgress(0);
  focusReading?.classList.add("hidden");
  focusReading?.classList.remove("is-visible");
  phaseInput.style.opacity = "";
  phaseInput.style.pointerEvents = "";
  phaseInput.style.transition = "";

  progressFill.style.width = "0%";
  playheadEl.style.left = "0%";
  playheadEl.classList.remove("is-active");
  timeCurrent.textContent = "0:00";
  timeTotal.textContent = "0:00";
  setPlayIcons(false);
  resetBtn.classList.add("hidden");

  closeHistoryDrawer();
  fadeOut(playerBar, 560);
  fadeOut(historyToggle, 420);
  fadeOut(returnHomeLink, 420, () => {
    phaseLanding.classList.remove("hidden");
    fadeIn(phaseLanding, 60);
    phaseInput.classList.add("hidden");
    phaseInput.classList.remove("is-visible");
    window.setTimeout(() => {
      sceneManager.clearScene();
      initBeginPhase();
    }, 180);
  });
}

returnHomeLink?.addEventListener("click", () => {
  sceneManager.suppressStoneClickOnce();
  returnHome();
});

// ─── History ───

function getHistorySessions() {
  return JSON.parse(localStorage.getItem("serenity-history") || "[]");
}

function setHistorySessions(sessions) {
  localStorage.setItem("serenity-history", JSON.stringify(sessions.slice(0, 20)));
}

function saveToHistory(moodParameters, analysis) {
  const sessions = getHistorySessions();
  sessions.unshift({
    timestamp: Date.now(),
    colorPalette: moodParameters.colorPalette,
    moodParameters,
    analysis,
  });
  setHistorySessions(sessions);
}

function timeAgo(timestamp) {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (days > 1) return new Date(timestamp).toLocaleDateString();
  if (hours > 0) return `${hours}h ago`;
  if (mins > 0) return `${mins}m ago`;
  return "just now";
}

function renderHistoryList() {
  const sessions = getHistorySessions();
  historyList.innerHTML = "";

  if (!sessions.length) {
    const empty = document.createElement("p");
    empty.className = "history-empty";
    empty.textContent = "No sessions yet.";
    historyList.appendChild(empty);
    return;
  }

  sessions.forEach((session) => {
    const row = document.createElement("div");
    row.className = "history-row";

    const main = document.createElement("div");
    main.className = "history-main";

    const swatches = document.createElement("div");
    swatches.className = "history-swatches";
    (session.colorPalette || []).forEach((color) => {
      const swatch = document.createElement("div");
      swatch.className = "history-swatch";
      swatch.style.background = color;
      swatches.appendChild(swatch);
    });

    const ts = document.createElement("span");
    ts.className = "history-timestamp";
    ts.textContent = timeAgo(session.timestamp);

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "history-delete";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      const nextSessions = getHistorySessions().filter((candidate) => candidate.timestamp !== session.timestamp);
      setHistorySessions(nextSessions);
      renderHistoryList();
    });

    main.appendChild(swatches);
    main.appendChild(ts);
    row.appendChild(main);
    row.appendChild(deleteBtn);

    row.addEventListener("click", () => {
      closeHistoryDrawer();
      replaySession(session);
    });

    historyList.appendChild(row);
  });
}

async function replaySession(session) {
  stopMashDripSound(true);
  currentMoodParameters = session.moodParameters;
  currentAnalysis = session.analysis || null;
  focusReadingMap = currentAnalysis ? buildFocusReadings(currentAnalysis) : new Map();
  musicGenerator.loadComposition(currentMoodParameters);
  syncPlayerDuration();

  if (currentAnalysis) {
    sceneManager.buildComposition(currentAnalysis, currentMoodParameters);
  }

  if (resetBtn) resetBtn.classList.add("hidden");
  if (progressFill) progressFill.style.width = "0%";
  if (playheadEl) {
    playheadEl.style.left = "0%";
    playheadEl.classList.remove("is-active");
  }
  if (timeCurrent) timeCurrent.textContent = "0:00";
  setPlayIcons(false);

  if (!phaseInput.classList.contains("hidden")) {
    fadeOut(phaseInput, PHASE_TRANSITION_MS);
  }
  fadeIn(playerBar, 120);
  sceneManager.setPlaybackState(false);

  try {
    await musicGenerator.resume();
  } catch (error) {
    console.error("Audio resume failed:", error);
  }

  const isPlaying = await musicGenerator.play();
  sceneManager.setPlaybackState(isPlaying);
  setPlayIcons(isPlaying);
}

function openHistoryDrawer() {
  isOverlayVisible = true;
  renderHistoryList();
  historyDrawer.classList.remove("hidden");
  // Force reflow before adding open class
  historyDrawer.getBoundingClientRect();
  historyDrawer.classList.add("open");
}

function closeHistoryDrawer() {
  isOverlayVisible = false;
  historyDrawer.classList.remove("open");
  setTimeout(() => historyDrawer.classList.add("hidden"), 380);
}

historyToggle.addEventListener("click", openHistoryDrawer);
historyClear?.addEventListener("click", () => {
  localStorage.removeItem("serenity-history");
  renderHistoryList();
});
historyClose.addEventListener("click", closeHistoryDrawer);

// ─── Tick loop ───

function tick() {
  if (appDestroyed) return;
  const isMusicPlaying = musicGenerator.isPlaying;
  const rawProgress = musicGenerator.getProgress();
  const progressPercent = Math.max(0, Math.min(100, rawProgress * 100)) || 0;
  
  // Strict State Sync: If music ended naturally or stopped, reset UI
  if (!isMusicPlaying && sceneManager.isPlaying) {
    togglePlayback(false);
    return;
  }
  
  // Auto-stop at 100% just in case
  if (isMusicPlaying && rawProgress >= 0.999) {
    togglePlayback(false);
    return;
  }

  // Horizontal progress update
  const currentSecs = rawProgress * (musicGenerator.durationSeconds || 0);
  
  if (progressFill) {
    progressFill.style.width = `${progressPercent}%`;
    if (playheadEl) {
      playheadEl.style.left = `${progressPercent}%`;
      if (progressPercent > 0) playheadEl.classList.add("is-active");
    }
    timeCurrent.textContent = formatTime(currentSecs);
    if (timeTotal && isMusicPlaying) {
      timeTotal.textContent = formatTime(musicGenerator.durationSeconds);
    }
  }

  // ── Sync Player Visibility with Focus Mode ──
  if (playerBar) {
    // Focus mode already fades the player via animateCursor(); only fully hide
    // it when an overlay is covering the scene.
    if (isOverlayVisible) {
      playerBar.classList.add("hidden");
      playerBar.classList.remove("is-visible");
    } else if (
      currentAnalysis &&
      phaseInput.classList.contains("hidden") &&
      phaseLanding.classList.contains("hidden")
    ) {
      // Restore player whenever a composition session exists and overlays are gone.
      playerBar.classList.remove("hidden");
      playerBar.classList.add("is-visible");
    }
  }

  if (returnHomeLink) {
    if (
      !isOverlayVisible &&
      currentAnalysis &&
      phaseInput.classList.contains("hidden") &&
      phaseLanding.classList.contains("hidden")
    ) {
      returnHomeLink.classList.remove("hidden");
      returnHomeLink.classList.add("is-visible");
    } else {
      returnHomeLink.classList.remove("is-visible");
      if (!returnHomeLink.classList.contains("hidden")) {
        window.setTimeout(() => {
          if (!returnHomeLink.classList.contains("is-visible")) {
            returnHomeLink.classList.add("hidden");
          }
        }, 320);
      }
    }
  }

  updateFocusReadingOverlay();

  tickAnimationFrameId = requestAnimationFrame(tick);
}

tick();

function destroyApp() {
  if (appDestroyed) return;
  appDestroyed = true;
  window.clearTimeout(buildReadyTimeoutId);
  window.clearTimeout(mashDripStopTimeoutId);
  if (cursorAnimationFrameId) cancelAnimationFrame(cursorAnimationFrameId);
  if (tickAnimationFrameId) cancelAnimationFrame(tickAnimationFrameId);
  stopMashDripSound(true);
  if (uploadedImageUrl) {
    URL.revokeObjectURL(uploadedImageUrl);
    uploadedImageUrl = null;
  }
  keyboardCapture.destroy?.();
  touchMashCapture.destroy?.();
  sceneManager.destroy?.();
  musicGenerator.destroy?.();
}

window.addEventListener("beforeunload", destroyApp, { once: true });
