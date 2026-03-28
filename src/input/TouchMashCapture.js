function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function quantizeAxis(value, steps) {
  return Math.max(0, Math.min(steps - 1, Math.floor(clamp01(value) * steps)));
}

function isTouchPointer(event) {
  return event.pointerType === "touch" || event.pointerType === "pen";
}

export class TouchMashCapture {
  constructor({ target, onUpdate, shouldCapture = null, onTouchDown = null }) {
    this.target = target;
    this.onUpdate = onUpdate || (() => {});
    this.shouldCapture = shouldCapture;
    this.onTouchDown = onTouchDown;
    this.activePointers = new Map();
    this.reset();

    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);

    this.target.addEventListener("pointerdown", this.onPointerDown, { passive: false });
    this.target.addEventListener("pointermove", this.onPointerMove, { passive: false });
    this.target.addEventListener("pointerup", this.onPointerUp);
    this.target.addEventListener("pointercancel", this.onPointerUp);
  }

  destroy() {
    this.target.removeEventListener("pointerdown", this.onPointerDown);
    this.target.removeEventListener("pointermove", this.onPointerMove);
    this.target.removeEventListener("pointerup", this.onPointerUp);
    this.target.removeEventListener("pointercancel", this.onPointerUp);
    this.activePointers.clear();
  }

  resolvePosition(event) {
    const bounds = this.target.getBoundingClientRect();
    const nx = clamp01((event.clientX - bounds.left) / Math.max(bounds.width, 1));
    const ny = clamp01((event.clientY - bounds.top) / Math.max(bounds.height, 1));
    const rowIndex = quantizeAxis(ny, 4);
    const columnIndex = quantizeAxis(nx, 10);

    return {
      horizontal: nx * 2 - 1,
      vertical: ny * 2 - 1,
      rowIndex,
      columnIndex,
      nx,
      ny,
    };
  }

  recordSample(event, kind = "touch") {
    const timestamp = performance.now();
    const keyPosition = this.resolvePosition(event);
    const key = `Touch ${keyPosition.rowIndex + 1}-${keyPosition.columnIndex + 1}`;
    const code = `Touch_${kind}_${keyPosition.rowIndex}_${keyPosition.columnIndex}`;

    if (this.firstTimestamp === null) {
      this.firstTimestamp = timestamp;
    }

    if (this.lastTimestamp !== null) {
      this.velocities.push(timestamp - this.lastTimestamp);
    }

    this.lastTimestamp = timestamp;
    this.keys.push({
      key,
      code,
      timestamp,
      ...keyPosition,
    });

    this.onUpdate(this.keys.length);
  }

  onPointerDown(event) {
    if (!isTouchPointer(event)) {
      return;
    }

    if (typeof this.shouldCapture === "function" && !this.shouldCapture(event)) {
      return;
    }

    event.preventDefault();
    this.target.setPointerCapture?.(event.pointerId);
    this.activePointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
      timestamp: performance.now(),
    });
    this.onTouchDown?.(event);
    this.recordSample(event, "down");
  }

  onPointerMove(event) {
    if (!isTouchPointer(event)) {
      return;
    }

    const pointer = this.activePointers.get(event.pointerId);
    if (!pointer) {
      return;
    }

    const now = performance.now();
    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const elapsed = now - pointer.timestamp;

    if (distance < 24 && elapsed < 80) {
      return;
    }

    event.preventDefault();
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.timestamp = now;
    this.recordSample(event, "move");
  }

  onPointerUp(event) {
    this.activePointers.delete(event.pointerId);
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
    this.activePointers = new Map();
    this.onUpdate(0);
  }
}
