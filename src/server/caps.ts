// Per-room object cap — the server-side backstop against griefing.
// The client also enforces this (toast + block), but a client that bypasses
// the UI, or a hostile script, would not. So after every doc update we check
// the total and trim if needed.

import { DOC, LIMITS } from '../shared/schema';
import type { Room } from './rooms';

/**
 * If a room is over the object cap, trim the most-recently-added items until
 * it fits. Strokes go first (a flood is almost always strokes, and they are
 * cheapest to drop); newest-first, so existing work is preserved.
 *
 * Re-entrancy: the trim runs in a transaction tagged 'cap-enforce', and
 * rooms.ts skips this function for updates carrying that origin.
 */
export function enforceObjectCap(room: Room): void {
  let overflow = room.itemCount() - LIMITS.objectsPerRoom;
  if (overflow <= 0) return;

  room.doc.transact(() => {
    const strokes = room.doc.getArray(DOC.strokes);
    while (overflow > 0 && strokes.length > 0) {
      strokes.delete(strokes.length - 1, 1);
      overflow--;
    }

    if (overflow > 0) {
      const shapes = room.doc.getMap(DOC.shapes);
      for (const key of [...shapes.keys()].reverse()) {
        if (overflow <= 0) break;
        shapes.delete(key);
        overflow--;
      }
    }

    if (overflow > 0) {
      const objects = room.doc.getMap(DOC.objects);
      for (const key of [...objects.keys()].reverse()) {
        if (overflow <= 0) break;
        objects.delete(key);
        overflow--;
      }
    }

    if (overflow > 0) {
      const edges = room.doc.getMap(DOC.edges);
      for (const key of [...edges.keys()].reverse()) {
        if (overflow <= 0) break;
        edges.delete(key);
        overflow--;
      }
    }
  }, 'cap-enforce');
}
