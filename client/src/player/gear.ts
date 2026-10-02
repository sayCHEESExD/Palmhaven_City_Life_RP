import { accessoryById, itemById } from '@palmhaven/shared';
import type { BufferGeometry, Object3D } from 'three';
import { buildAccessory, buildItem } from '../models/items.js';
import { PartBuilder, meshesFor, type PartKind } from '../render/PartBuilder.js';

/**
 * Models for what people hold and wear, built once per key and shared: a
 * hundred sunglasses are one geometry.
 */
const cache = new Map<string, Partial<Record<PartKind, BufferGeometry>>>();

const cached = (key: string, build: (b: PartBuilder) => void): Object3D | null => {
  let geometries = cache.get(key);
  if (!geometries) {
    const b = new PartBuilder();
    build(b);
    geometries = b.isEmpty ? {} : b.geometries();
    cache.set(key, geometries);
  }
  if (Object.keys(geometries).length === 0) return null;
  return meshesFor(geometries, key, true);
};

/** The model for an item id (in the hand's frame). */
export const heldModel = (itemId: number): Object3D | null => {
  const item = itemById(itemId);
  if (!item) return null;
  return cached(`item:${item.key}`, (b) => buildItem(b, item.key));
};

export const heldKey = (itemId: number): string => itemById(itemId)?.key ?? '';

/** The model for an accessory id (head frame for hats and faces, back frame for back items). */
export const accessoryModel = (id: number): Object3D | null => {
  const acc = accessoryById(id);
  if (!acc) return null;
  return cached(`acc:${acc.key}`, (b) => buildAccessory(b, acc.key));
};

export const accessoryKey = (id: number): string => accessoryById(id)?.key ?? '';
