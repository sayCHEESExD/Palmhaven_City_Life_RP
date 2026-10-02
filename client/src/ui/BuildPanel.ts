import { FURNITURE, propById, type SelfState } from '@palmhaven/shared';
import type { IconFactory } from './IconFactory.js';
import { ICONS } from './icons.js';
import { el } from './Modal.js';

export interface BuildHandlers {
  done(): void;
  rotate(): void;
  shop(): void;
  changed(): void;
}

/**
 * DECORATING: your stored furniture along a strip, pick a piece and click the
 * floor to place it; click a placed piece (with nothing picked) to pick it up
 * again, or move it. R rotates.
 */
export class BuildPanel {
  readonly root: HTMLDivElement;
  private readonly row: HTMLDivElement;
  private readonly hint: HTMLDivElement;
  private self: SelfState | null = null;
  selected = 0;
  /** A placed piece being moved (furniture id), or 0. */
  moving = 0;
  rot = 0;

  constructor(container: HTMLElement, private readonly icons: IconFactory, private readonly handlers: BuildHandlers) {
    this.root = el('div', 'ph-build ph-font');
    this.root.hidden = true;
    this.row = el('div', 'ph-build__row');
    const bar = el('div', 'ph-build__bar');
    this.hint = el('div', 'ph-build__hint', '');
    const rotate = el('button', 'ph-btn ph-btn--ghost', 'Rotate (R)');
    rotate.prepend(this.icon('rotate'));
    rotate.addEventListener('click', () => this.rotate());
    const shop = el('button', 'ph-btn ph-btn--gold', 'Casa Home');
    shop.addEventListener('click', () => handlers.shop());
    const done = el('button', 'ph-btn', 'Done');
    done.addEventListener('click', () => handlers.done());
    bar.append(this.hint, rotate, shop, done);
    this.root.append(this.row, bar);
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
    container.append(this.root);
  }

  private icon(name: keyof typeof ICONS): HTMLSpanElement {
    const span = el('span', '');
    span.innerHTML = ICONS[name];
    span.style.display = 'inline-flex';
    span.style.width = '16px';
    span.style.height = '16px';
    span.style.marginRight = '4px';
    span.style.verticalAlign = 'middle';
    return span;
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  setOpen(open: boolean): void {
    this.root.hidden = !open;
    this.selected = 0;
    this.moving = 0;
    this.render();
  }

  rotate(): void {
    this.rot = (this.rot + 1) % 4;
    this.handlers.changed();
  }

  setState(self: SelfState | null): void {
    this.self = self;
    if (this.selected && !(self?.furniture.some((s) => s.id === this.selected && s.count > 0) ?? false)) this.selected = 0;
    if (this.isOpen) this.render();
  }

  pickMoving(fid: number): void {
    this.moving = fid;
    this.selected = 0;
    this.render();
    this.handlers.changed();
  }

  private render(): void {
    this.row.replaceChildren();
    const stock = this.self?.furniture ?? [];
    if (stock.length === 0) {
      this.row.append(el('div', 'ph-build__hint', 'No furniture in storage. Buy some at Casa Home, or click a piece in your home to move it.'));
    }
    for (const stack of [...stock].sort((a, b) => (FURNITURE.findIndex((f) => f.id === a.id) - FURNITURE.findIndex((f) => f.id === b.id)))) {
      const prop = propById(stack.id);
      if (!prop) continue;
      const item = el('button', `ph-build__item${this.selected === prop.id ? ' ph-build__item--on' : ''}`);
      const img = el('img', '');
      img.src = this.icons.prop(prop.id);
      item.append(img, el('span', 'ph-build__count', `x${stack.count}`), el('div', 'ph-build__name', prop.name));
      item.addEventListener('click', () => {
        this.selected = this.selected === prop.id ? 0 : prop.id;
        this.moving = 0;
        this.render();
        this.handlers.changed();
      });
      this.row.append(item);
    }
    this.hint.textContent = this.moving
      ? 'Click the floor to put it down. R rotates.'
      : this.selected
        ? 'Click the floor to place it. R rotates.'
        : 'Pick something to place, or click furniture to move it. Right-click (or long-press) a piece to store it.';
  }

  dispose(): void {
    this.root.remove();
  }
}
