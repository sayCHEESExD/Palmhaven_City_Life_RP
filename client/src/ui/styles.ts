import { injectHudStyles } from './hudStyles.js';

/**
 * THE PALMHAVEN UI, one stylesheet, injected once.
 *
 * Minimal and city-like (the reference screenshots): small round dark icon
 * buttons top-left, a round minimap top-right with the wallet under it, a
 * white smartphone that slides in from the right with colourful apps, a
 * slim hotbar, world-anchored key prompts, and a vehicle row of round
 * buttons with their key under each. Nothing big covers the city.
 *
 * Sizes are multiples of `--u` (one pixel of a 1920x1080 layout, set in
 * hudStyles) with pixel floors scaled by `--f`.
 */
let injected = false;

export const injectCityStyles = (): void => {
  if (injected) return;
  injected = true;
  injectHudStyles();
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
};

/** Kept for files that still import the old name. */
export const injectGardenStyles = injectCityStyles;

const S = (px: number, floor: number): string => `max(calc(${floor}px * var(--f)), calc(${px} * var(--u)))`;

const CSS = `
:root {
  --ph-font: "Fredoka", "Nunito", "Segoe UI", system-ui, sans-serif;
  --ph-title: "Grandstander", "Fredoka", system-ui, sans-serif;
  --ph-dark: rgba(18, 22, 34, 0.78);
  --ph-dark-solid: #161b29;
  --ph-line: rgba(255, 255, 255, 0.16);
  --ph-teal: #2ec4b6;
  --ph-coral: #ff6f91;
  --ph-sun: #ffd166;
  --ph-sky: #4dabf7;
  --ph-mint: #3ddc97;
  --ph-ink: #1d2433;
  --ph-top: max(${S(14, 8)}, calc(var(--aoe-portal-top, 0px) + 6px), env(safe-area-inset-top, 0px));
  --ph-side: max(${S(16, 8)}, env(safe-area-inset-left, 0px));
  --ph-right: max(${S(16, 8)}, env(safe-area-inset-right, 0px));
  --ph-bottom: max(${S(14, 8)}, env(safe-area-inset-bottom, 0px));
}
.ph-font, .ph-font * { font-family: var(--ph-font); }
.ph-hud { position: fixed; inset: 0; pointer-events: none; z-index: 20; user-select: none; font-family: var(--ph-font); color: #fff; }
.ph-hud > * { pointer-events: auto; }
.ph-hud [hidden], .ph-world [hidden], .ph-hidden { display: none !important; }
.ph-shadow { text-shadow: 0 1px 2px rgba(0, 0, 0, 0.55); }

/* ------------------------------------------------------- top-left icon bar */
.ph-iconbar { position: fixed; top: var(--ph-top); left: 50%; transform: translateX(-50%); display: flex; gap: ${S(10, 6)}; }
.ph-iconbtn {
  position: relative; width: ${S(50, 36)}; height: ${S(50, 36)}; border-radius: 50%;
  border: none; background: var(--ph-dark); color: #fff; display: grid; place-items: center; cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25); transition: transform 120ms ease, background 120ms ease;
}
.ph-iconbtn svg { width: 56%; height: 56%; }
.ph-iconbtn:hover { transform: scale(1.08); background: rgba(30, 36, 54, 0.92); }
.ph-iconbtn--on { background: var(--ph-teal); }
.ph-iconbtn__tip {
  position: absolute; top: 112%; left: 50%; transform: translateX(-50%); white-space: nowrap; pointer-events: none;
  background: var(--ph-dark-solid); padding: 3px 8px; border-radius: 8px; font-size: ${S(13, 10)}; font-weight: 600; opacity: 0; transition: opacity 120ms;
}
.ph-iconbtn:hover .ph-iconbtn__tip { opacity: 1; }
.ph-iconbtn__dot { position: absolute; top: 4%; right: 4%; width: 26%; height: 26%; border-radius: 50%; background: var(--ph-coral); border: 2px solid #fff; }

/* --------------------------------------------------------- top-right block */
.ph-corner { position: fixed; top: calc(var(--ph-top) + ${S(56, 40)}); right: var(--ph-right); display: flex; flex-direction: column; align-items: flex-end; gap: ${S(8, 5)}; }
.ph-minimap { position: relative; width: ${S(200, 112)}; height: ${S(200, 112)}; border-radius: 50%; overflow: hidden; border: ${S(4, 3)} solid #ffb3c1; box-shadow: 0 4px 14px rgba(0, 0, 0, 0.3); background: #6fb6dd; cursor: pointer; }
.ph-minimap canvas { width: 100%; height: 100%; display: block; }
.ph-minimap__north { position: absolute; width: ${S(22, 16)}; height: ${S(22, 16)}; border-radius: 50%; background: #10131c; color: #fff; font-size: ${S(12, 9)}; font-weight: 700; display: grid; place-items: center; transform: translate(-50%, -50%); }
.ph-minimap__mapbtn { position: absolute; right: -2%; top: -2%; }
.ph-mapbtn { width: ${S(42, 30)}; height: ${S(42, 30)}; }
.ph-wallet { display: flex; gap: ${S(8, 5)}; align-items: center; }
.ph-pill { display: inline-flex; align-items: center; gap: ${S(6, 4)}; background: var(--ph-dark); border-radius: 999px; padding: ${S(6, 4)} ${S(14, 9)}; font-weight: 700; font-size: ${S(19, 13)}; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.22); }
.ph-money { color: #8dffb2; letter-spacing: 0.02em; }
.ph-money__icon { width: ${S(22, 15)}; height: ${S(22, 15)}; border-radius: 50%; background: #2fbf71; color: #fff; display: grid; place-items: center; font-size: ${S(14, 10)}; }
.ph-money--bump { animation: ph-bump 420ms ease; }
@keyframes ph-bump { 0% { transform: scale(1); } 40% { transform: scale(1.12); } 100% { transform: scale(1); } }
.ph-clock { font-size: ${S(16, 11)}; color: #ffe8a8; }
.ph-jobpill { font-size: ${S(15, 11)}; }
.ph-jobpill__dot { width: ${S(10, 7)}; height: ${S(10, 7)}; border-radius: 50%; }

/* ---------------------------------------------------------- phone button */
.ph-phonebtn {
  position: fixed; right: var(--ph-right); top: 50%; transform: translateY(-50%); width: ${S(76, 52)}; height: ${S(76, 52)};
  border: none; background: none; cursor: pointer; filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.35)); transition: transform 140ms;
}
.ph-phonebtn:hover { transform: translateY(-50%) scale(1.08) rotate(-4deg); }
.ph-phonebtn svg { width: 100%; height: 100%; }
.ph-phonebtn__badge { position: absolute; top: 2%; right: 4%; min-width: ${S(22, 15)}; height: ${S(22, 15)}; border-radius: 999px; background: var(--ph-coral); color: #fff; font-size: ${S(13, 9)}; font-weight: 700; display: grid; place-items: center; padding: 0 4px; }

/* -------------------------------------------------------------- hotbar */
.ph-hotbar { position: fixed; left: 50%; bottom: var(--ph-bottom); transform: translateX(-50%); display: flex; gap: ${S(8, 5)}; }
.ph-slot {
  position: relative; width: ${S(70, 46)}; height: ${S(70, 46)}; border-radius: ${S(12, 8)}; background: rgba(150, 156, 170, 0.62);
  border: ${S(3, 2)} solid rgba(255, 255, 255, 0.0); cursor: pointer; display: grid; place-items: center; padding: 0; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
}
.ph-slot img { width: 82%; height: 82%; object-fit: contain; pointer-events: none; }
.ph-slot--on { border-color: #ffffff; background: rgba(90, 160, 220, 0.8); }
.ph-slot__key { position: absolute; left: 0; bottom: 0; background: rgba(20, 22, 30, 0.85); color: #fff; font-size: ${S(14, 10)}; font-weight: 700; padding: 0 ${S(6, 4)}; border-radius: 0 ${S(8, 5)} 0 ${S(10, 6)}; }
.ph-slot__count { position: absolute; right: ${S(4, 3)}; top: ${S(2, 1)}; font-size: ${S(13, 9)}; font-weight: 700; text-shadow: 0 1px 2px #000; }
.ph-slot__use { position: absolute; top: -34%; left: 50%; transform: translateX(-50%); white-space: nowrap; background: #ff5d5d; color: #fff; border: none; border-radius: ${S(8, 5)}; font-weight: 700; font-size: ${S(13, 10)}; padding: ${S(3, 2)} ${S(10, 6)}; cursor: pointer; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3); font-family: var(--ph-font); }

/* --------------------------------------------------------- task card */
.ph-task {
  position: fixed; left: var(--ph-side); bottom: calc(var(--ph-bottom) + ${S(10, 6)}); max-width: ${S(400, 230)};
  background: var(--ph-dark); border-radius: ${S(16, 10)}; padding: ${S(12, 8)} ${S(16, 10)}; border-left: ${S(6, 4)} solid var(--ph-teal);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
}
.ph-task__head { display: flex; align-items: center; gap: ${S(8, 5)}; font-size: ${S(14, 10)}; text-transform: uppercase; letter-spacing: 0.08em; opacity: 0.85; font-weight: 700; }
.ph-task__text { font-size: ${S(19, 13)}; font-weight: 600; margin-top: ${S(4, 2)}; line-height: 1.2; }
.ph-task__meta { display: flex; justify-content: space-between; gap: ${S(10, 6)}; margin-top: ${S(6, 4)}; font-size: ${S(15, 11)}; color: #ffe8a8; font-weight: 700; }
.ph-task__order { display: flex; gap: ${S(6, 4)}; margin-top: ${S(6, 4)}; flex-wrap: wrap; }
.ph-task__chip { background: rgba(255, 255, 255, 0.14); border-radius: 999px; padding: ${S(3, 2)} ${S(10, 6)}; font-size: ${S(14, 10)}; font-weight: 600; }
.ph-task__chip--done { background: var(--ph-mint); color: #0d2b1e; }
.ph-task__x { margin-left: auto; background: none; border: none; color: #fff; opacity: 0.6; cursor: pointer; font-size: ${S(16, 12)}; }

/* -------------------------------------------------------------- toasts */
.ph-toasts { position: fixed; top: calc(var(--ph-top) + ${S(78, 52)}); left: 50%; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: ${S(6, 4)}; pointer-events: none !important; z-index: 40; }
.ph-toast { background: var(--ph-dark-solid); color: #fff; padding: ${S(8, 6)} ${S(18, 12)}; border-radius: 999px; font-weight: 600; font-size: ${S(18, 12)}; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3); animation: ph-toast 3.2s ease forwards; text-align: center; max-width: 80vw; }
.ph-toast--good { background: linear-gradient(90deg, #1f9e64, #2ec4b6); }
.ph-toast--bad { background: linear-gradient(90deg, #d9364f, #ff6f61); }
.ph-toast--gold { background: linear-gradient(90deg, #f0a500, #ffd166); color: #2a1d00; }
@keyframes ph-toast { 0% { opacity: 0; transform: translateY(-8px) scale(0.96); } 8% { opacity: 1; transform: none; } 85% { opacity: 1; } 100% { opacity: 0; transform: translateY(-6px); } }
.ph-banner { position: fixed; top: 30%; left: 50%; transform: translate(-50%, -50%); font-family: var(--ph-title); font-size: ${S(54, 30)}; color: #fff; text-shadow: 0 4px 0 #ff4f8b, 0 8px 18px rgba(0, 0, 0, 0.35); pointer-events: none; animation: ph-banner 2.6s ease forwards; white-space: nowrap; }
@keyframes ph-banner { 0% { opacity: 0; transform: translate(-50%, -40%) scale(0.8); } 12% { opacity: 1; transform: translate(-50%, -50%) scale(1.05); } 20% { transform: translate(-50%, -50%) scale(1); } 80% { opacity: 1; } 100% { opacity: 0; } }

/* ------------------------------------------------------- world overlay */
.ph-world { position: fixed; inset: 0; pointer-events: none; z-index: 15; font-family: var(--ph-font); }
.ph-prompts { position: absolute; transform: translate(-50%, -100%); display: flex; flex-direction: column; gap: ${S(6, 4)}; pointer-events: auto; }
.ph-prompt { display: flex; align-items: stretch; border-radius: ${S(8, 6)}; overflow: hidden; box-shadow: 0 3px 10px rgba(0, 0, 0, 0.3); cursor: pointer; transition: transform 100ms; }
.ph-prompt:hover { transform: scale(1.04); }
.ph-prompt__key { background: #3a3f8f; color: #fff; font-weight: 700; font-size: ${S(22, 15)}; min-width: ${S(40, 28)}; display: grid; place-items: center; padding: 0 ${S(8, 5)}; }
.ph-prompt__text { background: #ffffff; color: var(--ph-ink); padding: ${S(4, 3)} ${S(12, 8)}; display: flex; flex-direction: column; justify-content: center; min-width: ${S(90, 60)}; }
.ph-prompt__object { font-size: ${S(13, 9)}; color: #7b8496; font-weight: 600; line-height: 1.1; }
.ph-prompt__action { font-size: ${S(18, 12)}; font-weight: 700; line-height: 1.1; }
.ph-prompt--alt .ph-prompt__key { background: #1d6f6a; }
.ph-hold { position: absolute; left: 0; bottom: 0; height: 3px; background: var(--ph-teal); }
.ph-label { position: absolute; transform: translate(-50%, -100%); text-align: center; white-space: nowrap; }
.ph-label__title { font-weight: 700; font-size: ${S(18, 12)}; text-shadow: 0 2px 3px rgba(0, 0, 0, 0.7); color: #fff; }
.ph-label__sub { font-weight: 600; font-size: ${S(14, 10)}; text-shadow: 0 1px 3px rgba(0, 0, 0, 0.7); color: #ffe8a8; }
.ph-label--pin .ph-label__title { background: var(--ph-dark); padding: 2px 10px; border-radius: 999px; text-shadow: none; }
.ph-bubble { position: absolute; transform: translate(-50%, -100%); background: #fff; color: var(--ph-ink); font-weight: 600; font-size: ${S(17, 12)}; padding: ${S(6, 4)} ${S(12, 8)}; border-radius: ${S(14, 10)}; box-shadow: 0 3px 8px rgba(0, 0, 0, 0.25); max-width: ${S(320, 200)}; text-align: center; }
.ph-bubble::after { content: ""; position: absolute; left: 50%; bottom: -7px; transform: translateX(-50%); border: 7px solid transparent; border-top-color: #fff; border-bottom: 0; }
.ph-pop { position: absolute; transform: translate(-50%, -50%); font-weight: 700; font-size: ${S(30, 18)}; animation: ph-pop 1.3s ease-out forwards; text-shadow: 0 2px 0 rgba(0, 0, 0, 0.45); }
@keyframes ph-pop { 0% { opacity: 0; transform: translate(-50%, -20%) scale(0.7); } 15% { opacity: 1; transform: translate(-50%, -50%) scale(1.1); } 100% { opacity: 0; transform: translate(-50%, -160%) scale(1); } }
.ph-beacon { position: absolute; transform: translate(-50%, -50%); display: flex; flex-direction: column; align-items: center; gap: 2px; }
.ph-beacon__dot { width: ${S(26, 18)}; height: ${S(26, 18)}; border-radius: 50%; border: 3px solid #fff; box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.25), 0 0 14px rgba(255, 255, 255, 0.6); }
.ph-beacon__text { font-size: ${S(14, 10)}; font-weight: 700; background: var(--ph-dark); padding: 1px 8px; border-radius: 999px; }
.ph-beacon--edge .ph-beacon__dot { animation: ph-pulse 1.2s ease-in-out infinite; }
@keyframes ph-pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.18); } }

/* -------------------------------------------------------------- windows */
.ph-shade { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; background: rgba(8, 12, 22, 0.28); font-family: var(--ph-font); }
.ph-shade[hidden] { display: none; }
.ph-window {
  width: min(92vw, ${S(980, 480)}); max-height: 86vh; display: flex; flex-direction: column; background: #f7f8fb; color: var(--ph-ink);
  border-radius: ${S(22, 14)}; box-shadow: 0 18px 50px rgba(0, 0, 0, 0.35); overflow: hidden;
}
.ph-window--narrow { width: min(92vw, ${S(560, 320)}); }
.ph-window__head { display: flex; align-items: center; gap: ${S(12, 8)}; padding: ${S(16, 10)} ${S(20, 12)}; color: #fff; background: linear-gradient(90deg, var(--ph-accent, #2ec4b6), color-mix(in srgb, var(--ph-accent, #2ec4b6) 60%, #ff6f91)); }
.ph-window__title { font-family: var(--ph-title); font-size: ${S(30, 19)}; font-weight: 800; letter-spacing: 0.01em; text-shadow: 0 2px 0 rgba(0, 0, 0, 0.18); }
.ph-window__sub { font-size: ${S(15, 11)}; opacity: 0.92; font-weight: 600; }
.ph-window__money { margin-left: auto; background: rgba(0, 0, 0, 0.22); border-radius: 999px; padding: ${S(5, 3)} ${S(14, 9)}; font-weight: 700; font-size: ${S(17, 12)}; }
.ph-x { width: ${S(38, 28)}; height: ${S(38, 28)}; border-radius: 50%; border: none; background: rgba(0, 0, 0, 0.22); color: #fff; font-size: ${S(18, 13)}; cursor: pointer; flex: none; margin-left: ${S(6, 4)}; }
.ph-x:hover { background: rgba(0, 0, 0, 0.38); }
.ph-window__tabs { display: flex; gap: ${S(6, 4)}; padding: ${S(10, 6)} ${S(16, 10)} 0; flex-wrap: wrap; }
.ph-tab { border: none; border-radius: 999px; padding: ${S(7, 5)} ${S(16, 10)}; background: #e6e9f0; color: var(--ph-ink); font-weight: 700; font-size: ${S(15, 11)}; cursor: pointer; font-family: var(--ph-font); }
.ph-tab--on { background: var(--ph-accent, #2ec4b6); color: #fff; }
.ph-window__body { padding: ${S(16, 10)} ${S(18, 12)}; overflow-y: auto; }
.ph-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(${S(160, 104)}, 1fr)); gap: ${S(12, 8)}; }
.ph-card { background: #fff; border-radius: ${S(16, 10)}; padding: ${S(10, 6)}; display: flex; flex-direction: column; align-items: center; gap: ${S(4, 2)}; box-shadow: 0 2px 8px rgba(20, 30, 60, 0.08); border: 2px solid transparent; cursor: pointer; transition: transform 110ms, border-color 110ms; text-align: center; }
.ph-card:hover { transform: translateY(-2px); border-color: var(--ph-accent, #2ec4b6); }
.ph-card--owned { background: #eefbf5; }
.ph-card--locked { opacity: 0.65; }
.ph-card img { width: ${S(104, 66)}; height: ${S(104, 66)}; object-fit: contain; }
.ph-card__name { font-weight: 700; font-size: ${S(16, 11)}; line-height: 1.15; }
.ph-card__sub { font-size: ${S(13, 9)}; color: #6c7488; font-weight: 600; line-height: 1.2; }
.ph-card__price { font-weight: 700; font-size: ${S(16, 11)}; color: #1f9e64; }
.ph-btn { border: none; border-radius: 999px; padding: ${S(8, 6)} ${S(18, 12)}; font-weight: 700; font-size: ${S(16, 11)}; color: #fff; background: var(--ph-accent, #2ec4b6); cursor: pointer; font-family: var(--ph-font); box-shadow: 0 3px 0 rgba(0, 0, 0, 0.15); }
.ph-btn:hover { filter: brightness(1.06); }
.ph-btn:disabled { opacity: 0.45; cursor: default; }
.ph-btn--ghost { background: #e6e9f0; color: var(--ph-ink); }
.ph-btn--coral { background: var(--ph-coral); }
.ph-btn--gold { background: linear-gradient(180deg, #ffd166, #f4a300); color: #3a2600; }
.ph-btn--dark { background: var(--ph-dark-solid); }
.ph-btn--wide { width: 100%; }
.ph-row { display: flex; align-items: center; gap: ${S(12, 8)}; padding: ${S(10, 6)} ${S(12, 8)}; background: #fff; border-radius: ${S(14, 9)}; box-shadow: 0 2px 8px rgba(20, 30, 60, 0.07); }
.ph-row + .ph-row { margin-top: ${S(8, 5)}; }
.ph-row__icon { width: ${S(46, 30)}; height: ${S(46, 30)}; border-radius: ${S(12, 8)}; display: grid; place-items: center; color: #fff; flex: none; }
.ph-row__icon svg { width: 60%; height: 60%; }
.ph-row__main { flex: 1; min-width: 0; }
.ph-row__title { font-weight: 700; font-size: ${S(17, 12)}; }
.ph-row__sub { font-size: ${S(14, 10)}; color: #6c7488; font-weight: 600; }
.ph-swatches { display: flex; gap: ${S(6, 4)}; flex-wrap: wrap; justify-content: center; }
.ph-swatch { width: ${S(26, 18)}; height: ${S(26, 18)}; border-radius: 50%; border: 3px solid #fff; box-shadow: 0 0 0 2px #cfd5e0; cursor: pointer; }
.ph-swatch--on { box-shadow: 0 0 0 3px var(--ph-ink); }
.ph-note { font-size: ${S(14, 10)}; color: #6c7488; font-weight: 600; }
.ph-stat { display: flex; justify-content: space-between; padding: ${S(6, 4)} 0; border-bottom: 1px solid #e6e9f0; font-weight: 600; font-size: ${S(16, 11)}; }

/* ------------------------------------------------------------- the phone */
.ph-phone {
  position: fixed; z-index: 45; right: calc(var(--ph-right) + ${S(10, 6)}); top: 50%; transform: translateY(-50%);
  width: ${S(440, 270)}; height: min(${S(860, 520)}, 92vh); background: #0f1118; border-radius: ${S(54, 34)}; padding: ${S(14, 9)};
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.45), inset 0 0 0 2px #3a3f50; font-family: var(--ph-font); animation: ph-phone-in 220ms ease;
}
.ph-phone[hidden] { display: none; }
@keyframes ph-phone-in { 0% { transform: translate(40%, -50%); opacity: 0; } 100% { transform: translateY(-50%); opacity: 1; } }
.ph-phone__screen { color-scheme: light; width: 100%; height: 100%; background: #ffffff; border-radius: ${S(42, 26)}; overflow: hidden; display: flex; flex-direction: column; color: var(--ph-ink); }
.ph-phone__status { display: flex; justify-content: space-between; padding: ${S(12, 7)} ${S(26, 16)} ${S(4, 2)}; font-size: ${S(15, 10)}; font-weight: 700; color: #1d2433; }
.ph-phone__head { display: flex; align-items: center; gap: ${S(8, 5)}; padding: ${S(6, 4)} ${S(18, 11)} ${S(10, 6)}; }
.ph-phone__title { font-size: ${S(30, 18)}; font-weight: 700; flex: 1; }
.ph-phone__body { flex: 1; overflow-y: auto; padding: ${S(4, 2)} ${S(14, 9)} ${S(14, 9)}; }
.ph-phone__nav { display: flex; gap: ${S(12, 8)}; padding: ${S(10, 6)} ${S(16, 10)} ${S(14, 9)}; background: #eef0f5; }
.ph-phone__nav button { flex: 1; height: ${S(54, 34)}; border-radius: 999px; border: none; background: linear-gradient(180deg, #2c2f3a, #12141b); color: #fff; cursor: pointer; display: grid; place-items: center; }
.ph-phone__nav svg { width: ${S(30, 20)}; height: ${S(30, 20)}; }
.ph-apps { display: grid; grid-template-columns: 1fr 1fr; gap: ${S(12, 8)}; }
.ph-app { border: none; border-radius: ${S(22, 14)}; padding: ${S(14, 9)}; min-height: ${S(110, 70)}; color: #fff; text-align: left; cursor: pointer; display: flex; flex-direction: column; justify-content: space-between; box-shadow: 0 3px 0 rgba(0, 0, 0, 0.15); font-family: var(--ph-font); transition: transform 110ms; position: relative; }
.ph-app:hover { transform: translateY(-2px) scale(1.02); }
.ph-app svg { width: ${S(40, 26)}; height: ${S(40, 26)}; }
.ph-app__name { font-size: ${S(22, 14)}; font-weight: 700; text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2); }
.ph-app--wide { grid-column: span 2; min-height: ${S(96, 60)}; }
.ph-app__badge { position: absolute; top: ${S(10, 6)}; right: ${S(12, 8)}; background: #fff; color: #e03a5a; border-radius: 999px; font-size: ${S(13, 9)}; font-weight: 700; padding: 1px 8px; }
.ph-search { width: 100%; border: 2px solid #d9dde6; border-radius: 999px; padding: ${S(10, 6)} ${S(16, 10)}; font-size: ${S(17, 12)}; font-family: var(--ph-font); outline: none; margin-bottom: ${S(10, 6)}; }
.ph-tiles { display: grid; grid-template-columns: 1fr 1fr; gap: ${S(8, 5)}; }
.ph-tile { background: #e9ebf1; border-radius: ${S(12, 8)}; border: 3px solid transparent; padding: ${S(6, 4)}; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 2px; position: relative; font-family: var(--ph-font); }
.ph-tile img { width: 100%; aspect-ratio: 1.25; object-fit: contain; }
.ph-tile__name { font-size: ${S(14, 10)}; font-weight: 700; color: #1f2433; text-align: center; line-height: 1.1; }
.ph-tile__sub { font-size: ${S(12, 9)}; font-weight: 600; color: #6c7488; }
.ph-tile--on { border-color: var(--ph-teal); background: #e3faf6; }
.ph-tile--locked img { filter: saturate(0.5) brightness(0.95); }
.ph-tile__tag { position: absolute; top: 4px; left: 4px; background: #ffd166; color: #3a2600; font-size: ${S(11, 8)}; font-weight: 700; border-radius: 999px; padding: 0 6px; }
.ph-chip { border: none; border-radius: 999px; padding: ${S(6, 4)} ${S(12, 8)}; font-weight: 700; font-size: ${S(14, 10)}; cursor: pointer; font-family: var(--ph-font); color: #fff; display: inline-flex; align-items: center; gap: 4px; }

/* -------------------------------------------------------- vehicle HUD */
.ph-vrow { position: fixed; top: var(--ph-top); left: 50%; transform: translateX(-50%); display: flex; gap: ${S(12, 6)}; }
.ph-vbtn { position: relative; width: ${S(64, 40)}; height: ${S(64, 40)}; border-radius: 50%; border: none; background: rgba(30, 34, 46, 0.86); color: #fff; display: grid; place-items: center; cursor: pointer; box-shadow: 0 3px 10px rgba(0, 0, 0, 0.3); }
.ph-vbtn svg { width: 52%; height: 52%; }
.ph-vbtn--on { background: var(--ph-sky); }
.ph-vbtn--siren.ph-vbtn--on { background: linear-gradient(90deg, #e63946 50%, #3a7bd5 50%); }
.ph-vbtn__key { position: absolute; bottom: -${S(12, 8)}; left: 50%; transform: translateX(-50%); background: #10131c; color: #fff; font-size: ${S(11, 8)}; font-weight: 700; border-radius: 999px; padding: 1px 7px; white-space: nowrap; }
.ph-speedo { position: fixed; right: calc(var(--ph-right) + ${S(10, 6)}); bottom: calc(var(--ph-bottom) + ${S(10, 6)}); background: var(--ph-dark); border-radius: ${S(20, 12)}; padding: ${S(12, 8)} ${S(18, 12)}; min-width: ${S(210, 130)}; box-shadow: 0 4px 14px rgba(0, 0, 0, 0.3); }
.ph-speedo__value { font-size: ${S(54, 32)}; font-weight: 700; line-height: 1; font-variant-numeric: tabular-nums; }
.ph-speedo__unit { font-size: ${S(15, 10)}; font-weight: 700; opacity: 0.75; margin-left: 6px; }
.ph-speedo__name { font-size: ${S(14, 10)}; font-weight: 600; opacity: 0.8; margin-bottom: 4px; }
.ph-bar { position: relative; height: ${S(10, 7)}; border-radius: 999px; background: rgba(255, 255, 255, 0.15); overflow: hidden; margin-top: ${S(7, 5)}; }
.ph-bar__fill { position: absolute; inset: 0 auto 0 0; border-radius: 999px; }
.ph-bar__label { display: flex; justify-content: space-between; font-size: ${S(12, 9)}; font-weight: 700; opacity: 0.85; margin-top: ${S(5, 3)}; }
.ph-hud--driving .ph-task { bottom: calc(var(--ph-bottom) + ${S(96, 62)}); }
.ph-radio { position: fixed; left: calc(var(--ph-side) + ${S(10, 6)}); bottom: calc(var(--ph-bottom) + ${S(10, 6)}); display: flex; align-items: center; gap: ${S(8, 5)}; }
.ph-radio__box { background: rgba(30, 24, 22, 0.88); border-radius: ${S(16, 10)}; padding: ${S(10, 6)} ${S(22, 14)}; min-width: ${S(200, 120)}; text-align: center; font-weight: 600; font-size: ${S(20, 13)}; }
.ph-radio__arrow { width: 0; height: 0; border: ${S(18, 12)} solid transparent; background: none; cursor: pointer; padding: 0; }
.ph-radio__arrow--l { border-right-color: rgba(255, 255, 255, 0.85); border-left: 0; }
.ph-radio__arrow--r { border-left-color: rgba(255, 255, 255, 0.85); border-right: 0; }

/* ----------------------------------------------------------- main menu */
.ph-menu { position: fixed; inset: 0; z-index: 60; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: ${S(18, 10)}; background: linear-gradient(180deg, rgba(10, 18, 40, 0.15), rgba(10, 18, 40, 0.55)); font-family: var(--ph-font); color: #fff; }
.ph-menu[hidden] { display: none; }
.ph-logo { text-align: center; line-height: 0.95; }
.ph-logo__main { font-family: "Pacifico", var(--ph-title); font-size: ${S(118, 54)}; color: #fff; text-shadow: 0 0 8px #ff4f8b, 0 0 22px #ff4f8b, 0 6px 0 #c2185b; }
.ph-logo__sub { font-family: "Righteous", var(--ph-title); font-size: ${S(34, 18)}; letter-spacing: 0.3em; color: #7ff3e7; text-shadow: 0 0 10px #2ec4b6, 0 3px 0 #0c5c55; margin-top: ${S(8, 4)}; }
.ph-menu__buttons { display: flex; flex-direction: column; gap: ${S(12, 8)}; width: min(84vw, ${S(380, 240)}); }
.ph-menu__btn { border: none; border-radius: 999px; padding: ${S(16, 10)}; font-size: ${S(26, 16)}; font-weight: 700; color: #fff; cursor: pointer; box-shadow: 0 5px 0 rgba(0, 0, 0, 0.22); font-family: var(--ph-font); transition: transform 110ms; }
.ph-menu__btn:hover { transform: translateY(-2px) scale(1.02); }
.ph-menu__play { background: linear-gradient(90deg, #ff6f91, #ff9671); font-size: ${S(32, 19)}; }
.ph-menu__alt { background: rgba(255, 255, 255, 0.2); backdrop-filter: blur(6px); }
.ph-menu__hint { font-size: ${S(16, 11)}; opacity: 0.9; font-weight: 600; text-align: center; max-width: 80vw; }
.ph-menu__who { display: flex; align-items: center; gap: 10px; background: rgba(0, 0, 0, 0.3); border-radius: 999px; padding: 6px 14px 6px 6px; font-weight: 700; }
.ph-menu__who img { width: ${S(40, 28)}; height: ${S(40, 28)}; border-radius: 50%; background: #fff; }

/* ------------------------------------------------------------- map */
.ph-mapwin { width: min(96vw, ${S(1300, 600)}); height: min(90vh, ${S(900, 420)}); }
.ph-mapwin .ph-window__body { padding: 0; display: flex; flex: 1; overflow: hidden; }
.ph-map__canvas { flex: 1; position: relative; overflow: hidden; background: #6fb6dd; cursor: grab; touch-action: none; }
.ph-map__canvas canvas { width: 100%; height: 100%; display: block; }
.ph-map__side { width: ${S(300, 170)}; overflow-y: auto; padding: ${S(12, 8)}; background: #f7f8fb; }
.ph-map__place { display: flex; align-items: center; gap: ${S(8, 5)}; padding: ${S(7, 5)} ${S(8, 5)}; border-radius: ${S(10, 7)}; cursor: pointer; font-weight: 600; font-size: ${S(15, 10)}; }
.ph-map__place:hover { background: #e6e9f0; }
.ph-map__place svg { width: ${S(26, 18)}; height: ${S(26, 18)}; flex: none; border-radius: 50%; padding: 4px; color: #fff; }
.ph-map__actions { position: absolute; left: 50%; bottom: ${S(14, 8)}; transform: translateX(-50%); display: flex; gap: 8px; background: rgba(255, 255, 255, 0.95); padding: 8px 12px; border-radius: 999px; box-shadow: 0 4px 14px rgba(0, 0, 0, 0.2); align-items: center; font-weight: 700; color: var(--ph-ink); }

/* ---------------------------------------------------------- build mode */
.ph-build { position: fixed; left: 50%; bottom: calc(var(--ph-bottom) + ${S(90, 58)}); transform: translateX(-50%); width: min(94vw, ${S(900, 420)}); background: var(--ph-dark); border-radius: ${S(20, 12)}; padding: ${S(12, 8)}; z-index: 30; }
.ph-build__row { display: flex; gap: ${S(8, 5)}; overflow-x: auto; padding-bottom: 4px; }
.ph-build__item { position: relative; flex: none; width: ${S(92, 60)}; border-radius: ${S(12, 8)}; background: rgba(255, 255, 255, 0.12); border: 2px solid transparent; cursor: pointer; padding: 4px; color: #fff; font-family: var(--ph-font); }
.ph-build__item img { width: 100%; aspect-ratio: 1; object-fit: contain; }
.ph-build__item--on { border-color: var(--ph-sun); background: rgba(255, 209, 102, 0.22); }
.ph-build__count { position: absolute; top: 2px; right: 6px; font-weight: 700; font-size: ${S(14, 10)}; }
.ph-build__name { font-size: ${S(12, 9)}; font-weight: 600; text-align: center; line-height: 1.1; }
.ph-build__bar { display: flex; gap: ${S(8, 5)}; align-items: center; margin-top: ${S(8, 5)}; flex-wrap: wrap; }
.ph-build__hint { flex: 1; font-size: ${S(14, 10)}; font-weight: 600; opacity: 0.9; min-width: 140px; }

/* --------------------------------------------------- mobile extras */
.ph-touchbtns { position: fixed; right: calc(env(safe-area-inset-right, 0px) + var(--aoe-jump-size, 80px) + 30px); bottom: calc(env(safe-area-inset-bottom, 0px) + 18px); display: flex; flex-direction: column-reverse; flex-wrap: wrap-reverse; align-content: flex-end; max-height: calc(3 * clamp(46px, 11vmin, 64px) + 24px); gap: 10px; z-index: 23; }
.ph-touchbtn[hidden] { display: none; }
.ph-touchbtn { width: clamp(46px, 11vmin, 64px); height: clamp(46px, 11vmin, 64px); border-radius: 50%; border: 3px solid rgba(20, 24, 40, 0.75); color: #fff; font-weight: 700; font-family: var(--ph-font); font-size: clamp(12px, 3vmin, 16px); background: linear-gradient(180deg, #5a6278, #2c3142); box-shadow: 0 4px 0 rgba(0, 0, 0, 0.3); touch-action: none; display: grid; place-items: center; }
.ph-touchbtn--go { background: linear-gradient(180deg, #4fe39a, #1f9e64); }
.ph-touchbtn--brake { background: linear-gradient(180deg, #ff7a7a, #d9364f); }
.ph-touchbtn--boost { background: linear-gradient(180deg, #7fd6ff, #2f8fe0); }
.ph-touchbtn--use { background: linear-gradient(180deg, #ffd166, #f4a300); color: #3a2600; }
.ph-touchbtn.is-down { transform: translateY(3px); box-shadow: 0 1px 0 rgba(0, 0, 0, 0.3); }
body:not(.aoe-touch-mode) .ph-touchbtns { display: none; }
body.aoe-touch-mode .ph-hotbar { bottom: calc(var(--ph-bottom) + 4px); }
body.aoe-touch-mode .ph-task { bottom: auto; top: calc(var(--ph-top) + 52px); left: 50%; transform: translateX(-50%); max-width: min(60vw, 340px); }
body.aoe-touch-mode .ph-toasts { top: calc(var(--ph-top) + 150px); }
body.aoe-touch-mode .ph-speedo { right: auto; left: 50%; transform: translateX(-50%); bottom: calc(var(--ph-bottom) + 70px); padding: 6px 14px; min-width: 0; }
body.aoe-touch-mode .ph-speedo__value { font-size: 26px; }
body.aoe-touch-mode .ph-radio { display: none; }
body.aoe-touch-mode .ph-phonebtn { top: auto; bottom: calc(env(safe-area-inset-bottom, 0px) + var(--aoe-jump-size, 80px) + 40px); transform: none; }
body.aoe-touch-mode .ph-phonebtn:hover { transform: none; }
/* Portrait phones: the minimap fills the top-right, so the round buttons stand
   down the left edge (clear of the corner) and the task card sits under the map. */
@media (orientation: portrait) {
  body.aoe-touch-mode .ph-iconbar { top: 32%; left: var(--ph-side); transform: none; flex-direction: column; }
  body.aoe-touch-mode .ph-iconbtn__tip { display: none; }
  body.aoe-touch-mode .ph-task { top: calc(var(--ph-top) + 190px); }
  body.aoe-touch-mode .ph-toasts { top: 60%; }
}
@media (max-height: 520px) {
  .ph-minimap { width: 96px; height: 96px; }
  .ph-phone { height: 94vh; width: min(270px, 46vw); }
  .ph-vrow { gap: 6px; }
}
`;
