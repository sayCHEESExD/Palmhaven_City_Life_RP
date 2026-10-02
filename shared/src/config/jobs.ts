/**
 * THE LIVES YOU CAN LEAD. A job is a costume, a vehicle, a reason to drive
 * somewhere and a little pay - never a grind. Switch any time at City Hall,
 * at the job's own HQ, or from the phone.
 */

export type JobId = 'civilian' | 'police' | 'medic' | 'delivery' | 'taxi' | 'chef' | 'clerk';

export interface JobDef {
  readonly id: JobId;
  /** Replicated as a byte. */
  readonly index: number;
  readonly name: string;
  /** Shown under the name over your head. */
  readonly title: string;
  readonly color: string;
  readonly blurb: string;
  /** What you actually do. */
  readonly how: string;
  /** The job vehicle, if any. */
  readonly vehicle?: string;
  /** The uniform hat (an accessory key). */
  readonly hat?: string;
  /** Pay every paycheck while on duty. */
  readonly salary: number;
  /** Where the job's HQ is (a place id). */
  readonly hq: string;
}

export const JOBS: readonly JobDef[] = [
  {
    id: 'civilian', index: 0, name: 'Civilian', title: 'Citizen', color: '#e8eef7', salary: 40, hq: 'cityhall',
    blurb: 'Live your best Palmhaven life. No boss, no schedule.',
    how: 'Explore, shop, decorate your home, hit the beach and roleplay with friends.',
  },
  {
    id: 'police', index: 1, name: 'Police Officer', title: 'Police', color: '#4d8dff', salary: 120, hq: 'police', vehicle: 'police', hat: 'police_cap',
    blurb: 'Patrol the streets and answer dispatch calls.',
    how: 'Respond to calls marked on your map and arrest suspects. Cuff players with E, then book them at the station.',
  },
  {
    id: 'medic', index: 2, name: 'Paramedic', title: 'Medic', color: '#ff5d6c', salary: 120, hq: 'hospital', vehicle: 'ambulance', hat: 'medic_cap',
    blurb: 'Rush to emergencies and treat patients.',
    how: 'Drive the ambulance to medical calls and treat the patient. Players resting in a hospital bed can be treated too.',
  },
  {
    id: 'delivery', index: 3, name: 'Delivery Driver', title: 'PalmPost', color: '#ffb547', salary: 90, hq: 'depot', vehicle: 'van', hat: 'delivery_cap',
    blurb: 'Parcels from the depot to doorsteps all over the city.',
    how: 'Load parcels at the PalmPost depot, then drive to each address and hand the parcel over at the door.',
  },
  {
    id: 'taxi', index: 4, name: 'Taxi Driver', title: 'Taxi', color: '#ffd23f', salary: 90, hq: 'taxi', vehicle: 'taxi', hat: 'taxi_cap',
    blurb: 'Pick up passengers and get them there fast.',
    how: 'Drive to the waiting fare, stop beside them, then take them to their destination. Players riding with you pay a tip.',
  },
  {
    id: 'chef', index: 5, name: 'Cafe & Grill Cook', title: 'Cook', color: '#ff8fb1', salary: 90, hq: 'burger', hat: 'chef_hat',
    blurb: 'Cook and serve at Palm Burger or Sunset Cafe.',
    how: 'Stand behind the counter. When a customer orders, make each item at its station, then serve it at the register.',
  },
  {
    id: 'clerk', index: 6, name: 'Shop Clerk', title: 'Clerk', color: '#7be0a8', salary: 90, hq: 'grocery', hat: 'visor',
    blurb: 'Run the register at FreshMart or Coastline Threads.',
    how: 'Stand behind the register. Ring up customers as they come in, and earn a cut when players buy from your shop.',
  },
];

const BY_ID = new Map(JOBS.map((j) => [j.id, j]));
export const jobById = (id: string): JobDef | undefined => BY_ID.get(id as JobId);
export const jobByIndex = (index: number): JobDef => JOBS[index] ?? JOBS[0]!;

/** Seconds between paychecks. */
export const PAYCHECK_SECONDS = 180;

/** Pay for one completed task. */
export const PAY = {
  deliveryBase: 140,
  deliveryPerUnit: 0.18,
  taxiBase: 80,
  taxiPerUnit: 0.3,
  playerFare: 120,
  policeCall: 240,
  arrest: 300,
  medicCall: 230,
  treatPlayer: 180,
  chefOrder: 85,
  clerkSale: 65,
  shopCommission: 0.1,
} as const;

/** Seconds a booked player spends in a cell. */
export const JAIL_SECONDS = 40;
/** A player who was just released cannot be cuffed again for this long. */
export const ARREST_IMMUNITY_SECONDS = 120;
/** Seconds of mashing that frees you from cuffs if the officer walks off. */
export const CUFF_ESCAPE_SECONDS = 12;
export const NPC_LOOKS = 12;
