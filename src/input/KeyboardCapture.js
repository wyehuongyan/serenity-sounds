import { KEYBOARD_ROWS } from "../config.js";

const IGNORED_KEYS = new Set([
  "Shift",
  "Meta",
  "Alt",
  "Control",
  "CapsLock",
  "Tab",
  "Escape",
]);

function normalizeKeyLabel(event) {
  if (event.key === " ") {
    return "Space";
  }

  return event.key.length === 1 ? event.key : event.key.replace("Arrow", "");
}

function isEditableTarget(target) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

function resolveKeyPosition(code) {
  for (let rowIndex = 0; rowIndex < KEYBOARD_ROWS.length; rowIndex += 1) {
    const row = KEYBOARD_ROWS[rowIndex];
    const columnIndex = row.indexOf(code);

    if (columnIndex !== -1) {
      const horizontal = row.length === 1 ? 0 : (columnIndex / (row.length - 1)) * 2 - 1;
      const vertical = KEYBOARD_ROWS.length === 1
        ? 0
        : (rowIndex / (KEYBOARD_ROWS.length - 1)) * 2 - 1;

      return { horizontal, vertical, rowIndex, columnIndex };
    }
  }

  return {
    horizontal: 0,
    vertical: 0,
    rowIndex: 1,
    columnIndex: 0,
  };
}

export class KeyboardCapture {
  constructor({ input, onUpdate, eventTarget = document, shouldCapture = null }) {
    this.input = input;
    this.onUpdate = onUpdate || (() => {});
    this.eventTarget = eventTarget;
    this.shouldCapture = shouldCapture;
    this.reset();

    this.onKeyDown = this.onKeyDown.bind(this);
    this.eventTarget.addEventListener("keydown", this.onKeyDown);
  }

  onKeyDown(event) {
    if (typeof this.shouldCapture === "function" && !this.shouldCapture(event)) {
      return;
    }

    if (isEditableTarget(event.target) && event.target !== this.input) {
      return;
    }

    // Prevent Tab from stealing focus during mashing
    if (event.key === "Tab") {
      event.preventDefault();
      return;
    }

    if (IGNORED_KEYS.has(event.key)) {
      return;
    }

    event.preventDefault();

    const timestamp = performance.now();
    const keyPosition = resolveKeyPosition(event.code);
    const key = normalizeKeyLabel(event);

    if (this.firstTimestamp === null) {
      this.firstTimestamp = timestamp;
    }

    if (this.lastTimestamp !== null) {
      this.velocities.push(timestamp - this.lastTimestamp);
    }

    this.lastTimestamp = timestamp;
    this.keys.push({
      key,
      code: event.code,
      timestamp,
      ...keyPosition,
    });

    this.onUpdate(this.keys.length);
  }

  getSnapshot() {
    return {
      keys: [...this.keys],
      velocities: [...this.velocities],
      keyCount: this.keys.length,
      totalDuration:
        this.firstTimestamp === null || this.lastTimestamp === null
          ? 0
          : this.lastTimestamp - this.firstTimestamp,
    };
  }

  reset() {
    this.keys = [];
    this.velocities = [];
    this.firstTimestamp = null;
    this.lastTimestamp = null;

    if (this.input) {
      this.input.value = "";
    }

    this.onUpdate(0);
  }
}
