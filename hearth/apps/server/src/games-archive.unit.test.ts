import { mkdtemp, writeFile, rm, symlink, truncate } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEMO_WORD_GROUPS } from './demo/games.js';
import { GamesArchive, MAX_GAMES_ARCHIVE_BYTES, parseGamesArchive } from './games-archive.js';

const folders: string[] = [];
afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(
    folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })),
  );
});
const exported = () =>
  DEMO_WORD_GROUPS.map((puzzle) => ({
    puzzle_number: puzzle.number,
    date: puzzle.date,
    starting_board: [0, 1, 2, 3].map((row) => puzzle.board.slice(row * 4, row * 4 + 4)),
    groups: puzzle.groups,
    source_url: 'https://example.invalid/must-not-fetch',
    title: 'Untrusted source metadata',
  }));
async function fixture() {
  const folder = await mkdtemp(join(tmpdir(), 'hearth-games-'));
  folders.push(folder);
  const path = join(folder, 'archive.json');
  await writeFile(path, JSON.stringify(exported()));
  return { folder, path };
}

describe('local game archive', () => {
  it('preserves boards, sorts dates and excludes paths/source metadata from the catalogue', async () => {
    const { path } = await fixture();
    const source = new GamesArchive(path);
    const catalogue = await source.catalogue();
    expect(catalogue.status).toBe('ready');
    expect(catalogue.puzzles.map((puzzle) => puzzle.number)).toEqual([3, 2, 1]);
    expect(JSON.stringify(catalogue)).not.toContain(path);
    expect(JSON.stringify(catalogue)).not.toContain('source_url');
    const puzzle = await source.puzzle(catalogue.puzzles[2]!.id);
    expect(puzzle.board).toEqual(DEMO_WORD_GROUPS[0]!.board);
    expect(puzzle.groups).toEqual(DEMO_WORD_GROUPS[0]!.groups);
    expect(puzzle.id).toMatch(/^word_groups_1_[0-9a-f]{20}$/);
  });
  it('changes only the changed board identity and rejects duplicate dates/numbers or mismatched groups', () => {
    const originals = exported();
    const parsed = parseGamesArchive(originals);
    const changed = structuredClone(originals);
    [changed[0]!.starting_board[0]![0], changed[0]!.starting_board[0]![1]] = [
      changed[0]!.starting_board[0]![1]!,
      changed[0]!.starting_board[0]![0]!,
    ];
    expect(parseGamesArchive(changed)[2]!.id).not.toBe(parsed[2]!.id);
    expect(parseGamesArchive(changed)[0]!.id).toBe(parsed[0]!.id);
    expect(() => parseGamesArchive([originals[0], originals[0]])).toThrow();
    const bad = structuredClone(originals);
    bad[0]!.groups[0]!.words[0] = 'NOT ON BOARD';
    expect(() => parseGamesArchive(bad)).toThrow();
    const repeated = structuredClone(originals);
    repeated[0]!.groups[0]!.difficulty = 1;
    expect(() => parseGamesArchive(repeated)).toThrow();
  });
  it('fails closed on missing, malformed and oversized archives and does not follow symlinks', async () => {
    const { folder, path } = await fixture();
    const link = join(folder, 'link.json');
    await symlink(path, link);
    for (const source of [new GamesArchive(link), new GamesArchive('relative.json')])
      expect((await source.catalogue()).status).toBe('unavailable');
    expect((await new GamesArchive(join(folder, 'missing')).catalogue()).status).toBe(
      'unconfigured',
    );
    await writeFile(path, '{broken');
    expect((await new GamesArchive(path).catalogue()).status).toBe('unavailable');
    await truncate(path, MAX_GAMES_ARCHIVE_BYTES + 1);
    expect((await new GamesArchive(path).catalogue()).status).toBe('unavailable');
  });
  it('retains a safe archive during an outage and recovers after atomic replacement/cache expiry', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-06T00:00:00Z'));
    const { path } = await fixture();
    const source = new GamesArchive(path);
    const initial = await source.catalogue();
    await writeFile(path, '{broken');
    vi.setSystemTime(new Date('2026-10-06T00:01:01Z'));
    const stale = await source.catalogue();
    expect(stale.status).toBe('stale');
    expect(stale.puzzles).toEqual(initial.puzzles);
    await writeFile(path, JSON.stringify(exported()));
    vi.setSystemTime(new Date('2026-10-06T00:02:02Z'));
    expect((await source.catalogue()).status).toBe('ready');
  });
  it('has no private demo fallback and coalesces simultaneous archive reads', async () => {
    expect(await new GamesArchive().catalogue()).toEqual({
      status: 'unconfigured',
      source: 'household-archive',
      puzzles: [],
    });
    const { path } = await fixture();
    const source = new GamesArchive(path);
    const values = await Promise.all(Array.from({ length: 6 }, () => source.catalogue()));
    expect(values.every((value) => value.status === 'ready' && value.puzzles.length === 3)).toBe(
      true,
    );
    await expect(source.puzzle('puzzle_nonexistent')).rejects.toThrow(
      'That puzzle is not in this archive.',
    );
  });
});
