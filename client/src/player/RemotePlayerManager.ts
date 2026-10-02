import { VISIBLE_REMOTE_PLAYERS } from '@palmhaven/shared';
import type { Scene, Vector3 } from 'three';
import type { NetPlayerState } from '../net/netTypes.js';
import { RemotePlayer } from './RemotePlayer.js';

const RANK_INTERVAL = 0.3;
const SWAP_MARGIN = 16;

/**
 * Every other player in the room: a registry, and a VISIBILITY POLICY. Every
 * remote is TRACKED on every patch; only the nearest are DRAWN.
 */
export class RemotePlayerManager {
  private readonly players = new Map<string, RemotePlayer>();
  private readonly visible = new Set<string>();
  private sinceRank = RANK_INTERVAL;

  constructor(private readonly scene: Scene) {}

  get count(): number {
    return this.players.size;
  }

  get(sessionId: string): RemotePlayer | undefined {
    return this.players.get(sessionId);
  }

  all(): IterableIterator<[string, RemotePlayer]> {
    return this.players.entries();
  }

  add(sessionId: string, state: NetPlayerState): void {
    if (this.players.has(sessionId)) return;
    this.players.set(sessionId, new RemotePlayer(state));
    this.sinceRank = RANK_INTERVAL;
  }

  update(sessionId: string, state: NetPlayerState): void {
    this.players.get(sessionId)?.apply(state);
  }

  has(sessionId: string): boolean {
    return this.players.has(sessionId);
  }

  retain(present: ReadonlySet<string>): void {
    for (const id of [...this.players.keys()]) if (!present.has(id)) this.remove(id);
  }

  remove(sessionId: string): void {
    const player = this.players.get(sessionId);
    if (!player) return;
    this.hide(sessionId, player);
    player.dispose();
    this.players.delete(sessionId);
    this.sinceRank = RANK_INTERVAL;
  }

  isVisible(sessionId: string): boolean {
    return this.visible.has(sessionId);
  }

  advance(delta: number, local: Vector3 | null): void {
    this.sinceRank += Math.max(0, delta);
    if (this.sinceRank >= RANK_INTERVAL && local) {
      this.sinceRank = 0;
      this.rank(local);
    }
    for (const id of this.visible) this.players.get(id)?.update(delta);
  }

  dispose(): void {
    for (const [id, player] of this.players) {
      this.hide(id, player);
      player.dispose();
    }
    this.players.clear();
    this.visible.clear();
  }

  private rank(local: Vector3): void {
    const scored = [...this.players.entries()].map(([id, player]) => {
      const d = Math.hypot(player.position.x - local.x, player.position.y - local.y, player.position.z - local.z);
      return { id, score: this.visible.has(id) ? d - SWAP_MARGIN : d };
    });
    scored.sort((a, b) => a.score - b.score);
    const winners = new Set(scored.slice(0, VISIBLE_REMOTE_PLAYERS).map((e) => e.id));
    for (const id of [...this.visible]) {
      if (winners.has(id)) continue;
      const player = this.players.get(id);
      if (player) this.hide(id, player);
    }
    for (const id of winners) {
      if (this.visible.has(id)) continue;
      const player = this.players.get(id);
      if (player) {
        this.scene.add(player.character.root);
        this.visible.add(id);
      }
    }
  }

  private hide(id: string, player: RemotePlayer): void {
    if (!this.visible.delete(id)) return;
    player.character.root.removeFromParent();
  }
}
