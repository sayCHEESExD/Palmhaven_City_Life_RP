/**
 * UI SCALE FOR SMALL WINDOWS.
 *
 * The HUD is sized in `--u` (one pixel of a 1920x1080 design), and its pixel
 * floors are multiplied by `--f`, set here: 1 on a normal window, shrinking
 * with a small desktop window so floors never hold one element at a size that
 * pushes it into another. Touch devices keep 1 - their layout has its own
 * rules and a thumb needs its target.
 */

/** The window size the floors were chosen for; below it they shrink in proportion. */
const REFERENCE = { width: 1280, height: 720 } as const;
const MIN_FACTOR = 0.45;

export const floorFactor = (width: number, height: number, touch: boolean): number => {
  if (touch) return 1;
  const fit = Math.min(width / REFERENCE.width, height / REFERENCE.height);
  return Math.round(Math.max(MIN_FACTOR, Math.min(1, fit)) * 1000) / 1000;
};

const listeners = new Set<() => void>();

/** Called on every resize (after --f is updated). */
export const onUiResize = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

let installed = false;

/** Keep --f in step with the window (and with touch mode switching on). Idempotent. */
export const installUiScale = (): void => {
  if (installed) return;
  installed = true;
  const apply = (): void => {
    const touch = document.body.classList.contains('aoe-touch-mode');
    document.documentElement.style.setProperty('--f', String(floorFactor(window.innerWidth, window.innerHeight, touch)));
    for (const listener of listeners) listener();
  };
  apply();
  window.addEventListener('resize', apply);
  window.visualViewport?.addEventListener('resize', apply);
  new MutationObserver(apply).observe(document.body, { attributes: true, attributeFilter: ['class'] });
};

/**
 * Shrink a window's panel to fit the viewport (CSS zoom, so everything in it -
 * text, icons, the close button - shrinks together and nothing spills off
 * screen). A panel that already fits is left at its natural size.
 */
export const fitToViewport = (panel: HTMLElement, margin = 16): void => {
  panel.style.zoom = '';
  const rect = panel.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  const scale = Math.min(1, (window.innerWidth - margin * 2) / rect.width, (window.innerHeight - margin * 2) / rect.height);
  if (scale < 0.995) panel.style.zoom = String(Math.max(0.3, Math.floor(scale * 1000) / 1000));
};

/**
 * Shrink a one-line text's type step by step until it fits its box, down to
 * half its size and never below 7px - and wrap it if even that is too long. Only for elements on screen (it
 * measures): call it after drawing into an open window.
 */
export const fitText = (node: HTMLElement): void => {
  node.style.fontSize = '';
  const base = parseFloat(getComputedStyle(node).fontSize) || 16;
  let size = base;
  for (let i = 0; i < 12 && node.scrollWidth > node.clientWidth + 0.5 && size > Math.max(7, base * 0.5); i += 1) {
    size = Math.max(7, base * 0.5, size * 0.9);
    node.style.fontSize = `${size}px`;
  }
  // Still too long at the smallest size (a tiny window): let it wrap onto a second line rather than cut it.
  node.style.whiteSpace = node.scrollWidth > node.clientWidth + 0.5 ? 'normal' : '';
  node.style.lineHeight = node.style.whiteSpace ? '1.05' : '';
};
