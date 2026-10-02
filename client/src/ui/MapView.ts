import {
  AIRPORT,
  BEACH_X0,
  BLOCKS,
  CAUSEWAY_FILLS,
  ISLAND,
  MAINLAND,
  ROADS,
  WORLD_BOUNDS,
  city,
  footprintOf,
  roadRect,
  type Place,
} from '@palmhaven/shared';
import { ICONS, PLACE_ICON } from './icons.js';
import { Modal, closeButton, el } from './Modal.js';

/** Map pixels per world unit in the painted city image. */
const SCALE = 0.55;

export interface MapMarker {
  readonly x: number;
  readonly z: number;
  readonly color: string;
  readonly kind: 'player' | 'friend' | 'vehicle' | 'task' | 'waypoint' | 'home';
  readonly label?: string;
}

/**
 * THE CITY AS A MAP: painted once into a canvas (land, sand, sea, blocks,
 * white building footprints, grey roads, parks and pools), then cropped and
 * rotated for the round minimap or panned and zoomed in the map window.
 */
export class MapPainter {
  readonly canvas = document.createElement('canvas');
  readonly x0 = WORLD_BOUNDS.x0;
  readonly z0 = WORLD_BOUNDS.z0;

  constructor() {
    const w = Math.ceil((WORLD_BOUNDS.x1 - WORLD_BOUNDS.x0) * SCALE);
    const h = Math.ceil((WORLD_BOUNDS.z1 - WORLD_BOUNDS.z0) * SCALE);
    this.canvas.width = w;
    this.canvas.height = h;
    this.paint();
  }

  /** World -> map pixel. */
  px(x: number): number {
    return (x - this.x0) * SCALE;
  }

  pz(z: number): number {
    return (z - this.z0) * SCALE;
  }

  private rect(ctx: CanvasRenderingContext2D, x0: number, z0: number, x1: number, z1: number, color: string): void {
    ctx.fillStyle = color;
    ctx.fillRect(this.px(x0), this.pz(z0), (x1 - x0) * SCALE, (z1 - z0) * SCALE);
  }

  private rounded(ctx: CanvasRenderingContext2D, r: { x0: number; z0: number; x1: number; z1: number; round: number }, color: string): void {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(this.px(r.x0), this.pz(r.z0), (r.x1 - r.x0) * SCALE, (r.z1 - r.z0) * SCALE, r.round * SCALE);
    ctx.fill();
  }

  private paint(): void {
    const ctx = this.canvas.getContext('2d')!;
    const plan = city().plan;
    ctx.fillStyle = '#76b9de';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    // Shallows glow round the land.
    ctx.shadowColor = '#a8e6ef';
    ctx.shadowBlur = 26;
    this.rounded(ctx, MAINLAND, '#7f9a7c');
    this.rounded(ctx, ISLAND, '#a9b5a6');
    ctx.shadowBlur = 0;
    for (const fill of CAUSEWAY_FILLS) this.rect(ctx, fill.x0, fill.z0, fill.x1, fill.z1, '#8fa38b');
    // The beach.
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(this.px(ISLAND.x0), this.pz(ISLAND.z0), (ISLAND.x1 - ISLAND.x0) * SCALE, (ISLAND.z1 - ISLAND.z0) * SCALE, ISLAND.round * SCALE);
    ctx.clip();
    this.rect(ctx, BEACH_X0, ISLAND.z0, ISLAND.x1, ISLAND.z1, '#f6ecbf');
    ctx.restore();
    // Blocks and lots.
    for (const b of BLOCKS) this.rect(ctx, b.r.x0, b.r.z0, b.r.x1, b.r.z1, '#d9dcd8');
    for (const p of plan.patches) {
      const color =
        p.kind === 'grass' || p.kind === 'garden' || p.kind === 'field'
          ? '#7cbf6e'
          : p.kind === 'pool'
            ? '#4ecbe8'
            : p.kind === 'parking' || p.kind === 'tarmac' || p.kind === 'runway' || p.kind === 'helipad'
              ? '#a3a7ad'
              : p.kind === 'court'
                ? '#5b8fd6'
                : p.kind === 'deck'
                  ? '#c9a06c'
                  : p.kind === 'dirt'
                    ? '#e6cf9c'
                    : '#e8e4da';
      this.rect(ctx, p.x0, p.z0, p.x1, p.z1, color);
    }
    // Roads.
    for (const road of ROADS) {
      const r = roadRect(road);
      this.rect(ctx, r.x0, r.z0, r.x1, r.z1, '#6f737b');
    }
    this.rect(ctx, AIRPORT.runway.x0, AIRPORT.runway.z0, AIRPORT.runway.x1, AIRPORT.runway.z1, '#5a5e66');
    // Docks.
    for (const d of plan.docks) this.rect(ctx, d.x0, d.z0, d.x1, d.z1, d.kind === 'wood' ? '#b98d5a' : '#8c9098');
    // Buildings: white footprints with a soft edge.
    for (const b of plan.buildings) {
      const f = footprintOf(b);
      ctx.fillStyle = b.house !== undefined ? '#fff4e6' : '#ffffff';
      ctx.strokeStyle = 'rgba(80, 90, 100, 0.35)';
      ctx.lineWidth = 1;
      ctx.fillRect(this.px(f.x0), this.pz(f.z0), (f.x1 - f.x0) * SCALE, (f.z1 - f.z0) * SCALE);
      ctx.strokeRect(this.px(f.x0), this.pz(f.z0), (f.x1 - f.x0) * SCALE, (f.z1 - f.z0) * SCALE);
    }
  }
}

