import { fitToViewport, installUiScale, onUiResize } from './scaleUi.js';
import { injectCityStyles } from './styles.js';

const open = new Set<Modal>();

/** True while any window owns the screen: movement and world clicks pause. */
export const anyModalOpen = (): boolean => open.size > 0;

/** Close the most recently opened window (Escape). True if one closed. */
export const closeTopModal = (): boolean => {
  const last = [...open].pop();
  if (!last) return false;
  last.close();
  return true;
};

/**
 * A WINDOW over the game: a transparent shade that swallows clicks, and a
 * box the subclass dresses. Clicking the shade outside the box closes it.
 */
export class Modal {
  readonly shade: HTMLDivElement;
  onClose: (() => void) | null = null;

  private readonly stopResize: () => void;

  constructor(container: HTMLElement, closeOnShade = true) {
    injectCityStyles();
    installUiScale();
    this.shade = document.createElement('div');
    this.shade.className = 'ph-shade ph-font';
    this.shade.hidden = true;
    if (closeOnShade) {
      this.shade.addEventListener('pointerdown', (event) => {
        if (event.target === this.shade) this.close();
      });
    }
    container.appendChild(this.shade);
    // Whatever a window draws, it is fitted to the screen after drawing it - and again on resize.
    const draw = this.refresh.bind(this);
    this.refresh = (): void => {
      draw();
      this.fit();
    };
    this.stopResize = onUiResize(() => this.fit());
  }

  /** Shrink the panel to fit a small window. */
  fit(): void {
    if (!this.isOpen) return;
    const panel = this.shade.firstElementChild as HTMLElement | null;
    if (panel) fitToViewport(panel);
  }

  get isOpen(): boolean {
    return !this.shade.hidden;
  }

  open(): void {
    if (this.isOpen) return;
    this.shade.hidden = false;
    open.add(this);
    this.refresh();
  }

  close(): void {
    if (!this.isOpen) return;
    this.shade.hidden = true;
    open.delete(this);
    this.onClose?.();
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  /** Redraw from current state. Called on open; subclasses call it on change. */
  refresh(): void {}

  dispose(): void {
    this.stopResize();
    open.delete(this);
    this.shade.remove();
  }
}

export const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ''): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  return node;
};

/** A round red close button. */
export const closeButton = (className: string, onClick: () => void, variant = ''): HTMLButtonElement => {
  const button = el('button', `ph-x ${variant} ${className}`);
  button.type = 'button';
  button.setAttribute('aria-label', 'Close');
  button.textContent = '✕';
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    onClick();
  });
  return button;
};
