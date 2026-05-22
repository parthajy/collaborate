// Room activity log — a capped, shared list of who did what. Stored in the
// Yjs doc so everyone sees the same history; ephemeral with the room.

import { doc, yLog } from './sync';
import { getMyName } from './presence';

const MAX_ENTRIES = 80;

/**
 * Append an entry to the shared activity log, trimming it to the last 80.
 * Uses an untracked transaction so log entries never show up in undo.
 */
export function logEvent(text: string): void {
  doc.transact(() => {
    yLog.push([{ t: Date.now(), name: getMyName(), text }]);
    const overflow = yLog.length - MAX_ENTRIES;
    if (overflow > 0) yLog.delete(0, overflow);
  });
}
