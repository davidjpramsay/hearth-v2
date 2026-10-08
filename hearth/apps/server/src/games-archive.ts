import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { z } from 'zod';
import {
  LocalDateSchema,
  WordGroupSchema,
  WordGroupsPuzzleSchema,
  type GameCatalogue,
  type WordGroupsPuzzle,
} from '@hearth/shared';
import { DEMO_WORD_GROUPS } from './demo/games.js';
import { RepositoryError } from './repository.js';

export const MAX_GAMES_ARCHIVE_BYTES = 10 * 1024 * 1024;
const ArchiveSchema = z
  .array(
    z.object({
      puzzle_number: z.number().int().min(1).max(100_000),
      date: LocalDateSchema,
      starting_board: z.array(z.array(z.string().min(1).max(100)).length(4)).length(4),
      groups: z.array(WordGroupSchema).length(4),
    }),
  )
  .min(1)
  .max(5000);

export function parseGamesArchive(input: unknown): WordGroupsPuzzle[] {
  const archive = ArchiveSchema.parse(input);
  if (
    new Set(archive.map((puzzle) => puzzle.puzzle_number)).size !== archive.length ||
    new Set(archive.map((puzzle) => puzzle.date)).size !== archive.length
  )
    throw new Error('Duplicate puzzle identifier.');
  return archive
    .map((puzzle) => {
      const board = puzzle.starting_board.flat();
      const groups = [...puzzle.groups].sort((a, b) => a.difficulty - b.difficulty);
      const digest = createHash('sha256')
        .update(JSON.stringify({ board, groups }))
        .digest('hex')
        .slice(0, 20);
      return WordGroupsPuzzleSchema.parse({
        id: `word_groups_${puzzle.puzzle_number}_${digest}`,
        number: puzzle.puzzle_number,
        date: puzzle.date,
        board,
        groups,
      });
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

export class GamesArchive {
  private puzzles: WordGroupsPuzzle[] = [];
  private status: GameCatalogue['status'] = 'unconfigured';
  private checkedAt = 0;
  private pending: Promise<void> | null = null;
  constructor(
    private readonly path?: string,
    private readonly demo = false,
  ) {
    if (demo && path === undefined) {
      this.puzzles = [...DEMO_WORD_GROUPS].reverse();
      this.status = 'ready';
    }
  }
  private async refresh(): Promise<void> {
    if (this.path === undefined || Date.now() - this.checkedAt < 60_000) return;
    if (this.pending !== null) return this.pending;
    this.pending = this.load().finally(() => {
      this.checkedAt = Date.now();
      this.pending = null;
    });
    return this.pending;
  }
  private async load(): Promise<void> {
    try {
      if (!isAbsolute(this.path!)) throw new Error('An absolute archive path is required.');
      const file = await open(
        this.path!,
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      );
      try {
        const before = await file.stat();
        if (!before.isFile() || before.size > MAX_GAMES_ARCHIVE_BYTES)
          throw new Error('Archive exceeds its budget.');
        const bytes = Buffer.alloc(before.size + 1);
        let bytesRead = 0;
        while (bytesRead < bytes.length) {
          const chunk = await file.read(bytes, bytesRead, bytes.length - bytesRead, bytesRead);
          if (chunk.bytesRead === 0) break;
          bytesRead += chunk.bytesRead;
        }
        const after = await file.stat();
        if (
          bytesRead !== before.size ||
          after.size !== before.size ||
          after.mtimeMs !== before.mtimeMs
        )
          throw new Error('Archive changed during reading.');
        this.puzzles = parseGamesArchive(JSON.parse(bytes.subarray(0, bytesRead).toString('utf8')));
        this.status = 'ready';
      } finally {
        await file.close();
      }
    } catch (error) {
      const missing =
        typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
      this.status = this.puzzles.length > 0 ? 'stale' : missing ? 'unconfigured' : 'unavailable';
    }
  }
  async catalogue(): Promise<GameCatalogue> {
    await this.refresh();
    return {
      status: this.status,
      source: this.path === undefined && this.demo ? 'original-demo' : 'household-archive',
      puzzles: this.puzzles.map(({ id, number, date }) => ({ id, number, date })),
    };
  }
  async puzzle(id: string): Promise<WordGroupsPuzzle> {
    await this.refresh();
    const puzzle = this.puzzles.find((candidate) => candidate.id === id);
    if (puzzle === undefined)
      throw new RepositoryError('NOT_FOUND', 'That puzzle is not in this archive.');
    return puzzle;
  }
}
