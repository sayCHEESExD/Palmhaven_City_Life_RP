import {
  ACCESSORIES,
  CHAT_LINES,
  EMOTES,
  FREE_VEHICLES,
  HOUSE_STYLES,
  HOUSE_STYLE_LIST,
  ITEMS,
  JOBS,
  PAYCHECK_SECONDS,
  VEHICLES,
  accessoryById,
  cityPlan,
  formatMoney,
  itemById,
  jobById,
  visibleName,
  type AccessorySlot,
  type JobId,
  type SelfState,
  type VehicleDef,
} from '@palmhaven/shared';
import type { IconFactory } from './IconFactory.js';
import { ICONS, type IconName } from './icons.js';
import { el } from './Modal.js';
import { injectCityStyles } from './styles.js';

export type AppId = 'home' | 'vehicles' | 'jobs' | 'homes' | 'bag' | 'wardrobe' | 'emotes' | 'chat' | 'people' | 'bank' | 'profile' | 'settings';

export interface PhonePerson {
  readonly id: string;
  readonly name: string;
  readonly job: number;
  readonly distance: number;
  readonly avatarUrl: string;
}

export interface PhoneHouse {
  readonly id: number;
  readonly owner: string;
  readonly ownerName: string;
  readonly locked: boolean;
}

export interface PhoneHandlers {
  spawnVehicle(kind: number, paint: number): void;
  clearVehicle(): void;
  lockVehicle(): void;
  setJob(job: JobId): void;
  claimHouse(id: number): void;
  buyHouse(id: number): void;
  leaveHouse(): void;
  lockHouse(locked: boolean): void;
  goHome(): void;
  decorate(): void;
  equip(item: number): void;
  useItem(): void;
  wear(slot: AccessorySlot, id: number): void;
  customize(): void;
  emote(id: number): void;
  say(line: number): void;
  openMap(): void;
  gpsTo(sessionId: string): void;
  invite(): void;
  settings: {
    get(): { music: number; sfx: number; quality: string; names: boolean; sensitivity: number };
    set(key: 'music' | 'sfx' | 'quality' | 'names' | 'sensitivity', value: number | string | boolean): void;
  };
  cancelTask(): void;
  signIn(): void;
}

interface AppMeta {
  readonly id: AppId;
  readonly name: string;
  readonly icon: IconName;
  readonly color: string;
  readonly wide?: boolean;
}

const APPS: readonly AppMeta[] = [
  { id: 'vehicles', name: 'Vehicles', icon: 'car', color: 'linear-gradient(135deg, #2f80ed, #56ccf2)', wide: true },
  { id: 'jobs', name: 'Jobs', icon: 'briefcase', color: 'linear-gradient(135deg, #f2994a, #eb5757)' },
  { id: 'homes', name: 'Homes', icon: 'home', color: 'linear-gradient(135deg, #27ae60, #6fcf97)' },
  { id: 'bag', name: 'Bag', icon: 'bag', color: 'linear-gradient(135deg, #9b51e0, #bb6bd9)' },
  { id: 'wardrobe', name: 'Wardrobe', icon: 'shirt', color: 'linear-gradient(135deg, #ff6f91, #ff9671)' },
  { id: 'emotes', name: 'Emotes', icon: 'dance', color: 'linear-gradient(135deg, #f2c94c, #f2994a)' },
  { id: 'chat', name: 'Quick Chat', icon: 'chat', color: 'linear-gradient(135deg, #2ec4b6, #4dabf7)' },
  { id: 'people', name: 'People', icon: 'users', color: 'linear-gradient(135deg, #5f27cd, #a29bfe)' },
  { id: 'bank', name: 'Bank', icon: 'cash', color: 'linear-gradient(135deg, #11998e, #38ef7d)' },
  { id: 'profile', name: 'Profile', icon: 'user', color: 'linear-gradient(135deg, #485563, #29323c)' },
  { id: 'settings', name: 'Settings', icon: 'gear', color: 'linear-gradient(135deg, #8e9eab, #5f6c7b)' },
];

