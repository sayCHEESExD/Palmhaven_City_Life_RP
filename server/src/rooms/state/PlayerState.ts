import { Schema, type } from '@colyseus/schema';
import { AvatarState } from './AvatarState.js';

/**
 * Replicated per-player state: what EVERYBODY needs to draw this player.
 *
 * Every field is written by the SERVER: the transform by the authoritative
 * simulation, the rest by the room's services. A player's wallet, bag and job
 * task are NOT here - they travel to their own client alone, as `Self`.
 */
export class PlayerState extends Schema {
  @type('string') sessionId = '';

  @type('float32') x = 0;
  @type('float32') y = 0;
  @type('float32') z = 0;
  @type('float32') rotationY = 0;

  @type('float32') speed = 0;
  @type('float32') verticalVelocity = 0;
  @type('boolean') grounded = true;
  @type('boolean') swimming = false;

  /** Authoritative velocity, for client reconciliation. */
  @type('float32') velocityX = 0;
  @type('float32') velocityY = 0;
  @type('float32') velocityZ = 0;
  @type('uint32') lastInputSeq = 0;
  @type('boolean') jumpLatched = false;
  @type('uint32') jumpCount = 0;

  @type(AvatarState) avatar = new AvatarState();
  @type('string') displayName = '';
  @type('string') avatarUrl = '';

  /** Job index (see JOBS). */
  @type('uint8') job = 0;
  /** The vehicle they are in (0 = on foot) and which seat. */
  @type('uint32') vehicle = 0;
  @type('int8') seat = -1;
  /** Body pose (POSE): standing, sitting, lying... */
  @type('uint8') pose = 0;
  /** Current emote (0 = none) and a counter so a repeat replays. */
  @type('uint8') emote = 0;
  @type('uint16') emoteSeq = 0;
  /**
   * A Bloxity catalogue emote ('' = none) and when it began (server ms): every
   * screen samples the same clip at the same moment from these two.
   */
  @type('string') bxEmote = '';
  @type('float64') bxEmoteAt = 0;
  /** The item in hand (0 = none) and a counter of its uses. */
  @type('uint16') item = 0;
  @type('uint16') itemUse = 0;
  /** Accessories shown: hat, face, back (0 = none). A uniform hat replaces the chosen one on duty. */
  @type('uint8') hat = 0;
  @type('uint8') face = 0;
  @type('uint8') back = 0;
  /** STATUS bits: cuffed, jailed. */
  @type('uint8') status = 0;
  /** The officer escorting a cuffed player. */
  @type('string') escort = '';
  /** The home they live in here (-1 = none). */
  @type('int8') house = -1;

  /** True once the server has simulated at least one input for this player. */
  @type('boolean') ready = false;
}
