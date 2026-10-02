import { Vector3, type PerspectiveCamera } from 'three';
import { el } from './Modal.js';
import { injectCityStyles } from './styles.js';

export interface PromptSpec {
  /** The key shown in the chip (E, F...). On touch the chip is tapped instead. */
  readonly key: string;
  readonly object: string;
  readonly action: string;
  readonly activate: () => void;
}

const V = new Vector3();

interface PromptNode {
  root: HTMLDivElement;
  key: HTMLSpanElement;
  object: HTMLSpanElement;
  action: HTMLSpanElement;
  activate: (() => void) | null;
}

/**
 * INTERFACE IN THE WORLD, drawn as HTML over the canvas: the interaction
 * chips ("[E] Door / Open", "[F] Vehicle / Drive"), labels over homes and
 * NPCs, quick-chat bubbles, the "+$240" pops, and the beacon on your job
 * target - pinned to the screen's edge when it is behind you. Nodes are pooled
 * and only moved each frame.
 */
export class WorldOverlay {
  private readonly root: HTMLDivElement;
  private readonly promptBox: HTMLDivElement;
  private readonly prompts: PromptNode[] = [];
  private promptCount = 0;
  private readonly labels = new Map<string, { node: HTMLDivElement; signature: string; used: boolean }>();
  private readonly bubbles = new Map<string, { node: HTMLDivElement; until: number; x: number; y: number; z: number; follow: (() => { x: number; y: number; z: number } | null) | null }>();
  private readonly beacon: HTMLDivElement;
  private readonly beaconDot: HTMLDivElement;
  private readonly beaconText: HTMLDivElement;
  private beaconUsed = false;
  private camera: PerspectiveCamera | null = null;
  private width = 1;
  private height = 1;

  constructor(container: HTMLElement) {
    injectCityStyles();
    this.root = el('div', 'ph-world');
    container.appendChild(this.root);
    this.promptBox = el('div', 'ph-prompts');
    this.root.appendChild(this.promptBox);
    for (let i = 0; i < 3; i += 1) {
      const root = el('div', i === 0 ? 'ph-prompt' : 'ph-prompt ph-prompt--alt');
      const key = el('span', 'ph-prompt__key', 'E');
      const text = el('div', 'ph-prompt__text');
      const object = el('span', 'ph-prompt__object');
      const action = el('span', 'ph-prompt__action');
      text.append(object, action);
      root.append(key, text);
      root.hidden = true;
      const node: PromptNode = { root, key, object, action, activate: null };
      root.addEventListener('pointerdown', (event) => {
        event.stopPropagation();
        event.preventDefault();
        node.activate?.();
      });
      this.promptBox.appendChild(root);
      this.prompts.push(node);
    }
    this.beacon = el('div', 'ph-beacon');
    this.beaconDot = el('div', 'ph-beacon__dot');
    this.beaconText = el('div', 'ph-beacon__text');
    this.beacon.append(this.beaconDot, this.beaconText);
    this.beacon.hidden = true;
    this.root.appendChild(this.beacon);
  }

  begin(camera: PerspectiveCamera, width: number, height: number): void {
    this.camera = camera;
    this.width = width;
    this.height = height;
    for (const label of this.labels.values()) label.used = false;
    this.promptCount = 0;
    this.beaconUsed = false;
  }

  /** Screen position of a world point, or null when behind the camera or off screen. */
  project(x: number, y: number, z: number, margin = 80): { x: number; y: number; depth: number } | null {
    const camera = this.camera;
    if (!camera) return null;
    V.set(x, y, z).project(camera);
    if (V.z > 1 || V.z < -1) return null;
    const sx = (V.x * 0.5 + 0.5) * this.width;
    const sy = (-V.y * 0.5 + 0.5) * this.height;
    if (sx < -margin || sy < -margin || sx > this.width + margin || sy > this.height + margin) return null;
    return { x: sx, y: sy, depth: V.z };
  }

  /** Add a prompt chip this frame (the first is the primary, E). Anchored at the first prompt's world point. */
  prompt(spec: PromptSpec, x: number, y: number, z: number, touch: boolean): void {
    if (this.promptCount >= this.prompts.length) return;
    if (this.promptCount === 0) {
      const at = this.project(x, y, z);
      if (!at) return;
      this.promptBox.style.left = `${at.x}px`;
      this.promptBox.style.top = `${at.y}px`;
    }
    const node = this.prompts[this.promptCount]!;
    this.promptCount += 1;
    node.activate = spec.activate;
    const key = touch ? '☝' : spec.key;
    if (node.key.textContent !== key) node.key.textContent = key;
    if (node.object.textContent !== spec.object) node.object.textContent = spec.object;
    if (node.action.textContent !== spec.action) node.action.textContent = spec.action;
    node.root.hidden = false;
  }