const VEHICLE_TABS: readonly { id: VehicleDef['category'] | 'all'; name: string; icon: IconName; color: string }[] = [
  { id: 'all', name: 'All vehicles', icon: 'grid', color: 'linear-gradient(135deg, #1e63d6, #3d8bfd)' },
  { id: 'cars', name: 'Cars', icon: 'car', color: 'linear-gradient(135deg, #e8590c, #f76707)' },
  { id: 'boats', name: 'Boats', icon: 'boat', color: 'linear-gradient(135deg, #15aabf, #22b8cf)' },
  { id: 'helicopters', name: 'Helicopters', icon: 'heli', color: 'linear-gradient(135deg, #2fb36b, #40c057)' },
  { id: 'motorcycles', name: 'Bikes', icon: 'moto', color: 'linear-gradient(135deg, #9c36b5, #ae3ec9)' },
  { id: 'airplanes', name: 'Airplanes', icon: 'plane', color: 'linear-gradient(135deg, #e64980, #f06595)' },
  { id: 'utility', name: 'Job', icon: 'truck', color: 'linear-gradient(135deg, #d4a20a, #fab005)' },
];

/**
 * THE PHONE: the player's one menu for everything that is not done in the
 * world - spawn a vehicle, change jobs, move house, hold an item, dress up,
 * emote, chat, find a friend, check the bank. It slides in from the right and
 * leaves the city visible behind it.
 */
export class Phone {
  readonly root: HTMLDivElement;
  private readonly status: HTMLDivElement;
  private readonly clock: HTMLSpanElement;
  private readonly title: HTMLDivElement;
  private readonly headExtra: HTMLDivElement;
  private readonly body: HTMLDivElement;
  private app: AppId = 'home';
  private sub = '';
  private self: SelfState | null = null;
  private people: readonly PhonePerson[] = [];
  private houses: readonly PhoneHouse[] = [];
  private spawnedKind = 0;
  private paints = new Map<number, number>();
  private search = '';
  private wardrobeSlot: AccessorySlot = 'hat';
  private now = 0;
  onOpenChange: ((open: boolean) => void) | null = null;

