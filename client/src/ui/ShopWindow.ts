import {
  SHOPS,
  accessoryById,
  formatMoney,
  itemById,
  propById,
  vehicleById,
  type FurnitureCategory,
  type SelfState,
  type ShopId,
} from '@palmhaven/shared';
import type { IconFactory } from './IconFactory.js';
import { Modal, closeButton, el } from './Modal.js';

const FURNITURE_TABS: readonly { id: FurnitureCategory | 'all'; name: string }[] = [
  { id: 'all', name: 'All' },
  { id: 'living', name: 'Living' },
  { id: 'bedroom', name: 'Bedroom' },
  { id: 'kitchen', name: 'Kitchen' },
  { id: 'bath', name: 'Bath' },
  { id: 'decor', name: 'Decor' },
  { id: 'outdoor', name: 'Outdoor' },
  { id: 'fun', name: 'Fun' },
];

/**
 * ONE SHOP WINDOW FOR EVERY COUNTER: Palm Motors' showroom, Coastline
 * Threads' rails, FreshMart's shelves, the cafe and grill menus, Casa Home's
 * catalogue and the vending machines all draw through here - a header in the
 * shop's colour, the stock as cards with icons rendered from the real models,
 * and a buy button the server validates.
 */
export class ShopWindow extends Modal {
  private readonly win: HTMLDivElement;
  private readonly title: HTMLDivElement;
  private readonly sub: HTMLDivElement;
  private readonly money: HTMLDivElement;
  private readonly tabs: HTMLDivElement;
  private readonly grid: HTMLDivElement;
  private shop: ShopId = 'grocery';
  private self: SelfState | null = null;
  private tab = 'all';
  private paints = new Map<number, number>();

  constructor(container: HTMLElement, private readonly icons: IconFactory, private readonly buy: (shop: ShopId, id: number, paint?: number) => void) {
    super(container);
    this.win = el('div', 'ph-window');
    const head = el('div', 'ph-window__head');
    const titles = el('div', '');
    this.title = el('div', 'ph-window__title');
    this.sub = el('div', 'ph-window__sub');
    titles.append(this.title, this.sub);
    this.money = el('div', 'ph-window__money');
    head.append(titles, this.money, closeButton('', () => this.close()));
    this.tabs = el('div', 'ph-window__tabs');
    const body = el('div', 'ph-window__body');
    this.grid = el('div', 'ph-grid');
    body.append(this.grid);
    this.win.append(head, this.tabs, body);
    this.shade.append(this.win);
  }

  get current(): ShopId {
    return this.shop;
  }

  show(shop: ShopId, self: SelfState | null): void {
    this.shop = shop;
    this.self = self;
    this.tab = 'all';
    this.open();
    this.refresh();
  }

  setState(self: SelfState | null): void {
    this.self = self;
    if (this.isOpen) this.refresh();
  }

  override refresh(): void {
    const def = SHOPS[this.shop];
    this.win.style.setProperty('--ph-accent', def.color);
    this.title.textContent = def.name;
    this.sub.textContent = def.tagline;
    this.money.textContent = formatMoney(this.self?.money ?? 0);
    this.tabs.replaceChildren();
    if (def.kind === 'furniture') {
      for (const tab of FURNITURE_TABS) {
        const button = el('button', `ph-tab${tab.id === this.tab ? ' ph-tab--on' : ''}`, tab.name);
        button.onclick = () => {
          this.tab = tab.id;
          this.refresh();
        };
        this.tabs.append(button);
      }
    }
    this.grid.replaceChildren();
    for (const id of def.stock) {
      const card = this.card(def.kind, id);
      if (card) this.grid.append(card);
    }
  }

  private card(kind: string, id: number): HTMLDivElement | null {
    const self = this.self;
    const card = el('div', 'ph-card');
    const img = el('img', '');
    let name = '';
    let sub = '';
    let price = 0;
    let owned = false;
    let action = 'Buy';
    let paint: number | undefined;
    switch (kind) {
      case 'vehicles': {
        const v = vehicleById(id);
        if (!v) return null;
        paint = this.paints.get(id) ?? v.paints[0]!;
        img.src = this.icons.vehicle(id, paint);
        name = v.name;
        sub = v.blurb;
        price = v.price;
        owned = self?.vehicles.includes(id) ?? false;
        if (owned) action = 'Owned';
        break;
      }
      case 'accessories': {
        const a = accessoryById(id);
        if (!a) return null;
        img.src = this.icons.accessory(id);
        name = a.name;
        sub = a.slot === 'hat' ? 'Hat' : a.slot === 'face' ? 'Face' : 'Back';
        price = a.price;
        owned = self?.accessories.includes(id) ?? false;
        if (owned) action = self?.wearing[a.slot] === id ? 'Take off' : 'Wear';
        break;
      }
      case 'items': {
        const item = itemById(id);
        if (!item) return null;
        img.src = this.icons.item(id);
        name = item.name;
        sub = item.blurb;
        price = item.price;
        const stack = self?.items.find((s) => s.id === id);
        owned = !item.consumable && !!stack;
        if (owned) action = 'Owned';
        else if (stack) sub = `${item.blurb} (you have ${stack.count})`;
        break;
      }
      case 'furniture': {
        const prop = propById(id);
        if (!prop?.furniture) return null;
        if (this.tab !== 'all' && prop.furniture.category !== this.tab) return null;
        img.src = this.icons.prop(id);
        name = prop.name;
        const count = self?.furniture.find((s) => s.id === id)?.count ?? 0;
        sub = count > 0 ? `${count} in storage` : prop.furniture.category;
        price = prop.furniture.price;
        break;
      }
      default:
        return null;
    }
    if (owned) card.classList.add('ph-card--owned');
    card.append(img, el('div', 'ph-card__name', name), el('div', 'ph-card__sub', sub));
    if (kind === 'vehicles' && !owned) {
      const v = vehicleById(id)!;
      const swatches = el('div', 'ph-swatches');
      for (const color of v.paints) {
        const sw = el('button', `ph-swatch${color === paint ? ' ph-swatch--on' : ''}`);
        sw.style.background = `#${color.toString(16).padStart(6, '0')}`;
        sw.onclick = (event) => {
          event.stopPropagation();
          this.paints.set(id, color);
          this.refresh();
        };
        swatches.append(sw);
      }
      card.append(swatches);
    }
    card.append(el('div', 'ph-card__price', owned && kind !== 'accessories' ? '' : formatMoney(price)));
    const button = el('button', owned && action === 'Owned' ? 'ph-btn ph-btn--ghost' : 'ph-btn', action);
    button.disabled = action === 'Owned';
    const affordable = (self?.money ?? 0) >= price || owned;
    if (!affordable) button.classList.add('ph-btn--ghost');
    button.onclick = (event) => {
      event.stopPropagation();
      this.buy(this.shop, id, paint);
    };
    card.append(button);
    return card;
  }
}
