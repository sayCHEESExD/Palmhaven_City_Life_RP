import { el } from './Modal.js';

export interface TouchExtraHandlers {
  use(): void;
  vehicle(): void;
  /** A held button: name and whether it is down. */
  hold(name: 'run' | 'brake' | 'boost' | 'up' | 'down', down: boolean): void;
  horn(): void;
}

/**
 * THE PHONE-SCREEN BUTTONS beside the stick and JUMP: USE (the nearest
 * prompt), CAR (get in or out), RUN, and in a vehicle BRAKE, BOOST and, in
 * an aircraft, UP and DOWN. Hidden entirely on a desktop.
 */
export class TouchExtras {
  readonly root: HTMLDivElement;
  private readonly buttons = new Map<string, HTMLButtonElement>();

  constructor(container: HTMLElement, private readonly handlers: TouchExtraHandlers) {
    this.root = el('div', 'ph-touchbtns');
    const tap = (id: string, label: string, cls: string, run: () => void): void => {
      const b = el('button', `ph-touchbtn ${cls}`, label);
      b.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        event.stopPropagation();
        run();
      });
      this.buttons.set(id, b);
      this.root.append(b);
    };
    const hold = (id: 'run' | 'brake' | 'boost' | 'up' | 'down', label: string, cls: string): void => {
      const b = el('button', `ph-touchbtn ${cls}`, label);
      const set = (down: boolean): void => {
        b.classList.toggle('is-down', down);
        handlers.hold(id, down);
      };
      b.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        event.stopPropagation();
        try {
          b.setPointerCapture(event.pointerId);
        } catch {
          /* fine */
        }
        set(true);
      });
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) b.addEventListener(type, () => set(false));
      this.buttons.set(id, b);
      this.root.append(b);
    };
    tap('use', 'USE', 'ph-touchbtn--use', () => handlers.use());
    tap('car', 'CAR', '', () => handlers.vehicle());
    hold('run', 'RUN', 'ph-touchbtn--go');
    hold('brake', 'BRAKE', 'ph-touchbtn--brake');
    hold('boost', 'BOOST', 'ph-touchbtn--boost');
    hold('up', 'UP', 'ph-touchbtn--go');
    hold('down', 'DOWN', '');
    tap('horn', 'HORN', '', () => handlers.horn());
    container.append(this.root);
    this.setMode({ prompt: false, vehiclePrompt: false, driving: false, riding: false, aircraft: false, boost: false });
  }

  /** Show what makes sense right now. */
  setMode(state: { prompt: boolean; vehiclePrompt: boolean; driving: boolean; riding: boolean; aircraft: boolean; boost: boolean }): void {
    const show = (id: string, on: boolean): void => {
      const b = this.buttons.get(id);
      if (b) b.hidden = !on;
    };
    const inVehicle = state.driving || state.riding;
    show('use', state.prompt && !inVehicle);
    show('car', state.vehiclePrompt || inVehicle);
    show('run', !inVehicle);
    show('brake', state.driving && !state.aircraft);
    show('boost', state.driving && state.boost);
    show('up', state.driving && state.aircraft);
    show('down', state.driving && state.aircraft);
    show('horn', state.driving && !state.aircraft);
  }

  dispose(): void {
    this.root.remove();
  }
}
