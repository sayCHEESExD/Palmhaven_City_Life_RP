import type { InputState } from './InputState.js';

const KEY_BINDINGS: Readonly<Record<string, keyof BindingTargets>> = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'back',
  ArrowDown: 'back',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  Space: 'jump',
  ShiftLeft: 'sprint',
  ShiftRight: 'sprint',
  KeyC: 'down',
  ControlLeft: 'down',
};

interface BindingTargets {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
  sprint: boolean;
  down: boolean;
}

/** Desktop keyboard input. One of possibly several sources feeding InputManager. */
export class KeyboardSource {
  private readonly held: BindingTargets = {
    forward: false,
    back: false,
    left: false,
    right: false,
    jump: false,
    sprint: false,
    down: false,
  };

  attach(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  detach(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
  }

  apply(state: InputState): void {
    if (this.held.forward) state.moveZ += 1;
    if (this.held.back) state.moveZ -= 1;
    if (this.held.right) state.moveX += 1;
    if (this.held.left) state.moveX -= 1;
    if (this.held.jump) state.jump = true;
    if (this.held.sprint) state.sprint = true;
    if (this.held.down) state.down = true;
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    const binding = KEY_BINDINGS[event.code];
    if (!binding) return;
    if (event.repeat) return;
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    this.held[binding] = true;
    if (event.code === 'Space') event.preventDefault();
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    const binding = KEY_BINDINGS[event.code];
    if (!binding) return;
    this.held[binding] = false;
  };

  /** Losing focus must not leave a key stuck down. */
  private readonly onBlur = (): void => {
    this.held.forward = false;
    this.held.back = false;
    this.held.left = false;
    this.held.right = false;
    this.held.jump = false;
    this.held.sprint = false;
    this.held.down = false;
  };
}
