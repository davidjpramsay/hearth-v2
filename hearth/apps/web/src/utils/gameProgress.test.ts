import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WordGroupsPuzzle } from '@hearth/shared';
import { newWordGroupsProgress } from '@hearth/core';
import {
  readGameOutcomes,
  readGameProgress,
  readLastGamePuzzle,
  rememberGamePuzzle,
  saveGameProgress,
} from './gameProgress';

const board = Array.from({ length: 16 }, (_, index) => `TILE ${index}`);
const puzzle: WordGroupsPuzzle = {
  id: 'word_groups_test',
  number: 1,
  date: '2026-08-01',
  board,
  groups: [0, 1, 2, 3].map((difficulty) => ({
    category: `GROUP ${difficulty}`,
    difficulty,
    words: board.slice(difficulty * 4, difficulty * 4 + 4),
  })),
};
beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    get length() {
      return values.size;
    },
    key: vi.fn((index: number) => [...values.keys()][index] ?? null),
    removeItem: vi.fn((key: string) => values.delete(key)),
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe('device-local game progress', () => {
  it('remembers untouched puzzle choices without replacing progress or completion markers', () => {
    const progress = { ...newWordGroupsProgress(), attempts: [[0, 1, 2, 3]] };
    saveGameProgress('demo.home_a', puzzle, progress);
    expect(rememberGamePuzzle('demo.home_a', 'word_groups_other')).toBe(true);
    expect(readLastGamePuzzle('demo.home_a')).toBe('word_groups_other');
    expect(readGameProgress('demo.home_a', puzzle)).toEqual(progress);
    expect(readLastGamePuzzle('private.home_a')).toBeNull();
    expect(readLastGamePuzzle('demo.home_b')).toBeNull();
    expect(readGameOutcomes('demo.home_a').word_groups_other).toBeUndefined();
    expect(localStorage.getItem('hearth.word-groups.v2.demo.home_a')).not.toContain('TILE');
    saveGameProgress('demo.home_a', puzzle, progress);
    expect(readLastGamePuzzle('demo.home_a')).toBe(puzzle.id);
  });
  it('uses the most recent old v2 attempt without resetting existing saves', () => {
    localStorage.setItem(
      'hearth.word-groups.v2.home_a',
      JSON.stringify({
        version: 2,
        completedIds: ['word_groups_complete'],
        entries: [
          {
            id: puzzle.id,
            progress: newWordGroupsProgress(),
            outcome: 'in-progress',
          },
        ],
      }),
    );
    expect(readLastGamePuzzle('home_a')).toBe(puzzle.id);
    rememberGamePuzzle('home_a', 'word_groups_other');
    expect(readGameOutcomes('home_a').word_groups_complete).toBe('completed');
    expect(readGameProgress('home_a', puzzle)).toEqual(newWordGroupsProgress());
  });
  it('ignores an invalid optional pointer without losing valid v2 progress', () => {
    const progress = { ...newWordGroupsProgress(), attempts: [[0, 1, 2, 3]] };
    saveGameProgress('home_a', puzzle, progress);
    const store = JSON.parse(localStorage.getItem('hearth.word-groups.v2.home_a')!);
    localStorage.setItem(
      'hearth.word-groups.v2.home_a',
      JSON.stringify({ ...store, lastPuzzleId: { bad: true } }),
    );
    expect(readLastGamePuzzle('home_a')).toBe(puzzle.id);
    expect(readGameProgress('home_a', puzzle)).toEqual(progress);
    expect(rememberGamePuzzle('home_a', '')).toBe(false);
    expect(readGameProgress('home_a', puzzle)).toEqual(progress);
  });
  it('safely handles missing, corrupt, oversized and blocked selection storage', () => {
    expect(readLastGamePuzzle('home_a')).toBeNull();
    for (const value of ['broken', 'x'.repeat(2_000_001)]) {
      localStorage.setItem('hearth.word-groups.v2.home_a', value);
      expect(readLastGamePuzzle('home_a')).toBeNull();
      expect(rememberGamePuzzle('home_a', puzzle.id)).toBe(true);
      expect(readLastGamePuzzle('home_a')).toBe(puzzle.id);
    }
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('Blocked');
    });
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('Quota');
    });
    expect(readLastGamePuzzle('home_a')).toBeNull();
    expect(rememberGamePuzzle('home_a', puzzle.id)).toBe(false);
  });
  it('restores valid numeric guesses/order without storing answers or crossing homes/puzzles', () => {
    const progress = {
      ...newWordGroupsProgress(),
      attempts: [
        [0, 1, 2, 3],
        [4, 5, 6, 8],
      ],
    };
    expect(saveGameProgress('home_a', puzzle, progress)).toBe(true);
    expect(readGameProgress('home_a', puzzle)).toEqual(progress);
    expect(readGameProgress('home_b', puzzle)).toEqual(newWordGroupsProgress());
    expect(readGameProgress('home_a', { ...puzzle, id: 'word_groups_changed' })).toEqual(
      newWordGroupsProgress(),
    );
    expect(localStorage.getItem('hearth.word-groups.v2.home_a')).not.toContain('TILE');
  });
  it('rejects duplicate or solved-tile histories and malformed storage', () => {
    saveGameProgress('home_a', puzzle, {
      ...newWordGroupsProgress(),
      attempts: [
        [0, 1, 2, 3],
        [0, 4, 5, 6],
      ],
    });
    expect(readGameProgress('home_a', puzzle)).toEqual(newWordGroupsProgress());
    localStorage.setItem('hearth.word-groups.v2.home_a', 'broken');
    expect(readGameProgress('home_a', puzzle)).toEqual(newWordGroupsProgress());
    expect(saveGameProgress('home_a', puzzle, newWordGroupsProgress())).toBe(true);
  });
  it('plays with blocked browser storage and reports that persistence failed', () => {
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('Blocked');
    });
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('Quota');
    });
    expect(readGameProgress('home_a', puzzle)).toEqual(newWordGroupsProgress());
    expect(saveGameProgress('home_a', puzzle, newWordGroupsProgress())).toBe(false);
  });
  it('remembers completion independently of replay progress and household', () => {
    const complete = {
      ...newWordGroupsProgress(),
      attempts: [
        [0, 1, 2, 3],
        [4, 5, 6, 7],
        [8, 9, 10, 11],
        [12, 13, 14, 15],
      ],
    };
    expect(saveGameProgress('home_a', puzzle, complete)).toBe(true);
    expect(readGameOutcomes('home_a')[puzzle.id]).toBe('completed');
    expect(readGameOutcomes('home_b')[puzzle.id]).toBeUndefined();
    saveGameProgress('home_a', puzzle, newWordGroupsProgress());
    expect(readGameProgress('home_a', puzzle)).toEqual(newWordGroupsProgress());
    expect(readGameOutcomes('home_a')[puzzle.id]).toBe('completed');
  });
  it('resets all v1 Games keys but preserves unrelated settings and new completions', () => {
    localStorage.setItem('hearth.word-groups.v1.home_a', 'old');
    localStorage.setItem('hearth.word-groups.v1.home_b', 'old');
    localStorage.setItem('hearth.appearance.v1', 'keep');
    localStorage.setItem('other-app-state', 'keep too');
    expect(readGameOutcomes('home_a')).toEqual({});
    expect(localStorage.getItem('hearth.word-groups.v1.home_a')).toBeNull();
    expect(localStorage.getItem('hearth.word-groups.v1.home_b')).toBeNull();
    expect(localStorage.getItem('hearth.appearance.v1')).toBe('keep');
    expect(localStorage.getItem('other-app-state')).toBe('keep too');
    const complete = {
      ...newWordGroupsProgress(),
      attempts: [
        [0, 1, 2, 3],
        [4, 5, 6, 7],
        [8, 9, 10, 11],
        [12, 13, 14, 15],
      ],
    };
    saveGameProgress('home_a', puzzle, complete);
    expect(readGameOutcomes('home_a')[puzzle.id]).toBe('completed');
    expect(readGameOutcomes('home_a')[puzzle.id]).toBe('completed');
  });
  it('keeps completion when the detailed recent attempt has been evicted', () => {
    localStorage.setItem(
      'hearth.word-groups.v2.home_a',
      JSON.stringify({ version: 2, completedIds: [puzzle.id], entries: [] }),
    );
    expect(readGameOutcomes('home_a')[puzzle.id]).toBe('completed');
    expect(readGameProgress('home_a', puzzle)).toEqual(newWordGroupsProgress());
  });
});
