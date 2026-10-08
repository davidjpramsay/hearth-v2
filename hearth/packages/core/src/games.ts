import type { WordGroupsProgress, WordGroupsPuzzle } from '@hearth/shared';

export const WORD_GROUPS_MISTAKES = 4;
export function newWordGroupsProgress(): WordGroupsProgress {
  return { attempts: [], order: Array.from({ length: 16 }, (_, index) => index) };
}
const signature = (guess: number[]) => [...guess].sort((a, b) => a - b).join(',');

export function wordGroupsSummary(puzzle: WordGroupsPuzzle, attempts: number[][]) {
  const solved: number[] = [];
  let mistakes = 0;
  const seen = new Set<string>();
  for (const guess of attempts) {
    const key = signature(guess);
    if (seen.has(key)) continue;
    seen.add(key);
    const group = puzzle.groups.findIndex((candidate) =>
      guess.every((index) => candidate.words.includes(puzzle.board[index] ?? '')),
    );
    if (group < 0) mistakes += 1;
    else if (!solved.includes(group)) solved.push(group);
  }
  return {
    solved,
    mistakes,
    finished: solved.length === 4 || mistakes >= WORD_GROUPS_MISTAKES,
    won: solved.length === 4,
  };
}

export function submitWordGroupsGuess(
  puzzle: WordGroupsPuzzle,
  progress: WordGroupsProgress,
  guess: number[],
) {
  const state = wordGroupsSummary(puzzle, progress.attempts);
  if (state.finished) return { progress, feedback: 'finished' as const };
  if (
    guess.length !== 4 ||
    new Set(guess).size !== 4 ||
    guess.some(
      (index) =>
        !Number.isInteger(index) ||
        index < 0 ||
        index > 15 ||
        state.solved.some((group) => puzzle.groups[group]!.words.includes(puzzle.board[index]!)),
    )
  ) {
    return { progress, feedback: 'invalid' as const };
  }
  if (progress.attempts.some((prior) => signature(prior) === signature(guess))) {
    return { progress, feedback: 'repeat' as const };
  }
  const counts = puzzle.groups.map(
    (group) => guess.filter((index) => group.words.includes(puzzle.board[index]!)).length,
  );
  const next = { ...progress, attempts: [...progress.attempts, [...guess]] };
  return {
    progress: next,
    feedback: counts.includes(4)
      ? ('correct' as const)
      : counts.includes(3)
        ? ('one-away' as const)
        : ('incorrect' as const),
  };
}

export function validWordGroupsProgress(
  puzzle: WordGroupsPuzzle,
  progress: WordGroupsProgress,
): boolean {
  let replay = newWordGroupsProgress();
  for (const guess of progress.attempts) {
    const result = submitWordGroupsGuess(puzzle, replay, guess);
    if (result.progress === replay) return false;
    replay = result.progress;
  }
  return true;
}

/** Fisher–Yates keeps selections attached to tile IDs, never to their new position. */
export function shuffleWordGroups(order: number[], random = Math.random): number[] {
  const next = [...order];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const target = Math.min(index, Math.max(0, Math.floor(random() * (index + 1))));
    [next[index], next[target]] = [next[target]!, next[index]!];
  }
  return next;
}
