import { ArraySchema, MapSchema, Schema, type } from '@colyseus/schema';
import { cityPlan } from '@palmhaven/shared';
import { PlayerState } from './PlayerState.js';

/** One vehicle out on the streets (or the water, or in the air). */
export class VehicleState extends Schema {
  @type('uint32') id = 0;
  @type('uint8') kind = 0;
  @type('uint32') paint = 0xffffff;
  @type('string') owner = '';
  @type('string') ownerName = '';
  @type('string') driver = '';

  @type('float32') x = 0;
  @type('float32') y = 0;
  @type('float32') z = 0;
  @type('float32') yaw = 0;
  @type('float32') vx = 0;
  @type('float32') vz = 0;
  @type('float32') vy = 0;
  @type('boolean') grounded = true;
  @type('float32') nitro = 1;
  @type('float32') throttle = 0;

  /** 1 lights, 2 siren, 4 locked. */
  @type('uint8') flags = 0;
  @type('float32') fuel = 100;
  /** A taxi's NPC passenger (look index + 1), 0 = none. */
  @type('uint8') fare = 0;
  /** Counts horn presses so every client honks once. */
  @type('uint16') horn = 0;
}

/** A piece of furniture in a home, in house-local coordinates. */
export class FurnitureState extends Schema {
  @type('uint16') id = 0;
  @type('uint16') kind = 0;
  @type('float32') x = 0;
  @type('float32') z = 0;
  /** Quarter turns. */
  @type('uint8') rot = 0;
}

/** One claimable home. */
export class HouseState extends Schema {
  @type('uint8') id = 0;
  @type('string') owner = '';
  @type('string') ownerName = '';
  @type('boolean') locked = false;
  @type({ map: FurnitureState }) furniture = new MapSchema<FurnitureState>();
}

/** A staffed counter: who is working it, and the customer waiting. */
export class ShopState extends Schema {
  @type('string') shop = '';
  @type('string') worker = '';
  /** NPC customer's look + 1 (0 = nobody waiting). */
  @type('uint8') customer = 0;
  /** What they ordered, item keys joined by commas. */
  @type('string') order = '';
  /** Server clock the customer walked in. */
  @type('float64') since = 0;
}

const houses = (): ArraySchema<HouseState> => {
  const list = new ArraySchema<HouseState>();
  for (const plot of cityPlan().houses) {
    const house = new HouseState();
    house.id = plot.id;
    list.push(house);
  }
  return list;
};

/** Root replicated state for one room. */
export class GameState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type({ map: VehicleState }) vehicles = new MapSchema<VehicleState>();
  @type([HouseState]) houses = houses();
  @type({ map: ShopState }) shops = new MapSchema<ShopState>();
  /** The server's wall clock (ms): time of day, traffic lights, timers. */
  @type('float64') now = 0;
}