  constructor(container: HTMLElement, private readonly icons: IconFactory, private readonly handlers: PhoneHandlers) {
    injectCityStyles();
    this.root = el('div', 'ph-phone');
    this.root.hidden = true;
    const screen = el('div', 'ph-phone__screen');
    this.status = el('div', 'ph-phone__status');
    this.clock = el('span', '', '9:41');
    this.status.append(this.clock, el('span', '', 'Palm 5G'));
    const head = el('div', 'ph-phone__head');
    this.title = el('div', 'ph-phone__title', 'Palmhaven');
    this.headExtra = el('div', '');
    this.headExtra.style.display = 'flex';
    this.headExtra.style.gap = '6px';
    head.append(this.title, this.headExtra);
    this.body = el('div', 'ph-phone__body');
    const nav = el('div', 'ph-phone__nav');
    const back = el('button', '');
    back.innerHTML = ICONS.back;
    back.setAttribute('aria-label', 'Back');
    back.addEventListener('click', () => this.back());
    const home = el('button', '');
    home.innerHTML = ICONS.homeSolid;
    home.setAttribute('aria-label', 'Home');
    home.addEventListener('click', () => this.show('home'));
    nav.append(back, home);
    screen.append(this.status, head, this.body, nav);
    this.root.append(screen);
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.root.addEventListener('wheel', (e) => e.stopPropagation());
    container.append(this.root);
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  open(app: AppId = this.app, sub = ''): void {
    this.root.hidden = false;
    this.show(app, sub);
    this.onOpenChange?.(true);
  }

  close(): void {
    if (this.root.hidden) return;
    this.root.hidden = true;
    this.onOpenChange?.(false);
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open('home');
  }

  setState(self: SelfState | null, people: readonly PhonePerson[], houses: readonly PhoneHouse[], spawnedKind: number, clock: string, now: number): void {
    this.self = self;
    this.people = people;
    this.houses = houses;
    this.spawnedKind = spawnedKind;
    this.now = now;
    if (this.clock.textContent !== clock) this.clock.textContent = clock;
  }

  /** Apps whose numbers change by the second (distances, timers). */
  get live(): boolean {
    return this.isOpen && (this.app === 'people' || this.app === 'bank' || this.app === 'jobs' || this.app === 'homes');
  }

  /** Redraw the open app (on a state change). */
  refresh(): void {
    if (this.isOpen && this.app !== 'settings') this.render();
  }

  private back(): void {
    if (this.sub) this.show(this.app, '');
    else if (this.app !== 'home') this.show('home');
    else this.close();
  }

  show(app: AppId, sub = ''): void {
    this.app = app;
    this.sub = sub;
    this.search = '';
    this.render();
    this.body.scrollTop = 0;
  }

  private render(): void {
    const scroll = this.body.scrollTop;
    this.body.replaceChildren();
    this.headExtra.replaceChildren();
    switch (this.app) {
      case 'home':
        this.renderHome();
        break;
      case 'vehicles':
        this.renderVehicles();
        break;
      case 'jobs':
        this.renderJobs();
        break;
      case 'homes':
        this.renderHomes();
        break;
      case 'bag':
        this.renderBag();
        break;
      case 'wardrobe':
        this.renderWardrobe();
        break;
      case 'emotes':
        this.renderEmotes();
        break;
      case 'chat':
        this.renderChat();
        break;
      case 'people':
        this.renderPeople();
        break;
      case 'bank':
        this.renderBank();
        break;
      case 'profile':
        this.renderProfile();
        break;
      case 'settings':
        this.renderSettings();
        break;
    }
    this.body.scrollTop = scroll;
  }

  // -------------------------------------------------------------- home

  private renderHome(): void {
    this.title.textContent = 'Palmhaven';
    const grid = el('div', 'ph-apps');
    const map = this.appTile({ id: 'home', name: 'Map & GPS', icon: 'map', color: 'linear-gradient(135deg, #0ba360, #3cba92)', wide: true });
    map.onclick = () => {
      this.close();
      this.handlers.openMap();
    };
    for (const meta of APPS) {
      const tile = this.appTile(meta);
      tile.onclick = () => this.show(meta.id);
      if (meta.id === 'bank' && this.self?.dailyReady) tile.append(el('span', 'ph-app__badge', 'Bonus!'));
      grid.append(tile);
      if (meta.id === 'vehicles') grid.append(map);
    }
    this.body.append(grid);
  }

  private appTile(meta: AppMeta): HTMLButtonElement {
    const tile = el('button', meta.wide ? 'ph-app ph-app--wide' : 'ph-app');
    tile.style.background = meta.color;
    tile.innerHTML = ICONS[meta.icon];
    tile.append(el('span', 'ph-app__name', meta.name));
    return tile;
  }

  // ---------------------------------------------------------- vehicles

  private renderVehicles(): void {
    this.title.textContent = 'Vehicles';
    const lock = el('button', 'ph-chip', 'Lock');
    lock.style.background = '#2f80ed';
    lock.prepend(this.svg('lock'));
    lock.onclick = () => this.handlers.lockVehicle();
    const clear = el('button', 'ph-chip', 'Clear');
    clear.style.background = '#eb5757';
    clear.prepend(this.svg('trash'));
    clear.onclick = () => this.handlers.clearVehicle();
    this.headExtra.append(lock, clear);
    if (!this.sub) {
      const grid = el('div', 'ph-apps');
      for (const tab of VEHICLE_TABS) {
        const tile = this.appTile({ id: 'vehicles', name: tab.name, icon: tab.icon, color: tab.color, wide: tab.id === 'all' });
        tile.onclick = () => this.show('vehicles', tab.id);
        grid.append(tile);
      }
      this.body.append(grid);
      return;
    }
    const search = el('input', 'ph-search');
    search.placeholder = 'Search';
    search.value = this.search;
    search.oninput = () => {
      this.search = search.value;
      list();
    };
    const tiles = el('div', 'ph-tiles');
    this.body.append(search, tiles);
    const list = (): void => {
      tiles.replaceChildren();
      const self = this.self;
      const job = self?.job ?? 'civilian';
      const defs = VEHICLES.filter((v) => !v.hidden && (this.sub === 'all' || v.category === this.sub) && v.name.toLowerCase().includes(this.search.toLowerCase()));
      defs.sort((a, b) => (owned(b) ? 1 : 0) - (owned(a) ? 1 : 0) || a.price - b.price);
      for (const def of defs) {
        const can = owned(def);
        const tile = el('button', `ph-tile${this.spawnedKind === def.id ? ' ph-tile--on' : ''}${can ? '' : ' ph-tile--locked'}`);
        const paint = this.paints.get(def.id) ?? def.paints[0]!;
        const img = el('img', '');
        img.src = this.icons.vehicle(def.id, paint);
        img.alt = def.name;
        tile.append(img, el('span', 'ph-tile__name', def.name));
        const sub = def.job ? (job === def.job ? 'Job vehicle' : `${jobById(def.job)?.name ?? 'Job'} only`) : def.price === 0 ? 'Free' : can ? 'Owned' : formatMoney(def.price);
        tile.append(el('span', 'ph-tile__sub', sub));
        if (def.price > 0 && !can) tile.append(el('span', 'ph-tile__tag', 'Palm Motors'));
        tile.onclick = () => {
          if (!can) {
            this.show('vehicles', `paint:${def.id}`);
            return;
          }
          if (def.paints.length > 1) this.show('vehicles', `paint:${def.id}`);
          else {
            this.handlers.spawnVehicle(def.id, paint);
            this.close();
          }
        };
        tiles.append(tile);
      }
    };
    const owned = (def: VehicleDef): boolean => {
      if (def.job) return this.self?.job === def.job;
      return def.price === 0 || FREE_VEHICLES.includes(def.id) || (this.self?.vehicles.includes(def.id) ?? false);
    };
    if (this.sub.startsWith('paint:')) {
      search.remove();
      const def = VEHICLES.find((v) => v.id === Number(this.sub.slice(6)));
      if (!def) return;
      const can = owned(def);
      const paint = this.paints.get(def.id) ?? def.paints[0]!;
      const big = el('img', '');
      big.src = this.icons.vehicle(def.id, paint);
      big.style.width = '100%';
      tiles.style.display = 'block';
      tiles.append(big, el('div', 'ph-row__title', def.name), el('div', 'ph-note', def.blurb));
      const swatches = el('div', 'ph-swatches');
      swatches.style.margin = '10px 0';
      for (const color of def.paints) {
        const sw = el('button', `ph-swatch${color === paint ? ' ph-swatch--on' : ''}`);
        sw.style.background = `#${color.toString(16).padStart(6, '0')}`;
        sw.onclick = () => {
          this.paints.set(def.id, color);
          this.render();
        };
        swatches.append(sw);
      }
      tiles.append(swatches);
      const go = el('button', 'ph-btn ph-btn--wide', can ? 'Spawn' : `Buy at Palm Motors (${formatMoney(def.price)})`);
      go.disabled = !can && def.price === 0;
      go.onclick = () => {
        if (can) {
          this.handlers.spawnVehicle(def.id, paint);
          this.close();
        } else {
          this.close();
          this.handlers.openMap();
        }
      };
      tiles.append(go);
      return;
    }
    list();
  }

  // -------------------------------------------------------------- jobs

  private renderJobs(): void {
    this.title.textContent = 'Jobs';
    const current = this.self?.job ?? 'civilian';
    const task = this.self?.task;
    if (task) {
      const row = el('div', 'ph-row');
      row.append(this.rowIcon('briefcase', '#2ec4b6'));
      const main = el('div', 'ph-row__main');
      main.append(el('div', 'ph-row__title', 'Current task'), el('div', 'ph-row__sub', task.label));
      const cancel = el('button', 'ph-btn ph-btn--ghost', 'Drop');
      cancel.onclick = () => this.handlers.cancelTask();
      row.append(main, cancel);
      this.body.append(row);
    }
    if (this.self) {
      const left = Math.max(0, Math.ceil((this.self.paycheckAt - this.now) / 1000));
      const note = el('div', 'ph-note', `Next paycheck in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} (every ${PAYCHECK_SECONDS / 60} min on duty).`);
      note.style.margin = '6px 4px 10px';
      this.body.append(note);
    }
    for (const job of JOBS) {
      const row = el('div', 'ph-row');
      row.style.borderLeft = `6px solid ${job.color}`;
      const main = el('div', 'ph-row__main');
      main.append(el('div', 'ph-row__title', job.name), el('div', 'ph-row__sub', job.blurb));
      const on = job.id === current;
      const pick = el('button', on ? 'ph-btn ph-btn--ghost' : 'ph-btn', on ? 'Current' : job.id === 'civilian' ? 'Clock off' : 'Start');
      pick.disabled = on;
      pick.onclick = () => this.handlers.setJob(job.id);
      row.append(main, pick);
      this.body.append(row);
    }
  }

  // ------------------------------------------------------------- homes

  private renderHomes(): void {
    this.title.textContent = 'Homes';
    const self = this.self;
    const plots = cityPlan().houses;
    const mine = self && self.house >= 0 ? plots[self.house] : undefined;
    if (mine) {
      const state = this.houses[mine.id];
      const card = el('div', 'ph-row');
      card.style.flexDirection = 'column';
      card.style.alignItems = 'stretch';
      card.append(el('div', 'ph-row__title', mine.address), el('div', 'ph-row__sub', `${HOUSE_STYLES[mine.style].name} - your home`));
      const buttons = el('div', '');
      buttons.style.display = 'grid';
      buttons.style.gridTemplateColumns = '1fr 1fr';
      buttons.style.gap = '6px';
      buttons.style.marginTop = '8px';
      const go = el('button', 'ph-btn', 'Go Home');
      go.onclick = () => {
        this.handlers.goHome();
        this.close();
      };
      const deco = el('button', 'ph-btn ph-btn--gold', 'Decorate');
      deco.onclick = () => {
        this.handlers.decorate();
        this.close();
      };
      const lock = el('button', 'ph-btn ph-btn--dark', state?.locked ? 'Unlock Door' : 'Lock Door');
      lock.onclick = () => this.handlers.lockHouse(!state?.locked);
      const leave = el('button', 'ph-btn ph-btn--ghost', 'Move Out');
      leave.onclick = () => this.handlers.leaveHouse();
      buttons.append(go, deco, lock, leave);
      card.append(buttons);
      this.body.append(card);
    }
    const intro = el('div', 'ph-note', mine ? 'Moving takes your furniture with you (per home style).' : 'Pick a free home to move in. Townhouses are free!');
    intro.style.margin = '10px 4px';
    this.body.append(intro);
    for (const style of HOUSE_STYLE_LIST) {
      const owned = style.price === 0 || (self?.houseStyles.includes(style.index) ?? false);
      const header = el('div', 'ph-row__title', `${style.name} - ${style.price === 0 ? 'Free' : owned ? 'Owned' : formatMoney(style.price)}`);
      header.style.margin = '12px 4px 4px';
      this.body.append(header, el('div', 'ph-note', style.blurb));
      for (const plot of plots.filter((p) => p.style === style.id)) {
        const state = this.houses[plot.id];
        const row = el('div', 'ph-row');
        const main = el('div', 'ph-row__main');
        const taken = !!state?.owner;
        main.append(el('div', 'ph-row__title', plot.address), el('div', 'ph-row__sub', taken ? `${visibleName(state!.ownerName)} lives here` : 'Available'));
        row.append(this.rowIcon('home', taken ? '#adb5bd' : owned ? '#27ae60' : '#f2994a'), main);
        if (!taken && plot.id !== self?.house) {
          const act = el('button', owned ? 'ph-btn' : 'ph-btn ph-btn--gold', owned ? 'Move In' : 'Buy');
          act.onclick = () => (owned ? this.handlers.claimHouse(plot.id) : this.handlers.buyHouse(plot.id));
          row.append(act);
        }
        this.body.append(row);
      }
    }
  }

  // --------------------------------------------------------------- bag

  private renderBag(): void {
    this.title.textContent = 'Bag';
    const self = this.self;
    if (!self || self.items.length === 0) {
      this.body.append(el('div', 'ph-note', 'Your bag is empty. Buy snacks, a surfboard, a guitar and more at FreshMart, Sunset Cafe and Palm Burger!'));
      return;
    }
    const tiles = el('div', 'ph-tiles');
    for (const stack of self.items) {
      const item = itemById(stack.id);
      if (!item) continue;
      const on = self.held === item.id;
      const tile = el('button', `ph-tile${on ? ' ph-tile--on' : ''}`);
      const img = el('img', '');
      img.src = this.icons.item(item.id);
      tile.append(img, el('span', 'ph-tile__name', item.name), el('span', 'ph-tile__sub', item.consumable ? `x${stack.count}` : on ? 'Holding' : 'Tap to hold'));
      tile.onclick = () => this.handlers.equip(on ? 0 : item.id);
      tiles.append(tile);
    }
    this.body.append(tiles);
    if (self.held) {
      const use = el('button', 'ph-btn ph-btn--wide', `Use ${itemById(self.held)?.name ?? ''}`);
      use.style.marginTop = '10px';
      use.onclick = () => {
        this.handlers.useItem();
        this.close();
      };
      this.body.append(use);
    }
    void ITEMS;
  }

  // ---------------------------------------------------------- wardrobe

  private renderWardrobe(): void {
    this.title.textContent = 'Wardrobe';
    const self = this.self;
    const avatar = el('button', 'ph-btn ph-btn--wide', 'Customize My Avatar');
    avatar.style.marginBottom = '10px';
    avatar.onclick = () => this.handlers.customize();
    this.body.append(avatar);
    const tabs = el('div', 'ph-window__tabs');
    tabs.style.padding = '0 0 8px';
    for (const slot of ['hat', 'face', 'back'] as const) {
      const tab = el('button', `ph-tab${slot === this.wardrobeSlot ? ' ph-tab--on' : ''}`, slot === 'hat' ? 'Hats' : slot === 'face' ? 'Face' : 'Back');
      tab.onclick = () => {
        this.wardrobeSlot = slot;
        this.render();
      };
      tabs.append(tab);
    }
    this.body.append(tabs);
    const owned = ACCESSORIES.filter((a) => a.slot === this.wardrobeSlot && self?.accessories.includes(a.id));
    if (owned.length === 0) {
      this.body.append(el('div', 'ph-note', 'Nothing here yet. Coastline Threads sells hats, shades, backpacks and more!'));
      return;
    }
    const tiles = el('div', 'ph-tiles');
    const wearing = self?.wearing[this.wardrobeSlot] ?? 0;
    for (const acc of owned) {
      const on = wearing === acc.id;
      const tile = el('button', `ph-tile${on ? ' ph-tile--on' : ''}`);
      const img = el('img', '');
      img.src = this.icons.accessory(acc.id);
      tile.append(img, el('span', 'ph-tile__name', acc.name), el('span', 'ph-tile__sub', on ? 'Wearing' : 'Tap to wear'));
      tile.onclick = () => this.handlers.wear(acc.slot, on ? 0 : acc.id);
      tiles.append(tile);
    }
    this.body.append(tiles);
    void accessoryById;
  }

  // ------------------------------------------------------------ social

  private renderEmotes(): void {
    this.title.textContent = 'Emotes';
    const grid = el('div', 'ph-apps');
    const colors = ['#ff6f91', '#ffb547', '#2ec4b6', '#4dabf7', '#9b5de5', '#3ddc97'];
    EMOTES.forEach((emote, i) => {
      const tile = el('button', 'ph-app');
      tile.style.background = colors[i % colors.length]!;
      tile.style.minHeight = '64px';
      tile.innerHTML = ICONS[i % 3 === 0 ? 'wave' : i % 3 === 1 ? 'dance' : 'smile'];
      tile.append(el('span', 'ph-app__name', emote.name));
      tile.onclick = () => {
        this.handlers.emote(emote.id);
        this.close();
      };
      grid.append(tile);
    });
    this.body.append(grid);
  }

  private renderChat(): void {
    this.title.textContent = 'Quick Chat';
    CHAT_LINES.forEach((line, i) => {
      const row = el('button', 'ph-row');
      row.style.width = '100%';
      row.style.border = 'none';
      row.style.cursor = 'pointer';
      row.style.fontFamily = 'var(--ph-font)';
      row.append(this.rowIcon('chat', '#2ec4b6'), el('div', 'ph-row__title', line));
      row.onclick = () => {
        this.handlers.say(i);
        this.close();
      };
      this.body.append(row);
    });
  }

  private renderPeople(): void {
    this.title.textContent = 'People';
    const invite = el('button', 'ph-btn ph-btn--wide', 'Invite Friends');
    invite.style.marginBottom = '10px';
    invite.onclick = () => this.handlers.invite();
    this.body.append(invite);
    if (this.people.length === 0) {
      this.body.append(el('div', 'ph-note', 'Nobody else is in this server yet. Invite your friends!'));
      return;
    }
    for (const person of [...this.people].sort((a, b) => a.distance - b.distance)) {
      const job = JOBS[person.job] ?? JOBS[0]!;
      const row = el('div', 'ph-row');
      const face = el('img', '');
      face.src = person.avatarUrl || '';
      face.style.width = '40px';
      face.style.height = '40px';
      face.style.borderRadius = '50%';
      face.style.background = '#e6e9f0';
      const main = el('div', 'ph-row__main');
      const sub = el('div', 'ph-row__sub', `${job.name} - ${Math.round(person.distance)}m away`);
      sub.style.color = job.color === '#e8eef7' ? '#6c7488' : job.color;
      main.append(el('div', 'ph-row__title', visibleName(person.name)), sub);
      const gps = el('button', 'ph-btn', 'GPS');
      gps.onclick = () => {
        this.handlers.gpsTo(person.id);
        this.close();
      };
      row.append(face, main, gps);
      this.body.append(row);
    }
  }

  // -------------------------------------------------------- bank & me

  private renderBank(): void {
    this.title.textContent = 'Bank';
    const self = this.self;
    if (!self) return;
    const card = el('div', 'ph-row');
    card.style.flexDirection = 'column';
    card.style.alignItems = 'flex-start';
    card.style.background = 'linear-gradient(135deg, #11998e, #38ef7d)';
    card.style.color = '#fff';
    card.append(el('div', 'ph-row__sub', 'Palmhaven Credit Union'), el('div', 'ph-window__title', formatMoney(self.money)), el('div', 'ph-row__sub', `Lifetime earnings ${formatMoney(self.earned)}`));
    for (const c of card.children) (c as HTMLElement).style.color = '#fff';
    this.body.append(card);
    const daily = el('div', 'ph-note', self.dailyReady ? 'Your daily bonus is ready! Visit any ATM (City Hall, the bank, plazas).' : 'Daily bonus collected. Come back tomorrow!');
    daily.style.margin = '12px 4px';
    this.body.append(daily);
    const left = Math.max(0, Math.ceil((self.paycheckAt - this.now) / 1000));
    this.body.append(el('div', 'ph-stat', ''), this.stat('Next paycheck', `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`), this.stat('Job', jobById(self.job)?.name ?? 'Civilian'));
    this.body.append(el('div', 'ph-note', 'Earn more by working: deliveries, taxi fares, police and medical calls, and serving customers.'));
  }

  private renderProfile(): void {
    this.title.textContent = 'Profile';
    const self = this.self;
    if (!self) return;
    const signin = el('button', 'ph-btn ph-btn--wide', 'Bloxity Account');
    signin.onclick = () => this.handlers.signIn();
    this.body.append(signin);
    const hours = Math.floor(self.playSeconds / 3600);
    const minutes = Math.floor((self.playSeconds % 3600) / 60);
    this.body.append(
      this.stat('Money', formatMoney(self.money)),
      this.stat('Earned', formatMoney(self.earned)),
      this.stat('Time in Palmhaven', `${hours}h ${minutes}m`),
      this.stat('Job', jobById(self.job)?.name ?? 'Civilian'),
      this.stat('Vehicles owned', String(self.vehicles.length)),
      this.stat('Homes owned', String(self.houseStyles.length)),
      this.stat('Parcels delivered', String(self.stats.deliveries)),
      this.stat('Taxi fares', String(self.stats.fares)),
      this.stat('Arrests', String(self.stats.arrests)),
      this.stat('Patients treated', String(self.stats.treated)),
      this.stat('Customers served', String(self.stats.served)),
      this.stat('Fish caught', String(self.stats.fish)),
    );
  }

  private renderSettings(): void {
    this.title.textContent = 'Settings';
    const s = this.handlers.settings.get();
    const slider = (label: string, key: 'music' | 'sfx' | 'sensitivity', value: number, max = 1): void => {
      const row = el('div', 'ph-row');
      row.style.flexDirection = 'column';
      row.style.alignItems = 'stretch';
      const input = el('input', '');
      input.type = 'range';
      input.min = '0';
      input.max = String(max);
      input.step = '0.05';
      input.value = String(value);
      input.oninput = () => this.handlers.settings.set(key, Number(input.value));
      row.append(el('div', 'ph-row__title', label), input);
      this.body.append(row);
    };
    slider('Music & Radio', 'music', s.music);
    slider('Sound Effects', 'sfx', s.sfx);
    slider('Camera Sensitivity', 'sensitivity', s.sensitivity, 2);
    const quality = el('div', 'ph-row');
    quality.append(el('div', 'ph-row__title', 'Graphics'));
    for (const q of ['Low', 'Medium', 'High']) {
      const b = el('button', `ph-tab${s.quality === q ? ' ph-tab--on' : ''}`, q);
      b.onclick = () => {
        this.handlers.settings.set('quality', q);
        this.render();
      };
      quality.append(b);
    }
    this.body.append(quality);
    const names = el('div', 'ph-row');
    const toggle = el('button', `ph-tab${s.names ? ' ph-tab--on' : ''}`, s.names ? 'On' : 'Off');
    toggle.onclick = () => {
      this.handlers.settings.set('names', !s.names);
      this.render();
    };
    names.append(el('div', 'ph-row__title', 'Name tags'), toggle);
    this.body.append(names);
    this.body.append(el('div', 'ph-note', 'Keys: WASD move, SHIFT run, SPACE jump, E interact, F vehicles, P phone, M map, 1-9 hotbar, B emotes, T chat, V camera, L lights, H horn.'));
  }

  // ------------------------------------------------------------ helpers

  private svg(name: IconName): HTMLSpanElement {
    const span = el('span', '');
    span.style.width = '16px';
    span.style.height = '16px';
    span.style.display = 'inline-flex';
    span.innerHTML = ICONS[name];
    return span;
  }

  private rowIcon(name: IconName, color: string): HTMLDivElement {
    const icon = el('div', 'ph-row__icon');
    icon.style.background = color;
    icon.innerHTML = ICONS[name];
    return icon;
  }

  private stat(label: string, value: string): HTMLDivElement {
    const row = el('div', 'ph-stat');
    row.append(el('span', '', label), el('span', '', value));
    return row;
  }

  dispose(): void {
    this.root.remove();
  }
}
