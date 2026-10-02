import { JOBS, type JobId } from '@palmhaven/shared';
import { el } from './Modal.js';
import { injectCityStyles } from './styles.js';

/**
 * THE TITLE SCREEN: the PALMHAVEN neon logo over the live city (the camera
 * drifts along Ocean Drive behind it), PLAY, pick a starting life, settings.
 */
export class MainMenu {
  readonly root: HTMLDivElement;
  private readonly who: HTMLDivElement;
  private readonly jobs: HTMLDivElement;
  private chosen: JobId = 'civilian';

  constructor(container: HTMLElement, handlers: { play(job: JobId): void; settings(): void; account(): void }) {
    injectCityStyles();
    this.root = el('div', 'ph-menu');
    const logo = el('div', 'ph-logo');
    logo.append(el('div', 'ph-logo__main', 'Palmhaven'), el('div', 'ph-logo__sub', 'CITY LIFE RP'));
    this.who = el('div', 'ph-menu__who');
    this.who.hidden = true;
    this.who.style.cursor = 'pointer';
    this.who.addEventListener('click', () => handlers.account());
    const buttons = el('div', 'ph-menu__buttons');
    const play = el('button', 'ph-menu__btn ph-menu__play', 'Play');
    play.addEventListener('click', () => handlers.play(this.chosen));
    const life = el('button', 'ph-menu__btn ph-menu__alt', 'Choose your life');
    this.jobs = el('div', '');
    this.jobs.hidden = true;
    this.jobs.style.display = 'grid';
    this.jobs.style.gridTemplateColumns = 'repeat(auto-fill, minmax(120px, 1fr))';
    this.jobs.style.gap = '8px';
    this.jobs.style.width = 'min(90vw, 640px)';
    life.addEventListener('click', () => {
      this.jobs.hidden = !this.jobs.hidden;
      this.jobs.style.display = this.jobs.hidden ? 'none' : 'grid';
    });
    this.jobs.style.display = 'none';
    for (const job of JOBS) {
      const b = el('button', 'ph-menu__btn ph-menu__alt', job.name);
      b.style.fontSize = '15px';
      b.style.padding = '10px 6px';
      b.style.borderBottom = `4px solid ${job.color}`;
      b.addEventListener('click', () => {
        this.chosen = job.id;
        for (const child of this.jobs.children) (child as HTMLElement).style.background = '';
        b.style.background = 'rgba(46, 196, 182, 0.55)';
        play.textContent = job.id === 'civilian' ? 'Play' : `Play as ${job.name}`;
      });
      this.jobs.append(b);
    }
    const settings = el('button', 'ph-menu__btn ph-menu__alt', 'Settings');
    settings.addEventListener('click', () => handlers.settings());
    buttons.append(play, life);
    const hint = el('div', 'ph-menu__hint', 'Live your own story in a tropical city: drive, work, buy a home on the bay, hit the beach and roleplay with friends.');
    this.root.append(logo, this.who, buttons, this.jobs, settings, hint);
    container.append(this.root);
  }

  setPlayer(name: string, avatarUrl: string): void {
    this.who.hidden = !name;
    this.who.replaceChildren();
    if (!name) return;
    const img = el('img', '');
    img.src = avatarUrl;
    this.who.append(img, el('span', '', name));
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  close(): void {
    this.root.hidden = true;
  }

  dispose(): void {
    this.root.remove();
  }
}
