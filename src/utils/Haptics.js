const PRESETS = {
  light: [{ duration: 10, delay: 0 }],
  medium: [{ duration: 16, delay: 0 }],
  double: [
    { duration: 10, delay: 0 },
    { duration: 12, delay: 80 },
  ],
  strong: [
    { duration: 12, delay: 0 },
    { duration: 12, delay: 55 },
    { duration: 14, delay: 55 },
  ],
};

function normalizePattern(input) {
  if (!input) return PRESETS.light;
  if (typeof input === "string") return PRESETS[input] || PRESETS.light;
  if (typeof input === "number") return [{ duration: input, delay: 0 }];
  if (Array.isArray(input)) return input;
  return PRESETS.light;
}

class HapticsController {
  constructor() {
    this.switchLabel = null;
    this.switchInput = null;
    this.timeouts = new Set();
    this.supportsVibrate =
      typeof navigator !== "undefined" &&
      typeof navigator.vibrate === "function";
  }

  ensureSwitch() {
    if (this.switchLabel || typeof document === "undefined") return;

    const id = "airfoil-haptics-switch";
    const label = document.createElement("label");
    label.setAttribute("for", id);
    label.style.position = "fixed";
    label.style.left = "-9999px";
    label.style.top = "-9999px";
    label.style.width = "1px";
    label.style.height = "1px";
    label.style.overflow = "hidden";
    label.style.opacity = "0";
    label.style.pointerEvents = "none";

    const input = document.createElement("input");
    input.id = id;
    input.type = "checkbox";
    input.setAttribute("switch", "");
    input.style.appearance = "auto";
    input.style.pointerEvents = "none";

    label.appendChild(input);
    document.body.appendChild(label);

    this.switchLabel = label;
    this.switchInput = input;
  }

  pulse() {
    this.ensureSwitch();
    this.switchLabel?.click();
  }

  trigger(pattern = "light") {
    const phases = normalizePattern(pattern);
    if (!phases.length) return;

    if (this.supportsVibrate) {
      const vibratePattern = [];
      phases.forEach((phase, index) => {
        if (index > 0) {
          vibratePattern.push(phase.delay || 0);
        }
        vibratePattern.push(phase.duration);
      });
      navigator.vibrate(vibratePattern);
    }

    let cumulativeDelay = 0;
    phases.forEach((phase, index) => {
      if (index === 0) {
        this.pulse();
        return;
      }

      cumulativeDelay += phase.delay || 0;
      const timeoutId = window.setTimeout(() => {
        this.timeouts.delete(timeoutId);
        this.pulse();
      }, cumulativeDelay);
      this.timeouts.add(timeoutId);
    });
  }

  destroy() {
    this.timeouts.forEach((timeoutId) => window.clearTimeout(timeoutId));
    this.timeouts.clear();
    this.switchLabel?.remove();
    this.switchLabel = null;
    this.switchInput = null;
  }
}

export const haptics = new HapticsController();