const drawPlaceIcon = (ctx: CanvasRenderingContext2D, place: Place, x: number, y: number, r: number, images: Map<string, HTMLImageElement>): void => {
  const meta = PLACE_ICON[place.icon] ?? PLACE_ICON['landmark']!;
  ctx.fillStyle = meta.color;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(1.5, r * 0.22);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  const image = iconImage(meta.icon, images);
  if (image?.complete) ctx.drawImage(image, x - r * 0.62, y - r * 0.62, r * 1.24, r * 1.24);
};

const iconImage = (name: string, images: Map<string, HTMLImageElement>): HTMLImageElement | null => {
  let image = images.get(name);
  if (!image) {
    const markup = (ICONS as Record<string, string>)[name];
    if (!markup) return null;
    image = new Image();
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" color="#ffffff" '))}`;
    images.set(name, image);
  }
  return image;
};

const drawMarker = (ctx: CanvasRenderingContext2D, m: MapMarker, x: number, y: number, s: number): void => {
  ctx.save();
  if (m.kind === 'task' || m.kind === 'waypoint') {
    ctx.fillStyle = m.color;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5 * s;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y - 12 * s, 7 * s, Math.PI * 0.75, Math.PI * 2.25);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (m.kind === 'home') {
    ctx.fillStyle = m.color;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2 * s;
    ctx.beginPath();
    ctx.moveTo(x, y - 8 * s);
    ctx.lineTo(x + 7 * s, y - 1 * s);
    ctx.lineTo(x + 5 * s, y + 6 * s);
    ctx.lineTo(x - 5 * s, y + 6 * s);
    ctx.lineTo(x - 7 * s, y - 1 * s);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.fillStyle = m.color;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2 * s;
    ctx.beginPath();
    ctx.arc(x, y, (m.kind === 'vehicle' ? 4 : 5) * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
};

/** The round minimap: the painted city cropped round the player and turned with the camera. */
export class Minimap {
  readonly root: HTMLDivElement;
  private readonly canvas = document.createElement('canvas');
  private readonly north: HTMLDivElement;
  private readonly images = new Map<string, HTMLImageElement>();
  /** World units from the centre to the rim. */
  private range = 150;

  constructor(private readonly painter: MapPainter, onOpen: () => void) {
    this.root = el('div', 'ph-minimap');
    this.canvas.width = 256;
    this.canvas.height = 256;
    this.north = el('div', 'ph-minimap__north', 'N');
    this.root.append(this.canvas, this.north);
    this.root.addEventListener('click', onOpen);
  }

  setRange(range: number): void {
    this.range = range;
  }

  draw(px: number, pz: number, cameraYaw: number, playerYaw: number, markers: readonly MapMarker[]): void {
    const ctx = this.canvas.getContext('2d')!;
    const size = this.canvas.width;
    const half = size / 2;
    const k = half / this.range;
    ctx.save();
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#76b9de';
    ctx.fillRect(0, 0, size, size);
    ctx.translate(half, half);
    // Camera forward is up the map: forward in the world is (sin yaw, cos yaw).
    const rot = Math.PI + cameraYaw;
    ctx.rotate(rot);
    const scale = k / 0.55;
    ctx.scale(scale, scale);
    ctx.drawImage(this.painter.canvas, -this.painter.px(px), -this.painter.pz(pz));
    ctx.restore();
    const toScreen = (x: number, z: number): { x: number; y: number } => {
      const dx = (x - px) * k;
      const dz = (z - pz) * k;
      const c = Math.cos(rot);
      const s = Math.sin(rot);
      return { x: half + dx * c - dz * s, y: half + dx * s + dz * c };
    };
    for (const place of city().places) {
      if (!place.listed) continue;
      const at = toScreen(place.x, place.z);
      if (Math.hypot(at.x - half, at.y - half) > half - 10) continue;
      drawPlaceIcon(ctx, place, at.x, at.y, 9, this.images);
    }
    for (const m of markers) {
      let at = toScreen(m.x, m.z);
      const d = Math.hypot(at.x - half, at.y - half);
      if (d > half - 12) {
        if (m.kind !== 'task' && m.kind !== 'waypoint' && m.kind !== 'home') continue;
        at = { x: half + ((at.x - half) / d) * (half - 14), y: half + ((at.y - half) / d) * (half - 14) };
      }
      drawMarker(ctx, m, at.x, at.y, 1.1);
    }
    // The player arrow at the centre, pointing where they face.
    ctx.save();
    ctx.translate(half, half);
    ctx.rotate(rot + Math.PI - playerYaw);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#1d2433';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, -14);
    ctx.lineTo(10, 11);
    ctx.lineTo(0, 5);
    ctx.lineTo(-10, 11);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
    ctx.restore();
    // North on the rim.
    const n = toScreen(px, pz - 10000);
    const nd = Math.hypot(n.x - half, n.y - half) || 1;
    const rim = 0.86;
    this.north.style.left = `${50 + ((n.x - half) / nd) * 50 * rim}%`;
    this.north.style.top = `${50 + ((n.y - half) / nd) * 50 * rim}%`;
  }
}

/** The full map: pan, zoom, every place, set a GPS waypoint or travel there. */
export class MapWindow extends Modal {
  private readonly canvas = document.createElement('canvas');
  private readonly side: HTMLDivElement;
  private readonly actions: HTMLDivElement;
  private readonly images = new Map<string, HTMLImageElement>();
  private zoom = 1;
  private cx = 0;
  private cz = 0;
  private markers: readonly MapMarker[] = [];
  private player = { x: 0, z: 0 };
  private selected: { x: number; z: number; name: string; place?: Place } | null = null;
  private drag: { x: number; y: number; cx: number; cz: number; moved: boolean } | null = null;

  constructor(
    container: HTMLElement,
    private readonly painter: MapPainter,
    private readonly handlers: { waypoint: (x: number, z: number, name: string) => void; travel: (placeId: string) => void; travelHome: () => void },
  ) {
    super(container);
    const win = el('div', 'ph-window ph-mapwin');
    win.style.setProperty('--ph-accent', '#3a86ff');
    const head = el('div', 'ph-window__head');
    head.append(el('div', 'ph-window__title', 'Palmhaven'), el('div', 'ph-window__sub', 'Tap a place to set your GPS'));
    const spacer = el('div', '');
    spacer.style.flex = '1';
    head.append(spacer, closeButton('', () => this.close()));
    const body = el('div', 'ph-window__body');
    const map = el('div', 'ph-map__canvas');
    map.append(this.canvas);
    this.actions = el('div', 'ph-map__actions');
    this.actions.hidden = true;
    map.append(this.actions);
    this.side = el('div', 'ph-map__side');
    body.append(map, this.side);
    win.append(head, body);
    this.shade.append(win);

    map.addEventListener('wheel', (event) => {
      event.preventDefault();
      this.zoom = Math.min(5, Math.max(0.6, this.zoom * (event.deltaY > 0 ? 0.88 : 1.14)));
      this.draw();
    }, { passive: false });
    map.addEventListener('pointerdown', (event) => {
      this.drag = { x: event.clientX, y: event.clientY, cx: this.cx, cz: this.cz, moved: false };
      map.setPointerCapture(event.pointerId);
    });
    map.addEventListener('pointermove', (event) => {
      if (!this.drag) return;
      const scale = this.pixelsPerUnit();
      const dx = event.clientX - this.drag.x;
      const dy = event.clientY - this.drag.y;
      if (Math.hypot(dx, dy) > 5) this.drag.moved = true;
      this.cx = this.drag.cx - dx / scale;
      this.cz = this.drag.cz - dy / scale;
      this.draw();
    });
    map.addEventListener('pointerup', (event) => {
      const drag = this.drag;
      this.drag = null;
      if (!drag || drag.moved) return;
      const rect = this.canvas.getBoundingClientRect();
      const scale = this.pixelsPerUnit();
      const wx = this.cx + (event.clientX - rect.left - rect.width / 2) / scale;
      const wz = this.cz + (event.clientY - rect.top - rect.height / 2) / scale;
      const near = city().places.find((p) => p.listed && Math.hypot(p.x - wx, p.z - wz) < 26 / Math.max(0.5, this.zoom));
      this.select(near ? { x: near.x, z: near.z, name: near.name, place: near } : { x: wx, z: wz, name: 'Dropped pin' });
    });
    this.buildList();
  }

  private pixelsPerUnit(): number {
    const rect = this.canvas.getBoundingClientRect();
    const fit = Math.min(rect.width / 1200, rect.height / 1100);
    return fit * this.zoom;
  }

  private buildList(): void {
    this.side.replaceChildren();
    const home = el('div', 'ph-map__place');
    home.innerHTML = ICONS.home;
    (home.firstElementChild as HTMLElement).style.background = '#ff9f43';
    home.append(el('span', '', 'My Home'));
    home.addEventListener('click', () => this.handlers.travelHome());
    this.side.append(home);
    for (const place of city().places) {
      if (!place.listed) continue;
      const row = el('div', 'ph-map__place');
      const meta = PLACE_ICON[place.icon] ?? PLACE_ICON['landmark']!;
      row.innerHTML = ICONS[meta.icon];
      (row.firstElementChild as HTMLElement).style.background = meta.color;
      row.append(el('span', '', place.name));
      row.addEventListener('click', () => {
        this.cx = place.x;
        this.cz = place.z;
        this.zoom = Math.max(this.zoom, 2);
        this.select({ x: place.x, z: place.z, name: place.name, place });
      });
      this.side.append(row);
    }
  }

  private select(target: { x: number; z: number; name: string; place?: Place }): void {
    this.selected = target;
    this.actions.hidden = false;
    this.actions.replaceChildren(el('span', '', target.name));
    const gps = el('button', 'ph-btn', 'Set GPS');
    gps.addEventListener('click', () => {
      this.handlers.waypoint(target.x, target.z, target.name);
      this.close();
    });
    this.actions.append(gps);
    if (target.place) {
      const go = el('button', 'ph-btn ph-btn--coral', 'Travel');
      go.addEventListener('click', () => {
        this.handlers.travel(target.place!.id);
        this.close();
      });
      this.actions.append(go);
    }
    this.draw();
  }

  setState(player: { x: number; z: number }, markers: readonly MapMarker[]): void {
    this.player = player;
    this.markers = markers;
    if (this.isOpen) this.draw();
  }

  override open(): void {
    this.cx = this.player.x;
    this.cz = this.player.z;
    this.zoom = 1.6;
    this.selected = null;
    this.actions.hidden = true;
    super.open();
    requestAnimationFrame(() => this.draw());
  }

  override refresh(): void {
    this.draw();
  }

  private draw(): void {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 2) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    const ctx = this.canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#76b9de';
    ctx.fillRect(0, 0, rect.width, rect.height);
    const scale = this.pixelsPerUnit();
    const ox = rect.width / 2 - this.cx * scale;
    const oz = rect.height / 2 - this.cz * scale;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.painter.canvas, ox + this.painter.x0 * scale, oz + this.painter.z0 * scale, this.painter.canvas.width * (scale / SCALE), this.painter.canvas.height * (scale / SCALE));
    const sx = (x: number): number => ox + x * scale;
    const sz = (z: number): number => oz + z * scale;
    ctx.font = '600 12px "Fredoka", sans-serif';
    ctx.textAlign = 'center';
    for (const place of city().places) {
      if (!place.listed) continue;
      drawPlaceIcon(ctx, place, sx(place.x), sz(place.z), 11, this.images);
      if (this.zoom > 1.3) {
        ctx.fillStyle = '#1d2433';
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 3;
        ctx.strokeText(place.name, sx(place.x), sz(place.z) + 24);
        ctx.fillText(place.name, sx(place.x), sz(place.z) + 24);
      }
    }
    for (const m of this.markers) drawMarker(ctx, m, sx(m.x), sz(m.z), 1.3);
    if (this.selected) drawMarker(ctx, { x: this.selected.x, z: this.selected.z, color: '#ff4f8b', kind: 'waypoint' }, sx(this.selected.x), sz(this.selected.z), 1.6);
    // You.
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#1d2433';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(sx(this.player.x), sz(this.player.z), 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fill();
  }
}
