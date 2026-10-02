import { hasTouchSupport, isTouchPrimary, onFirstTouch } from '../config/device.js';
import { createInputState, type InputState } from './InputState.js';
import { KeyboardSource } from './KeyboardSource.js';
import { MouseLook } from './MouseLook.js';
import { TouchControls } from './TouchControls.js';

/**
 * Aggregates every input source into a single normalised InputState.
 *
 * Keyboard and touch are peers here: both merge into the same snapshot, so the
 * player controller, the prediction, the network message and every
 * server-authoritative rule downstream cannot tell them apart.
 */
export class InputManager {
  private readonly state: InputState = createInputState();
  private readonly keyboard = new KeyboardSource();
  readonly look = new MouseLook();
  private readonly touch = new TouchControls(this.look);
  private cancelTouchWatch: (() => void) | null = null;
  private suppressed = false;
  /** On-screen buttons (vehicle pedals, RUN) write here. */
  readonly virtual = { jump: false, sprint: false, down: false, moveZ: 0 };

  /** In a vehicle the stick axes are independent (steer and throttle), so they are not normalised together. */
  vehicleMode = false;

  get touchActive(): boolean {
    return this.touch.isVisible;
  }

  setSuppressed(suppressed: boolean): void {
    this.suppressed = suppressed;
    this.look.setSuppressed(suppressed);
    this.touch.setSuppressed(suppressed);
  }

  attach(canvas: HTMLElement): void {
    this.keyboard.attach();
    this.look.attach(canvas);
    this.touch.attach(canvas, canvas.parentElement ?? document.body);

    if (isTouchPrimary()) {
      this.showTouchControls();
    } else if (hasTouchSupport()) {
      this.cancelTouchWatch = onFirstTouch(() => this.showTouchControls());
    }
  }

  detach(): void {
    this.keyboard.detach();
    this.look.detach();
    this.touch.detach();
    this.cancelTouchWatch?.();
    this.cancelTouchWatch = null;
  }

  /** Recompute the snapshot for this frame. */
  sample(): Readonly<InputState> {
    this.state.moveX = 0;
    this.state.moveZ = 0;
    this.state.jump = false;
    this.state.sprint = false;
    this.state.down = false;

    this.keyboard.apply(this.state);
    this.touch.apply(this.state);
    if (this.virtual.jump) this.state.jump = true;
    if (this.virtual.sprint) this.state.sprint = true;
    if (this.virtual.down) this.state.down = true;
    this.state.moveZ += this.virtual.moveZ;

    if (this.suppressed) {
      this.state.moveX = 0;
      this.state.moveZ = 0;
      this.state.jump = false;
      this.state.sprint = false;
      this.state.down = false;
      return this.state;
    }

    if (this.vehicleMode) {
      this.state.moveX = Math.max(-1, Math.min(1, this.state.moveX));
      this.state.moveZ = Math.max(-1, Math.min(1, this.state.moveZ));
    }
    const magnitude = Math.hypot(this.state.moveX, this.state.moveZ);
    if (magnitude > 1 && !this.vehicleMode) {
      this.state.moveX /= magnitude;
      this.state.moveZ /= magnitude;
    }

    return this.state;
  }

  private showTouchControls(): void {
    this.cancelTouchWatch?.();
    this.cancelTouchWatch = null;
    this.touch.show();
    document.body.classList.add('aoe-touch-mode');
  }
}
