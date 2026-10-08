import { describe, expect, it } from 'vitest';
import type { WordGroupsPuzzle } from '@hearth/shared';
import {
  newWordGroupsProgress,
  shuffleWordGroups,
  submitWordGroupsGuess,
  validWordGroupsProgress,
  wordGroupsSummary,
} from './games.js';

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

describe('word grouping rules', () => {
  it('finds each group, including an out-of-order guess, then locks the finished game', () => {
    let progress = newWordGroupsProgress();
    for (const group of [3, 0, 2, 1]) {
      const result = submitWordGroupsGuess(
        puzzle,
        progress,
        [3, 0, 2, 1].map((tile) => group * 4 + tile),
      );
      expect(result.feedback).toBe('correct');
      progress = result.progress;
    }
    expect(wordGroupsSummary(puzzle, progress.attempts)).toEqual({
      solved: [3, 0, 2, 1],
      mistakes: 0,
      finished: true,
      won: true,
    });
    expect(submitWordGroupsGuess(puzzle, progress, [0, 1, 4, 5]).progress).toBe(progress);
  });
  it('reports one away and repeating a reordered wrong guess uses no second mistake', () => {
    const initial = newWordGroupsProgress();
    const miss = submitWordGroupsGuess(puzzle, initial, [0, 1, 2, 4]);
    expect(miss.feedback).toBe('one-away');
    const repeat = submitWordGroupsGuess(puzzle, miss.progress, [4, 2, 0, 1]);
    expect(repeat.feedback).toBe('repeat');
    expect(repeat.progress).toBe(miss.progress);
    expect(wordGroupsSummary(puzzle, repeat.progress.attempts).mistakes).toBe(1);
  });
  it('ends after exactly four different misses and leaves solved groups found', () => {
    let progress = submitWordGroupsGuess(
      puzzle,
      newWordGroupsProgress(),
      [12, 13, 14, 15],
    ).progress;
    for (const guess of [
      [0, 1, 4, 5],
      [0, 2, 4, 6],
      [0, 3, 4, 7],
      [1, 2, 5, 6],
    ])
      progress = submitWordGroupsGuess(puzzle, progress, guess).progress;
    expect(wordGroupsSummary(puzzle, progress.attempts)).toEqual({
      solved: [3],
      mistakes: 4,
      finished: true,
      won: false,
    });
    expect(submitWordGroupsGuess(puzzle, progress, [0, 1, 2, 3]).feedback).toBe('finished');
  });
  it.each([
    [0, 1, 2],
    [0, 0, 1, 2],
    [-1, 0, 1, 2],
    [0, 1, 2, 16],
    [0, 1, 2, 0.5],
  ])('rejects invalid guess %j without spending a mistake', (...guess) => {
    const progress = newWordGroupsProgress();
    expect(submitWordGroupsGuess(puzzle, progress, guess).progress).toBe(progress);
  });
  it('rejects reusing a solved tile and replaying an invalid saved history', () => {
    const progress = submitWordGroupsGuess(puzzle, newWordGroupsProgress(), [0, 1, 2, 3]).progress;
    expect(submitWordGroupsGuess(puzzle, progress, [0, 4, 5, 6]).feedback).toBe('invalid');
    expect(validWordGroupsProgress(puzzle, progress)).toBe(true);
    expect(
      validWordGroupsProgress(puzzle, {
        ...progress,
        attempts: [
          [0, 1, 2, 3],
          [0, 4, 5, 6],
        ],
      }),
    ).toBe(false);
  });
  it('shuffles without replacing, losing or mutating any tile identity', () => {
    const order = newWordGroupsProgress().order;
    const shuffled = shuffleWordGroups(order, () => 0);
    expect(shuffled).not.toEqual(order);
    expect([...shuffled].sort((a, b) => a - b)).toEqual(order);
    expect(order).toEqual(Array.from({ length: 16 }, (_, index) => index));
  });
});
