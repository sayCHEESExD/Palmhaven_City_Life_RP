import { formatMoney, itemById, jobById, type SelfState, type Task } from '@palmhaven/shared';
import type { IconFactory } from './IconFactory.js';
import { ICONS, type IconName } from './icons.js';
import type { MapPainter } from './MapView.js';
import { Minimap } from './MapView.js';
import { el } from './Modal.js';
import { injectCityStyles } from './styles.js';

export interface HudHandlers {
  shop(): void;
  emotes(): void;
  jobs(): void;
  map(): void;
  people(): void;
  phone(): void;
  hotbar(item: number): void;
  useHeld(): void;
  cancelTask(): void;
}

const TASK_TITLE: Record<Task['kind'], { title: string; icon: IconName; color: string }> = {
  delivery: { title: 'Delivery', icon: 'box', color: '#ffb547' },
  taxi: { title: 'Taxi', icon: 'taxi', color: '#ffd23f' },
  police: { title: 'Dispatch', icon: 'badge', color: '#4d8dff' },
  medic: { title: 'Emergency', icon: 'cross', color: '#ff5d6c' },
  order: { title: 'Order', icon: 'chef', color: '#ff8fb1' },
  sale: { title: 'Customer', icon: 'tag', color: '#7be0a8' },
};

/**
 * THE ALWAYS-ON HUD, kept small: the round icon buttons top-left, the
 * minimap with the wallet, clock and job under it top-right, the phone on the
 * right edge, the hotbar along the bottom, the current job task bottom-left,
 * and toasts that come and go.
 */
export class Hud {
  readonly root: HTMLDivElement;
  readonly minimap: Minimap;
  private readonly money: HTMLSpanElement;
  private readonly clock: HTMLSpanElement;
  private readonly jobPill: HTMLDivElement;
  private readonly jobDot: HTMLSpanElement;
  private readonly jobName: HTMLSpanElement;
  private readonly hotbar: HTMLDivElement;
  private readonly task: HTMLDivElement;
  private readonly toasts: HTMLDivElement;
  private readonly phoneBadge: HTMLSpanElement;
  private readonly iconbar: HTMLDivElement;
  private readonly corner: HTMLDivElement;
  private hotbarKey = '';
  private taskKey = '';
  private lastMoney = -1;
  private items: number[] = [];

  constructor(container: HTMLElement, painter: MapPainter, private readonly icons: IconFactory, private readonly handlers: HudHandlers) {
    injectCityStyles();
    this.root = el('div', 'ph-hud');
    // Top-left: round buttons.
    this.iconbar = el('div', 'ph-iconbar');
    const button = (icon: IconName, tip: string, run: () => void): HTMLButtonElement => {
      const b = el('button', 'ph-iconbtn');
      b.innerHTML = ICONS[icon];
      b.append(el('span', 'ph-iconbtn__tip', tip));
      b.setAttribute('aria-label', tip);
      b.addEventListener('click', run);
      this.iconbar.append(b);
      return b;
    };
    button('bag', 'Shops', () => handlers.shop());
    button('dance', 'Emotes (B)', () => handlers.emotes());
    button('briefcase', 'Jobs', () => handlers.jobs());
    button('pin', 'Map (M)', () => handlers.map());
    button('userPlus', 'People', () => handlers.people());
    // Top-right: minimap, money, clock, job.
    this.corner = el('div', 'ph-corner');
    this.minimap = new Minimap(painter, () => handlers.map());
    const wallet = el('div', 'ph-wallet');
    const moneyPill = el('div', 'ph-pill ph-money');
    const coin = el('span', 'ph-money__icon', '$');
    this.money = el('span', '', '$0');
    moneyPill.append(coin, this.money);
    wallet.append(moneyPill);
    const info = el('div', 'ph-wallet');
    this.clock = el('span', 'ph-pill ph-clock', '12:00 PM');
    this.jobPill = el('div', 'ph-pill ph-jobpill');
    this.jobDot = el('span', 'ph-jobpill__dot');
    this.jobName = el('span', '', 'Citizen');
    this.jobPill.append(this.jobDot, this.jobName);
    this.jobPill.style.cursor = 'pointer';
    this.jobPill.addEventListener('click', () => handlers.jobs());
    info.append(this.jobPill, this.clock);
    this.corner.append(this.minimap.root, wallet, info);
    // The phone.
    const phone = el('button', 'ph-phonebtn');
    phone.innerHTML = ICONS.phoneHand;
    phone.setAttribute('aria-label', 'Phone (P)');
    this.phoneBadge = el('span', 'ph-phonebtn__badge', '!');
    this.phoneBadge.hidden = true;
    phone.append(this.phoneBadge);
    phone.addEventListener('click', () => handlers.phone());
    // Bottom.
    this.hotbar = el('div', 'ph-hotbar');
    this.task = el('div', 'ph-task');
    this.task.hidden = true;
    this.toasts = el('div', 'ph-toasts');
    this.root.append(this.iconbar, this.corner, phone, this.hotbar, this.task, this.toasts);
    container.append(this.root);
  }

  setClock(text: string): void {
    if (this.clock.textContent !== text) this.clock.textContent = text;
  }

