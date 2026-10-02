import { formatMoney, jobByIndex, visibleName } from '@palmhaven/shared';
import { ICONS, type IconName } from './icons.js';
import { Modal, closeButton, el } from './Modal.js';

export interface Choice {
  readonly text: string;
  readonly sub?: string;
  readonly icon?: IconName;
  readonly color?: string;
  readonly run: () => void;
  readonly disabled?: boolean;
}

/**
 * A SMALL WINDOW OF CHOICES: the ATM, a home's front door, a job locker, the
 * dispatch counter, a boat kiosk. One look for all of them.
 */
export class ChoiceDialog extends Modal {
  private readonly win: HTMLDivElement;
  private readonly title: HTMLDivElement;
  private readonly sub: HTMLDivElement;
  private readonly body: HTMLDivElement;

  constructor(container: HTMLElement) {
    super(container);
    this.win = el('div', 'ph-window ph-window--narrow');
    const head = el('div', 'ph-window__head');
    const titles = el('div', '');
    titles.style.flex = '1';
    this.title = el('div', 'ph-window__title');
    this.sub = el('div', 'ph-window__sub');
    titles.append(this.title, this.sub);
    head.append(titles, closeButton('', () => this.close()));
    this.body = el('div', 'ph-window__body');
    this.win.append(head, this.body);
    this.shade.append(this.win);
  }

  ask(title: string, subtitle: string, choices: readonly Choice[], accent = '#2ec4b6'): void {
    this.win.style.setProperty('--ph-accent', accent);
    this.title.textContent = title;
    this.sub.textContent = subtitle;
    this.body.replaceChildren();
    for (const choice of choices) {
      const row = el('button', 'ph-row');
      row.style.width = '100%';
      row.style.border = 'none';
      row.style.cursor = choice.disabled ? 'default' : 'pointer';
      row.style.fontFamily = 'var(--ph-font)';
      row.style.textAlign = 'left';
      if (choice.disabled) row.style.opacity = '0.55';
      const icon = el('div', 'ph-row__icon');
      icon.style.background = choice.color ?? accent;
      icon.innerHTML = ICONS[choice.icon ?? 'star'];
      const main = el('div', 'ph-row__main');
      main.append(el('div', 'ph-row__title', choice.text));
      if (choice.sub) main.append(el('div', 'ph-row__sub', choice.sub));
      row.append(icon, main);
      row.addEventListener('click', () => {
        if (choice.disabled) return;
        this.close();
        choice.run();
      });
      this.body.append(row);
    }
    this.open();
  }
}

/** Interact with another player: wave, high five, give money, cuff, treat. */
export class PlayerMenu extends ChoiceDialog {
  showFor(
    target: { id: string; name: string; job: number; cuffed: boolean },
    me: { job: string; money: number },
    run: (action: 'wave' | 'highfive' | 'hug' | 'give' | 'cuff' | 'release' | 'treat' | 'book') => void,
  ): void {
    const job = jobByIndex(target.job);
    const choices: Choice[] = [
      { text: 'Wave', icon: 'wave', color: '#4dabf7', run: () => run('wave') },
      { text: 'High five', icon: 'sparkle', color: '#ffb547', run: () => run('highfive') },
      { text: 'Hug', icon: 'heart', color: '#ff6f91', run: () => run('hug') },
      { text: 'Give $100', sub: me.money >= 100 ? `You have ${formatMoney(me.money)}` : 'Not enough money', icon: 'cash', color: '#2f9e44', run: () => run('give'), disabled: me.money < 100 },
    ];
    if (me.job === 'police') {
      if (target.cuffed) {
        choices.push({ text: 'Book at the station', sub: 'At the Booking Desk', icon: 'badge', color: '#3a7bd5', run: () => run('book') });
        choices.push({ text: 'Release', icon: 'unlock', color: '#868e96', run: () => run('release') });
      } else {
        choices.push({ text: 'Arrest (cuff)', sub: 'Then escort them to the station', icon: 'lock', color: '#3a7bd5', run: () => run('cuff') });
      }
    }
    if (me.job === 'medic') choices.push({ text: 'Treat', sub: 'They need to be lying down', icon: 'cross', color: '#ff4d6d', run: () => run('treat') });
    this.ask(visibleName(target.name), job.id === 'civilian' ? 'Resident' : job.name, choices, job.color === '#e8eef7' ? '#2ec4b6' : job.color);
  }
}

/** Are you sure? */
export class ConfirmDialog extends ChoiceDialog {
  confirm(title: string, text: string, yes: string, run: () => void, accent = '#2ec4b6'): void {
    this.ask(title, text, [
      { text: yes, icon: 'check', color: '#2f9e44', run },
      { text: 'Cancel', icon: 'close', color: '#868e96', run: () => undefined },
    ], accent);
  }
}