  /** Press the prompt bound to a key (E or F). True if there was one. */
  activateKey(key: string): boolean {
    for (let i = 0; i < this.promptCount; i += 1) {
      const node = this.prompts[i]!;
      if (node.key.textContent === key && node.activate) {
        node.activate();
        return true;
      }
    }
    return false;
  }

  /** The first prompt, for a touch USE button. */
  activateFirst(): boolean {
    const node = this.prompts[0];
    if (this.promptCount > 0 && node?.activate) {
      node.activate();
      return true;
    }
    return false;
  }

  get hasPrompt(): boolean {
    return this.promptCount > 0;
  }

  label(id: string, x: number, y: number, z: number, title: string, sub = '', pin = false, color = ''): void {
    const at = this.project(x, y, z);
    if (!at) return;
    let label = this.labels.get(id);
    if (!label) {
      label = { node: el('div', 'ph-label'), signature: '', used: true };
      this.root.appendChild(label.node);
      this.labels.set(id, label);
    }
    label.used = true;
    const signature = `${title}|${sub}|${pin}|${color}`;
    if (signature !== label.signature) {
      label.signature = signature;
      label.node.className = pin ? 'ph-label ph-label--pin' : 'ph-label';
      const t = el('div', 'ph-label__title', title);
      if (color) t.style.color = color;
      label.node.replaceChildren(t, ...(sub ? [el('div', 'ph-label__sub', sub)] : []));
    }
    label.node.hidden = false;
    label.node.style.left = `${at.x}px`;
    label.node.style.top = `${at.y}px`;
    label.node.style.zIndex = String(Math.round((1 - at.depth) * 1000));
  }

  /** A line of speech over someone's head for a few seconds; `follow` keeps it on a moving speaker. */
  say(id: string, text: string, x: number, y: number, z: number, seconds = 4, follow: (() => { x: number; y: number; z: number } | null) | null = null): void {
    let bubble = this.bubbles.get(id);
    if (!bubble) {
      bubble = { node: el('div', 'ph-bubble'), until: 0, x, y, z, follow };
      this.root.appendChild(bubble.node);
      this.bubbles.set(id, bubble);
    }
    bubble.node.textContent = text;
    bubble.until = performance.now() + seconds * 1000;
    bubble.x = x;
    bubble.y = y;
    bubble.z = z;
    bubble.follow = follow;
  }

  /** A rising "+$30" at a world point (or a screen point). */
  pop(text: string, color: string, world: { x: number; y: number; z: number } | null, screen?: { x: number; y: number }): void {
    const at = world ? this.project(world.x, world.y, world.z) : screen ?? null;
    if (!at) return;
    const node = el('div', 'ph-pop', text);
    node.style.color = color;
    node.style.left = `${at.x}px`;
    node.style.top = `${at.y}px`;
    this.root.appendChild(node);
    window.setTimeout(() => node.remove(), 1300);
  }

  /** The job target: a dot on the spot, or pinned to the screen edge when off screen. */
  setBeacon(x: number, y: number, z: number, text: string, color: string): void {
    const camera = this.camera;
    if (!camera) return;
    this.beaconUsed = true;
    V.set(x, y, z).project(camera);
    let sx = (V.x * 0.5 + 0.5) * this.width;
    let sy = (-V.y * 0.5 + 0.5) * this.height;
    const behind = V.z > 1;
    const margin = 48;
    let edge = false;
    if (behind) {
      sx = this.width - sx;
      sy = this.height - margin;
      edge = true;
    }
    if (sx < margin || sx > this.width - margin || sy < margin || sy > this.height - margin) edge = true;
    sx = Math.min(this.width - margin, Math.max(margin, sx));
    sy = Math.min(this.height - margin, Math.max(margin + 40, sy));
    this.beacon.hidden = false;
    this.beacon.className = edge ? 'ph-beacon ph-beacon--edge' : 'ph-beacon';
    this.beacon.style.left = `${sx}px`;
    this.beacon.style.top = `${sy}px`;
    this.beaconDot.style.background = color;
    if (this.beaconText.textContent !== text) this.beaconText.textContent = text;
  }

  end(): void {
    for (const label of this.labels.values()) if (!label.used) label.node.hidden = true;
    for (let i = this.promptCount; i < this.prompts.length; i += 1) {
      const node = this.prompts[i]!;
      node.root.hidden = true;
      node.activate = null;
    }
    if (!this.beaconUsed) this.beacon.hidden = true;
    const now = performance.now();
    for (const [id, bubble] of this.bubbles) {
      if (now > bubble.until) {
        bubble.node.remove();
        this.bubbles.delete(id);
        continue;
      }
      const p = bubble.follow?.() ?? bubble;
      const at = this.project(p.x, p.y, p.z);
      bubble.node.hidden = !at;
      if (at) {
        bubble.node.style.left = `${at.x}px`;
        bubble.node.style.top = `${at.y}px`;
      }
    }
  }

  dispose(): void {
    this.root.remove();
  }
}
