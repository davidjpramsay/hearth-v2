import { z } from 'zod';
import {
  OpaqueIdSchema,
  WordGroupsProgressSchema,
  type WordGroupsProgress,
  type WordGroupsPuzzle,
} from '@hearth/shared';
import { newWordGroupsProgress, validWordGroupsProgress, wordGroupsSummary } from '@hearth/core';

export type GameOutcome = 'in-progress' | 'revealed' | 'completed';

const StoreSchema = z.object({
  version: z.literal(2),
  // Additive to v2: old saves remain readable and a bad pointer cannot erase valid guesses.
  lastPuzzleId: OpaqueIdSchema.nullable().catch(null),
  completedIds: z.array(OpaqueIdSchema).max(5000),
  entries: z
    .array(
      z.object({
        id: OpaqueIdSchema,
        progress: WordGroupsProgressSchema,
        outcome: z.enum(['in-progress', 'revealed', 'completed']),
      }),
    )
    .max(2000),
});
const storageKey = (home: string) => `hearth.word-groups.v2.${home}`;
const emptyStore = () => ({
  version: 2 as const,
  lastPuzzleId: null,
  completedIds: [],
  entries: [],
});

/** Owner-requested one-time reset: discard v1 Games data, never other storage. */
function discardLegacyProgress() {
  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index);
    if (key?.startsWith('hearth.word-groups.v1.')) localStorage.removeItem(key);
  }
}
function read(home: string) {
  discardLegacyProgress();
  const value = localStorage.getItem(storageKey(home));
  if (value === null) return emptyStore();
  if (value.length > 2_000_000) throw new Error('Progress storage is too large.');
  return StoreSchema.parse(JSON.parse(value));
}
function readForUpdate(home: string): ReturnType<typeof read> {
  try {
    return read(home);
  } catch {
    // Recover only this game's unusable store, never unrelated browser settings.
    return emptyStore();
  }
}
export function readLastGamePuzzle(home: string): string | null {
  try {
    const store = read(home);
    // Old v2 saves ordered detailed attempts by most recently played puzzle.
    return store.lastPuzzleId ?? store.entries[0]?.id ?? null;
  } catch {
    return null;
  }
}
export function rememberGamePuzzle(home: string, puzzleId: string): boolean {
  try {
    const lastPuzzleId = OpaqueIdSchema.parse(puzzleId);
    localStorage.setItem(
      storageKey(home),
      JSON.stringify({ ...readForUpdate(home), lastPuzzleId }),
    );
    return true;
  } catch {
    return false;
  }
}
export function readGameProgress(home: string, puzzle: WordGroupsPuzzle): WordGroupsProgress {
  try {
    const progress = read(home).entries.find((entry) => entry.id === puzzle.id)?.progress;
    if (progress !== undefined && validWordGroupsProgress(puzzle, progress)) return progress;
  } catch {
    /* Missing, blocked or corrupt browser storage must never prevent playing. */
  }
  return newWordGroupsProgress();
}
export function gameOutcome(puzzle: WordGroupsPuzzle, progress: WordGroupsProgress): GameOutcome {
  const summary = wordGroupsSummary(puzzle, progress.attempts);
  return summary.won ? 'completed' : summary.finished ? 'revealed' : 'in-progress';
}
export function readGameOutcomes(home: string): Record<string, GameOutcome> {
  try {
    const store = read(home);
    const outcomes: Record<string, GameOutcome> = Object.fromEntries(
      store.entries.map((entry) => [entry.id, entry.outcome]),
    );
    for (const id of store.completedIds) outcomes[id] = 'completed';
    return outcomes;
  } catch {
    return {};
  }
}
export function saveGameProgress(
  home: string,
  puzzle: WordGroupsPuzzle,
  progress: WordGroupsProgress,
): boolean {
  try {
    const store = readForUpdate(home);
    localStorage.setItem(
      storageKey(home),
      JSON.stringify({
        version: 2,
        lastPuzzleId: puzzle.id,
        completedIds:
          gameOutcome(puzzle, progress) === 'completed'
            ? [puzzle.id, ...store.completedIds.filter((id) => id !== puzzle.id)].slice(0, 5000)
            : store.completedIds,
        entries: [
          { id: puzzle.id, progress, outcome: gameOutcome(puzzle, progress) },
          ...store.entries.filter((entry) => entry.id !== puzzle.id),
        ].slice(0, 2000),
      }),
    );
    return true;
  } catch {
    return false;
  }
}
