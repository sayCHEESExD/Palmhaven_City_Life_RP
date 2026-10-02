import { FUEL_MAX, type VehicleDef } from '@palmhaven/shared';
import { ICONS, type IconName } from './icons.js';
import { el } from './Modal.js';

export interface VehicleHudHandlers {
  horn(): void;
  lights(): void;
  lock(): void;
  siren(): void;
  exit(): void;
  camera(): void;
  radio(step: number): void;
}

export const RADIO_STATIONS = ['Radio OFF', 'Palm FM 101.5', 'Ocean Beats', 'Sunset Lounge'] as const;

/**
 * THE DRIVER'S HUD (the reference's): a row of round buttons across the top
 * (horn, lights, lock, siren, nitro on SHIFT, exit on F, camera on V), a
 * speedometer with fuel and nitro bottom-right, the radio bottom-left.
 * Passengers see only the exit button.
 */
export class VehicleHud {
  readonly root: HTMLDivElement;
  private readonly row: HTMLDivElement;
  private readonly speedo: HTMLDivElement;
  private readonly value: HTMLSpanElement;
  private readonly name: HTMLDivElement;
  private readonly fuelFill: HTMLDivElement;
  private readonly nitroFill: HTMLDivElement;
  private readonly altLabel: HTMLSpanElement;
  private readonly radio: HTMLDivElement;
  private readonly radioBox: HTMLDivElement;
  private readonly buttons = new Map<string, HTMLButtonElement>();
  private kind = -1;
  private driver = false;
  private lastLocked: boolean | null = null;

  constructor(container: HTMLElement, private readonly handlers: VehicleHudHandlers) {
    this.root = el('div', 'ph-hud');
    this.root.hidden = true;
    this.row = el('div', 'ph-vrow');
    this.speedo = el('div', 'ph-speedo');
    this.name = el('div', 'ph-speedo__name', '');
    const line = el('div', '');
    this.value = el('span', 'ph-speedo__value', '0');
    line.append(this.value, el('span', 'ph-speedo__unit', 'MPH'));
    const fuel = el('div', 'ph-bar');
    this.fuelFill = el('div', 'ph-bar__fill');
    this.fuelFill.style.background = 'linear-gradient(90deg, #ffb703, #fb8500)';
    fuel.append(this.fuelFill);
    const nitro = el('div', 'ph-bar');
    this.nitroFill = el('div', 'ph-bar__fill');
    this.nitroFill.style.background = 'linear-gradient(90deg, #4dabf7, #9775fa)';
    nitro.append(this.nitroFill);
    const labels = el('div', 'ph-bar__label');
    this.altLabel = el('span', '', '');
    labels.append(el('span', '', 'FUEL / NITRO'), this.altLabel);
    this.speedo.append(this.name, line, fuel, nitro, labels);
    this.radio = el('div', 'ph-radio');
    const left = el('button', 'ph-radio__arrow ph-radio__arrow--l');
    left.setAttribute('aria-label', 'Previous station');
    left.addEventListener('click', () => handlers.radio(-1));
    this.radioBox = el('div', 'ph-radio__box', RADIO_STATIONS[0]);
    const right = el('button', 'ph-radio__arrow ph-radio__arrow--r');
    right.setAttribute('aria-label', 'Next station');
    right.addEventListener('click', () => handlers.radio(1));
    this.radio.append(left, this.radioBox, right);
    this.root.append(this.row, this.speedo, this.radio);
    container.append(this.root);
  }

  private build(def: VehicleDef, driver: boolean): void {
    this.row.replaceChildren();
    this.buttons.clear();
    const add = (id: string, icon: IconName, key: string, run: () => void, extra = ''): void => {
      const b = el('button', `ph-vbtn ${extra}`);
      b.innerHTML = ICONS[icon];
      if (key) b.append(el('span', 'ph-vbtn__key', key));
      b.addEventListener('click', (event) => {
        event.stopPropagation();
        run();
      });
      this.row.append(b);
      this.buttons.set(id, b);
    };
    if (driver) {
      add('horn', 'horn', 'H', () => this.handlers.horn());
      add('lights', 'sun', 'L', () => this.handlers.lights());
      add('lock', 'lock', 'K', () => this.handlers.lock());
      if (def.siren) add('siren', 'siren', 'G', () => this.handlers.siren(), 'ph-vbtn--siren');
      add('speed', 'gauge', '', () => undefined);
      if (def.handling.boost > 0) add('boost', 'bolt', 'SHIFT', () => undefined);
      if (def.class === 'car' || def.class === 'bike') add('drift', 'drift', 'SPACE', () => undefined);
      if (def.class === 'heli' || def.class === 'plane') add('up', 'plane', 'SPACE / C', () => undefined);
    }
    add('exit', 'exit', 'F', () => this.handlers.exit());
    add('camera', 'orbit', 'V', () => this.handlers.camera());
  }

  show(def: VehicleDef | null, driver: boolean): void {
    if (!def) {
      this.root.hidden = true;
      this.kind = -1;
      return;
    }
    this.root.hidden = false;
    if (def.id !== this.kind || driver !== this.driver) {
      this.kind = def.id;
      this.driver = driver;
      this.build(def, driver);
      this.lastLocked = null;
      this.name.textContent = def.name;
    }
    this.speedo.hidden = !driver;
    this.radio.hidden = def.class === 'board' || def.class === 'bike' && def.fuelUse === 0;
  }

  update(speed: number, fuel: number, nitro: number, flags: number, altitude: number | null, station: number): void {
    const mph = Math.round(Math.abs(speed) * 1.25);
    const text = String(mph);
    if (this.value.textContent !== text) this.value.textContent = text;
    this.fuelFill.style.width = `${Math.max(0, Math.min(100, (fuel / FUEL_MAX) * 100))}%`;
    this.nitroFill.style.width = `${Math.max(0, Math.min(100, nitro * 100))}%`;
    this.altLabel.textContent = altitude === null ? '' : `ALT ${Math.round(altitude)}`;
    this.buttons.get('lights')?.classList.toggle('ph-vbtn--on', (flags & 1) !== 0);
    this.buttons.get('siren')?.classList.toggle('ph-vbtn--on', (flags & 2) !== 0);
    const lock = this.buttons.get('lock');
    const locked = (flags & 4) !== 0;
    if (lock && locked !== this.lastLocked) {
      this.lastLocked = locked;
      lock.classList.toggle('ph-vbtn--on', locked);
      const key = lock.querySelector('.ph-vbtn__key');
      lock.innerHTML = locked ? ICONS.lock : ICONS.unlock;
      if (key) lock.append(key);
    }
    const label = RADIO_STATIONS[station] ?? RADIO_STATIONS[0];
    if (this.radioBox.textContent !== label) this.radioBox.textContent = label;
  }

  dispose(): void {
    this.root.remove();
  }
}