  setSelf(self: SelfState): void {
    if (self.money !== this.lastMoney) {
      if (this.lastMoney >= 0) {
        this.money.parentElement?.classList.remove('ph-money--bump');
        void this.money.offsetWidth;
        this.money.parentElement?.classList.add('ph-money--bump');
      }
      this.lastMoney = self.money;
      this.money.textContent = formatMoney(self.money);
    }
    const job = jobById(self.job);
    if (job) {
      this.jobName.textContent = job.id === 'civilian' ? 'Citizen' : job.title;
      this.jobDot.style.background = job.color;
    }
    this.phoneBadge.hidden = !self.dailyReady;
    this.setHotbar(self);
  }

  /** The bag's items, nine at most, the one in hand highlighted. */
  private setHotbar(self: SelfState): void {
    const items = self.items.slice(0, 9).map((s) => s.id);
    const key = `${self.held}|${self.items.map((s) => `${s.id}:${s.count}`).join(',')}`;
    if (key === this.hotbarKey) return;
    this.hotbarKey = key;
    this.items = items;
    this.hotbar.replaceChildren();
    self.items.slice(0, 9).forEach((stack, i) => {
      const item = itemById(stack.id);
      if (!item) return;
      const slot = el('button', `ph-slot${self.held === item.id ? ' ph-slot--on' : ''}`);
      slot.title = item.name;
      const img = el('img', '');
      img.src = this.icons.item(item.id);
      img.alt = item.name;
      slot.append(img, el('span', 'ph-slot__key', String(i + 1)));
      if (item.consumable) slot.append(el('span', 'ph-slot__count', `x${stack.count}`));
      if (self.held === item.id && item.use !== 'hold') {
        const use = el('button', 'ph-slot__use', item.use === 'eat' ? 'Eat' : item.use === 'drink' ? 'Drink' : item.use === 'strum' ? 'Play' : item.use === 'photo' ? 'Snap' : item.use === 'fish' ? 'Cast' : 'Use');
        use.addEventListener('click', (event) => {
          event.stopPropagation();
          this.handlers.useHeld();
        });
        slot.append(use);
      }
      slot.addEventListener('click', () => this.handlers.hotbar(self.held === item.id ? 0 : item.id));
      this.hotbar.append(slot);
    });
  }

  /** The item in hotbar slot n (1-based), or 0. */
  slot(n: number): number {
    return this.items[n - 1] ?? 0;
  }

  setTask(task: Task | null, distance: number, hint: string): void {
    if (!task && !hint) {
      this.task.hidden = true;
      this.taskKey = '';
      return;
    }
    const meta = task ? TASK_TITLE[task.kind] : { title: 'Tip', icon: 'star' as IconName, color: '#2ec4b6' };
    const key = `${task?.label ?? hint}|${task?.reward ?? 0}|${Math.round(distance / 5)}|${task?.made?.join(',') ?? ''}|${task?.stage ?? ''}`;
    if (key === this.taskKey) return;
    this.taskKey = key;
    this.task.hidden = false;
    this.task.style.borderLeftColor = meta.color;
    const head = el('div', 'ph-task__head');
    const icon = el('span', '');
    icon.innerHTML = ICONS[meta.icon];
    icon.style.width = '18px';
    icon.style.height = '18px';
    icon.style.display = 'inline-flex';
    icon.style.color = meta.color;
    head.append(icon, el('span', '', meta.title));
    if (task) {
      const x = el('button', 'ph-task__x', '✕');
      x.title = 'Drop task';
      x.addEventListener('click', () => this.handlers.cancelTask());
      head.append(x);
    }
    const children: HTMLElement[] = [head, el('div', 'ph-task__text', task?.label ?? hint)];
    if (task?.order && task.kind === 'order') {
      const order = el('div', 'ph-task__order');
      const made = [...(task.made ?? [])];
      for (const key of task.order) {
        const at = made.indexOf(key);
        if (at >= 0) made.splice(at, 1);
        order.append(el('span', `ph-task__chip${at >= 0 ? ' ph-task__chip--done' : ''}`, key));
      }
      children.push(order);
    }
    if (task) {
      const meta2 = el('div', 'ph-task__meta');
      meta2.append(el('span', '', distance > 1 ? `${Math.round(distance)}m away` : ''), el('span', '', task.reward > 0 ? `+${formatMoney(task.reward)}` : ''));
      children.push(meta2);
    }
    this.task.replaceChildren(...children);
  }

  toast(text: string, kind: 'good' | 'bad' | 'info' | 'gold' = 'info'): void {
    const node = el('div', `ph-toast ph-toast--${kind}`, text);
    this.toasts.append(node);
    while (this.toasts.children.length > 4) this.toasts.firstElementChild?.remove();
    window.setTimeout(() => node.remove(), 3300);
  }

  banner(text: string): void {
    const node = el('div', 'ph-banner', text);
    this.root.append(node);
    window.setTimeout(() => node.remove(), 2700);
  }

  moneyRect(): DOMRect {
    return this.money.getBoundingClientRect();
  }

  /** Hide the on-foot parts while driving or in a menu. */
  setMode(driving: boolean): void {
    this.hotbar.hidden = driving;
    this.iconbar.hidden = driving;
    this.root.classList.toggle('ph-hud--driving', driving);
  }

  dispose(): void {
    this.root.remove();
  }
}
