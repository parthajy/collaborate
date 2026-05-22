// Room-name validation: format, length, reserved paths, and a blocklist of
// slurs / trademarks loaded from config/blocklist.txt at startup.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOM_NAME_RE, LIMITS, RESERVED_PATHS } from '../shared/schema';
import type { Verdict } from './ratelimit';

/** Lowercased blocklist terms, loaded once at startup. */
const blocked: string[] = loadBlocklist();

function loadBlocklist(): string[] {
  try {
    const raw = readFileSync(resolve(process.cwd(), 'config/blocklist.txt'), 'utf8');
    const terms = raw
      .split('\n')
      .map((line) => line.trim().toLowerCase())
      .filter((line) => line.length > 0 && !line.startsWith('#'));
    console.log(`[blocklist] loaded ${terms.length} terms`);
    return terms;
  } catch {
    console.warn('[blocklist] config/blocklist.txt not found — name filter inactive');
    return [];
  }
}

/**
 * Validate a room name. Blocklist matching is substring-based and also checks
 * a de-hyphenated form, so "g-o-o-g-l-e" is caught alongside "google".
 */
export function validateRoomName(name: string): Verdict {
  if (!name || name.length > LIMITS.roomNameMaxLen) {
    return { ok: false, reason: 'Room name must be 1–32 characters.' };
  }
  if (!ROOM_NAME_RE.test(name)) {
    return { ok: false, reason: 'Room names use lowercase letters, numbers, and single hyphens.' };
  }
  if (RESERVED_PATHS.has(name)) {
    return { ok: false, reason: 'That room name is reserved.' };
  }

  const flat = name.replace(/-/g, '');
  for (const term of blocked) {
    const flatTerm = term.replace(/-/g, '');
    if (name.includes(term) || (flatTerm.length >= 3 && flat.includes(flatTerm))) {
      return { ok: false, reason: 'That room name is not allowed.' };
    }
  }
  return { ok: true };
}
