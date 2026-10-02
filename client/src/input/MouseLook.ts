import { CAMERA } from '@palmhaven/shared';

/** Radians of rotation per pixel of mouse movement. */
const SENSITIVITY = 0.0042;

/** Pitch limits, so the camera can never flip over the player. */
const MIN_PITCH = -0.3;
const MAX_PITCH = 1.25;

/** Pixels a left-button press may travel and still count as a click. */
const CLICK_SLOP = 6;

/** One wheel notch, per `WheelEvent.deltaMode` (pixels, lines, pages). */
const NOTCH_PER_DELTA = [1 / 100, 1 / 3, 1] as const;

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * THE ROBLOX CAMERA CONTROLS. The cursor stays free - this is a game of
 * clicking plants, shops and buttons - and the camera is steered by
 * dragging: the RIGHT button (or a left drag on the world, for trackpads)
 * orbits, the wheel zooms. A left click that did not drag is a PICK: planting
 * a seed, harvesting, using a tool, placing a decoration.
 *
 * Touch look arrives through `addLookDelta` and touch taps through
 * `pushPick`, so the limits and the pick queue exist once.
 */
export class MouseLook {
  private canvas: HTMLElement | null = null;
  private yawValue = 0;
  private pitchValue = 0.38;
  private zoomValue = 0;
  private suppressed = false;
  private sensitivityScale = 1;

  private dragButton = -1;
  private downX = 0;
  private downY = 0;
  private lastX = 0;
  private lastY = 0;
  private dragged = false;
  private readonly picks: ScreenPoint[] = [];
  private pointerX = -1;
  private pointerY = -1;
  private pointerInside = false;

  get yaw(): number {
    return this.yawValue;
  }

  get pitch(): number {
    return this.pitchValue;
  }

  get zoom(): number {
    return this.zoomValue;
  }

  /** Where the mouse is over the canvas, for placement previews; null when it is not. */
  get pointer(): ScreenPoint | null {
    return this.pointerInside ? { x: this.pointerX, y: this.pointerY } : null;
  }

  /** True while the camera is being dragged (the preview hides). */
  get dragging(): boolean {
    return this.dragButton >= 0 && this.dragged;
  }

  attach(canvas: HTMLElement): void {
    this.canvas = canvas;
    canvas.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointerleave', this.onLeave);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('contextmenu', this.onContextMenu);
  }

  detach(): void {
    const canvas = this.canvas;
    if (!canvas) return;
    canvas.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    canvas.removeEventListener('pointerleave', this.onLeave);
    canvas.removeEventListener('wheel', this.onWheel);
    canvas.removeEventListener('contextmenu', this.onContextMenu);
    this.canvas = null;
  }

  setSuppressed(suppressed: boolean): void {
    this.suppressed = suppressed;
    if (suppressed) this.dragButton = -1;
  }

  /** Kept for the portal's pointer-lock callbacks: the cursor is always free here. */
  setCursorFree(_free: boolean): void {}

  setSensitivityScale(scale: number): void {
    this.sensitivityScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  }

  setYaw(yaw: number): void {
    this.yawValue = yaw;
  }

  /** Clicks (and taps) on the world since the last call. */
  consumePicks(): ScreenPoint[] {
    if (this.picks.length === 0) return EMPTY;
    const out = this.picks.slice();
    this.picks.length = 0;
    return out;
  }

  pushPick(x: number, y: number): void {
    if (!this.suppressed) this.picks.push({ x, y });
  }

  /** Touch drag-to-look feeds the same angles. */
  addLookDelta(deltaX: number, deltaY: number): void {
    if (this.suppressed) return;
    this.turn(deltaX, deltaY);
  }

  /** performance.now() of the last manual camera turn. */
  lastTurnAt = 0;

  setPitch(pitch: number): void {
    this.pitchValue = Math.min(MAX_PITCH, Math.max(MIN_PITCH, pitch));
  }

  private turn(dx: number, dy: number): void {
    this.lastTurnAt = performance.now();
    this.yawValue -= dx;
    this.yawValue = Math.atan2(Math.sin(this.yawValue), Math.cos(this.yawValue));
    this.pitchValue = Math.min(MAX_PITCH, Math.max(MIN_PITCH, this.pitchValue + dy));
  }

  private readonly onDown = (event: PointerEvent): void => {
    if (event.pointerType !== 'mouse' || this.suppressed) return;
    if (event.button !== 0 && event.button !== 2) return;
    this.dragButton = event.button;
    this.downX = this.lastX = event.clientX;
    this.downY = this.lastY = event.clientY;
    this.dragged = event.button === 2;
    if (event.button === 2) event.preventDefault();
  };

  private readonly onMove = (event: PointerEvent): void => {
    if (event.pointerType !== 'mouse') return;
    this.pointerX = event.clientX;
    this.pointerY = event.clientY;
    this.pointerInside = event.target === this.canvas;
    if (this.dragButton < 0 || this.suppressed) return;
    const dx = event.clientX - this.lastX;
    const dy = event.clientY - this.lastY;
    this.lastX = event.clientX;
    this.lastY = event.clientY;
    if (!this.dragged && Math.hypot(event.clientX - this.downX, event.clientY - this.downY) > CLICK_SLOP) this.dragged = true;
    if (this.dragged) this.turn(dx * SENSITIVITY * this.sensitivityScale, dy * SENSITIVITY * this.sensitivityScale);
  };

  private readonly onUp = (event: PointerEvent): void => {
    if (event.pointerType !== 'mouse' || this.dragButton < 0) return;
    const wasClick = this.dragButton === 0 && !this.dragged;
    this.dragButton = -1;
    this.dragged = false;
    if (wasClick && event.target === this.canvas) this.pushPick(event.clientX, event.clientY);
  };

  private readonly onLeave = (): void => {
    this.pointerInside = false;
  };

  private readonly onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    if (this.suppressed) return;
    const notches = event.deltaY * (NOTCH_PER_DELTA[event.deltaMode] ?? NOTCH_PER_DELTA[0]);
    this.zoomValue = Math.min(CAMERA.zoomMax, Math.max(CAMERA.zoomMin, this.zoomValue + notches * CAMERA.zoomStep));
  };

  private readonly onContextMenu = (event: Event): void => {
    event.preventDefault();
  };
}

const EMPTY: ScreenPoint[] = [];
