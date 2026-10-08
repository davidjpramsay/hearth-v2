import { z } from 'zod';
import { LocalDateSchema, OpaqueIdSchema } from './schemas.js';

const TileSchema = z.string().min(1).max(100);
export const WordGroupSchema = z.object({
  category: z.string().min(1).max(160),
  difficulty: z.number().int().min(0).max(3),
  words: z.array(TileSchema).length(4),
});
export const WordGroupsPuzzleIdentitySchema = z.object({
  id: OpaqueIdSchema,
  number: z.number().int().min(1).max(100_000),
  date: LocalDateSchema,
});
export const WordGroupsPuzzleSchema = WordGroupsPuzzleIdentitySchema.extend({
  board: z.array(TileSchema).length(16),
  groups: z.array(WordGroupSchema).length(4),
}).superRefine((puzzle, context) => {
  const words = puzzle.groups.flatMap((group) => group.words);
  if (
    new Set(puzzle.board).size !== 16 ||
    new Set(words).size !== 16 ||
    words.some((word) => !puzzle.board.includes(word)) ||
    new Set(puzzle.groups.map((group) => group.difficulty)).size !== 4
  ) {
    context.addIssue({
      code: 'custom',
      message: 'A puzzle needs sixteen distinct tiles in four complete groups.',
    });
  }
});
export const GameCatalogueSchema = z.object({
  status: z.enum(['ready', 'stale', 'unconfigured', 'unavailable']),
  source: z.enum(['household-archive', 'original-demo']),
  puzzles: z.array(WordGroupsPuzzleIdentitySchema).max(5000),
});
const GuessSchema = z
  .array(z.number().int().min(0).max(15))
  .length(4)
  .refine((guess) => new Set(guess).size === 4);
export const WordGroupsProgressSchema = z.object({
  attempts: z.array(GuessSchema).max(8),
  order: z
    .array(z.number().int().min(0).max(15))
    .length(16)
    .refine((order) => new Set(order).size === 16),
});
export type WordGroup = z.infer<typeof WordGroupSchema>;
export type WordGroupsPuzzle = z.infer<typeof WordGroupsPuzzleSchema>;
export type GameCatalogue = z.infer<typeof GameCatalogueSchema>;
export type WordGroupsProgress = z.infer<typeof WordGroupsProgressSchema>;
