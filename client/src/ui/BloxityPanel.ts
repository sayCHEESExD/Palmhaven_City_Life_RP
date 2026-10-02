import { logger } from '../util/logger.js';
import type { Bloxity } from '../bloxity/Bloxity.js';
import type { LegionUser } from '../bloxity/legionTypes.js';
import { Panel } from './Panel.js';
import { injectHudStyles } from './hudStyles.js';

const SCOPE = 'bloxity/ui';

/**
 * A panel whose body can be filled from outside.
 *
 * `Panel.body` is protected on purpose - a panel owns its own contents - so
 * the way to fill one is to BE one. This exposes a single container to write
 * into and changes nothing else, which keeps the open/close accounting and the
 * movement suppression exactly where they already are.
 */
class ContentPanel extends Panel {
  readonly content = document.createElement('div');

  constructor(parent: HTMLElement, variant: string, title: string) {
    super(parent, variant, title);
    this.body.appendChild(this.content);
  }
}

/** Fallback portrait, from the portal's own CDN. */
const DEFAULT_PFP = 'https://static.bloxity.io/img/pfps/0.png?width=128&quality=85';

/**
 * What Bux buys, by SKU.
 *
 * NO PRICES. The price of a SKU lives in the portal's catalogue, keyed by the
 * game slug, and is charged server-side - a number here would be a number the
 * client chose, which is the one thing a payment path must never allow. What
 * this table holds is only what the button should SAY.
 *
 * Nothing here is granted locally either. Bloxity calls this game's webhook
 * and the room credits the profile, so a purchase arrives the same way a stage
 * reward does: as replicated state the server decided on.
 */
const BUX_PRODUCTS: readonly { sku: string; name: string; blurb: string }[] = [
  { sku: 'coins_small', name: 'Wad of Cash', blurb: '$25K for a new ride or a sofa set.' },
  { sku: 'coins_large', name: 'Briefcase of Cash', blurb: '$250K - a waterfront villa!' },
];

/**
 * The portal's face inside the game.
 *
 * An account chip on the right of the screen (who is signed in, nothing more),
 * and the Bux store panel the Shops menu opens. It owns no state - the chip is redrawn from
 * whatever `Bloxity.onUserChanged` last said, and every figure it shows is
 * fetched when the panel opens rather than cached, so a purchase made in
 * another tab cannot leave a stale balance on screen.
 *
 * The panels extend the game's own `Panel`, which is what keeps movement
 * suppressed while one is open - a shop the player walks out of mid-purchase
 * would be a shop with a different bug every time.
 */
export class BloxityPanel {
  private readonly bloxity: Bloxity;
  private readonly chip: HTMLDivElement;
  private readonly bux: ContentPanel;

  private readonly buxBody: HTMLDivElement;

  private readonly offUser: () => void;

  constructor(parent: HTMLElement, bloxity: Bloxity) {
    injectHudStyles();
    this.bloxity = bloxity;

    this.chip = document.createElement('div');
    this.chip.className = 'aoe-account aoe-font';
    parent.appendChild(this.chip);

    this.bux = new ContentPanel(parent, 'bux', 'Bux Store');
    this.buxBody = this.bux.content;

    // THE one auth subscription in the UI layer, fanned out from the one in
    // `Bloxity`. It fires immediately, so the chip is never blank.
    this.offUser = this.bloxity.onUserChanged((user) => this.renderChip(user));
  }

  dispose(): void {
    this.offUser();
    this.chip.remove();
    this.bux.dispose();
  }

  // ------------------------------------------------------------------ chip

  private renderChip(user: LegionUser | null): void {
    this.chip.replaceChildren();

    if (!this.bloxity.available) {
      // Say so rather than showing a login button that cannot work.
      const note = document.createElement('span');
      note.className = 'aoe-account__note';
      note.textContent = 'Playing offline';
      this.chip.appendChild(note);
      return;
    }

    if (!user) {
      this.chip.appendChild(
        this.button('Log in', 'aoe-account__login', () => {
          void this.bloxity.showAuthPopup();
        }),
      );
      return;
    }

    const pfp = document.createElement('img');
    pfp.className = 'aoe-account__pfp';
    pfp.src = user.pfp || DEFAULT_PFP;
    pfp.alt = '';
    pfp.draggable = false;

    const name = document.createElement('span');
    name.className = 'aoe-account__name';
    name.textContent = user.displayName || user.username;

    const row = document.createElement('div');
    row.className = 'aoe-account__row';
    row.append(pfp, name);

    // Just who is signed in: no Friends / Avatar / Bux buttons under it. (The
    // Bux store is still one tap away from the phone's Bank app.)
    this.chip.append(row);
  }

  private button(label: string, className: string, onClick: () => void): HTMLButtonElement {
    const node = document.createElement('button');
    node.type = 'button';
    node.className = `${className} aoe-font`;
    node.textContent = label;
    node.addEventListener('click', (event) => {
      event.stopPropagation();
      onClick();
    });
    return node;
  }

  // ------------------------------------------------------------------- bux

  async openBux(): Promise<void> {
    this.bux.setOpen(true);
    this.buxBody.replaceChildren(this.note('Loading balance…'));

    const balance = await this.bloxity.getBuxBalance();
    if (!this.bux.isOpen) return;

    const header = document.createElement('p');
    header.className = 'aoe-panel__note';
    header.textContent =
      balance === null
        ? 'Bux balance unavailable.'
        : `You have ${balance.toLocaleString()} Bux.`;

    const rows = BUX_PRODUCTS.map((product) => {
      const row = document.createElement('div');
      row.className = 'aoe-bux';

      const text = document.createElement('div');
      text.className = 'aoe-bux__text';
      text.innerHTML =
        `<b>${escapeHtml(product.name)}</b><small>${escapeHtml(product.blurb)}</small>`;

      const buy = this.button('Buy', 'aoe-bux__buy', () => {
        buy.disabled = true;
        buy.textContent = 'Opening…';
        // ONLY the sku. The catalogue decides what it costs.
        void this.bloxity
          .requestPurchase(product.sku, { gameMode: 'city' })
          .then((result) => {
            if (result.success) {
              buy.textContent = 'Purchased';
              logger.info(SCOPE, `bought ${product.sku} (txn ${result.transactionId})`);
              // The grant arrives as replicated state from the webhook; the
              // balance is re-read rather than guessed at.
              void this.openBux();
            } else {
              buy.textContent = 'Buy';
              buy.disabled = false;
              header.textContent = result.error ?? 'Purchase cancelled.';
            }
          });
      });

      row.append(text, buy);
      return row;
    });

    this.buxBody.replaceChildren(header, ...rows);
  }

  private note(text: string): HTMLParagraphElement {
    const node = document.createElement('p');
    node.className = 'aoe-panel__note';
    node.textContent = text;
    return node;
  }
}

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) =>
    char === '&'
      ? '&amp;'
      : char === '<'
        ? '&lt;'
        : char === '>'
          ? '&gt;'
          : char === '"'
            ? '&quot;'
            : '&#39;',
  );
