import { GameCatalogueSchema, WordGroupsPuzzleSchema } from '@hearth/shared';
import { householdApiBase, request } from './core';

export const gamesApi = {
  catalogue: (signal?: AbortSignal) =>
    request(`${householdApiBase()}/games/word-groups`, GameCatalogueSchema, {
      signal: signal ?? null,
    }),
  puzzle: (id: string, signal?: AbortSignal) =>
    request(
      `${householdApiBase()}/games/word-groups/${encodeURIComponent(id)}`,
      WordGroupsPuzzleSchema,
      { signal: signal ?? null },
    ),
};
