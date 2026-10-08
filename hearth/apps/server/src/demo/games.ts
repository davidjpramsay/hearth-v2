import type { WordGroupsPuzzle } from '@hearth/shared';

// Original test/demo content. No downloaded archive is shipped in source or images.
const groups = [
  { category: 'PARTS OF A BOOK', difficulty: 0, words: ['COVER', 'SPINE', 'INDEX', 'CHAPTER'] },
  { category: 'THINGS YOU CAN DRAW', difficulty: 1, words: ['BATH', 'CURTAIN', 'CARD', 'BREATH'] },
  { category: 'KINDS OF PITCH', difficulty: 2, words: ['SALES', 'MUSICAL', 'BASEBALL', 'ROOF'] },
  { category: '___ LIGHT', difficulty: 3, words: ['TRAFFIC', 'SPOT', 'DAY', 'FLASH'] },
];
export const DEMO_WORD_GROUPS: WordGroupsPuzzle[] = [1, 2, 3].map((number) => ({
  id: `word_groups_demo_${number}`,
  number,
  date: `2026-08-0${number}`,
  groups,
  board: Array.from({ length: 16 }, (_, index) => groups[index % 4]!.words[Math.floor(index / 4)]!),
}));
