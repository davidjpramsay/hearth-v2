import { mkdir, mkdtemp, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';

import { applyMigrations } from '../database.js';
import { FixedClock } from '../runtime-context.js';
import {
  SynologyFolderPhotoSourceProvider,
  resolveSynologyPhotoSourceConfiguration,
  readApprovedPhoto,
} from './synology-photo-source.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('SynologyFolderPhotoSourceProvider', () => {
  it('rejects a substituted FIFO without waiting for a writer', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hearth-photo-fifo-'));
    temporaryDirectories.push(directory);
    const fifo = join(directory, 'replaced.jpg');
    execFileSync('mkfifo', [fifo]);
    await expect(readApprovedPhoto(directory, fifo)).rejects.toThrow(/changed/);
  }, 1000);
  it('reads pinned approved bytes and rejects a substituted ancestor or leaf symlink', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hearth-photo-boundary-'));
    temporaryDirectories.push(directory);
    const source = join(directory, 'source');
    const outside = join(directory, 'outside');
    await mkdir(source);
    await mkdir(outside);
    await writeFile(join(source, 'safe.jpg'), 'approved image bytes');
    await writeFile(join(outside, 'private.jpg'), 'private image bytes');
    expect((await readApprovedPhoto(source, join(source, 'safe.jpg'))).toString()).toBe(
      'approved image bytes',
    );
    await symlink(join(outside, 'private.jpg'), join(source, 'linked.jpg'));
    await symlink(outside, join(source, 'album'));
    await expect(readApprovedPhoto(source, join(source, 'linked.jpg'))).rejects.toThrow(
      /approved folder/,
    );
    await expect(readApprovedPhoto(source, join(source, 'album', 'private.jpg'))).rejects.toThrow(
      /approved folder/,
    );
  });
  it('loads patched libheif and preserves legitimate AVIF upload and folder import', async () => {
    const [major = 0, minor = 0, patch = 0] = (sharp.versions.heif ?? '0.0.0')
      .split('.')
      .map((part) => Number.parseInt(part, 10));
    expect(major * 1_000_000 + minor * 1_000 + patch).toBeGreaterThanOrEqual(1_023_002);
    const fixture = await photoFixture();
    const bytes = await sharp({
      create: { width: 80, height: 48, channels: 3, background: '#426848' },
    })
      .avif()
      .toBuffer();
    const uploaded = await fixture.provider.uploadPhoto('household_photo_test', {
      bytes,
      mimeType: 'image/avif',
      capturedAt: null,
      actorId: 'member_adult',
    });
    expect(uploaded?.photo).toMatchObject({ width: 80, height: 48, source: 'hearth-upload' });
    await writeFile(join(fixture.source, 'family.avif'), bytes);
    const imported = await fixture.provider.refreshApprovedPhotos('household_photo_test');
    expect(imported.index).toMatchObject({
      managedPhotoCount: 1,
      importedPhotoCount: 1,
      corruptFileCount: 0,
    });
    await fixture.close();
  });

  it('indexes orientation-correct derivatives without exposing source paths', async () => {
    const fixture = await photoFixture();
    await writeFile(
      join(fixture.source, 'landscape.jpg'),
      await sharp({
        create: { width: 1200, height: 700, channels: 3, background: '#6b8f71' },
      })
        .jpeg()
        .toBuffer(),
    );
    await writeFile(
      join(fixture.source, 'portrait.jpg'),
      await sharp({
        create: { width: 600, height: 1000, channels: 3, background: '#b8755e' },
      })
        .jpeg()
        .toBuffer(),
    );
    await writeFile(join(fixture.source, 'broken.jpg'), 'not an image');
    await writeFile(join(fixture.source, 'animated.gif'), 'not supported');
    await symlink(join(fixture.source, 'landscape.jpg'), join(fixture.source, 'linked.jpg'));

    const snapshot = await fixture.provider.refreshApprovedPhotos('household_photo_test');

    expect(snapshot.photos.map((photo) => photo.orientation).sort()).toEqual([
      'landscape',
      'portrait',
    ]);
    expect(snapshot.index).toMatchObject({
      indexedFileCount: 4,
      visiblePhotoCount: 2,
      unsupportedFileCount: 1,
      corruptFileCount: 1,
    });
    expect(JSON.stringify(snapshot)).not.toContain(fixture.source);
    expect(snapshot.photos.every((photo) => photo.displayUrl.startsWith('/api/v1/'))).toBe(true);

    const photo = snapshot.photos[0]!;
    const derivative = await fixture.provider.getDerivative(
      'household_photo_test',
      photo.id,
      'display',
    );
    expect(derivative?.mimeType).toBe('image/webp');
    expect((await sharp(derivative!.bytes).metadata()).format).toBe('webp');
    await fixture.close();
  });

  it('ignores protected Synology metadata and recycle directories', async () => {
    const fixture = await photoFixture();
    await writeFile(
      join(fixture.source, 'family.jpg'),
      await sharp({ create: { width: 900, height: 600, channels: 3, background: '#748c7a' } })
        .jpeg()
        .toBuffer(),
    );
    for (const directoryName of ['@eaDir', '#recycle']) {
      const directory = join(fixture.source, directoryName);
      await mkdir(directory);
      await writeFile(join(directory, 'private-metadata.jpg'), 'not a family photo');
    }

    const snapshot = await fixture.provider.refreshApprovedPhotos('household_photo_test');

    expect(snapshot.source.status).toBe('ready');
    expect(snapshot.photos).toHaveLength(1);
    expect(snapshot.index).toMatchObject({
      indexedFileCount: 1,
      visiblePhotoCount: 1,
      corruptFileCount: 0,
    });
    await fixture.close();
  });

  it('keeps versioned derivatives stable until a file changes and retains cache when unavailable', async () => {
    const fixture = await photoFixture();
    const path = join(fixture.source, 'family.png');
    await writeFile(
      path,
      await sharp({ create: { width: 800, height: 500, channels: 3, background: '#7799bb' } })
        .png()
        .toBuffer(),
    );
    const first = await fixture.provider.refreshApprovedPhotos('household_photo_test');
    const stable = await fixture.provider.refreshApprovedPhotos('household_photo_test');
    expect(stable.photos[0]?.displayUrl).toBe(first.photos[0]?.displayUrl);

    await writeFile(
      path,
      await sharp({ create: { width: 500, height: 800, channels: 3, background: '#aa7755' } })
        .png()
        .toBuffer(),
    );
    const changed = await fixture.provider.refreshApprovedPhotos('household_photo_test');
    expect(changed.photos[0]?.displayUrl).not.toBe(first.photos[0]?.displayUrl);
    expect(changed.photos[0]?.orientation).toBe('portrait');

    await rm(fixture.source, { recursive: true });
    const unavailable = await fixture.provider.refreshApprovedPhotos('household_photo_test');
    expect(unavailable.source.status).toBe('ready');
    expect(unavailable.index.folderImport.status).toBe('unavailable');
    expect(unavailable.photos).toHaveLength(1);
    expect(JSON.stringify(unavailable)).not.toMatch(/ENOENT|hearth-photo-source|\/private\//);
    await fixture.close();
  });

  it('persists favourite and hidden choices across incremental rescans', async () => {
    const fixture = await photoFixture();
    await writeFile(
      join(fixture.source, 'family.jpg'),
      await sharp({ create: { width: 900, height: 600, channels: 3, background: '#748c7a' } })
        .jpeg()
        .toBuffer(),
    );
    const indexed = await fixture.provider.refreshApprovedPhotos('household_photo_test');
    const photo = indexed.photos[0]!;

    const unfavourited = await fixture.provider.curatePhoto(
      'household_photo_test',
      photo.id,
      'unfavourite',
    );
    expect(unfavourited?.curation[0]).toMatchObject({ favourite: false, hidden: false });
    const hidden = await fixture.provider.curatePhoto('household_photo_test', photo.id, 'hide');
    expect(hidden).toMatchObject({
      photos: [],
      index: { visiblePhotoCount: 0, hiddenPhotoCount: 1 },
    });
    expect(hidden?.curation[0]).toMatchObject({ favourite: false, hidden: true });
    expect(
      await fixture.provider.getDerivative('household_photo_test', photo.id, 'thumbnail'),
    ).not.toBeNull();

    const rescanned = await fixture.provider.refreshApprovedPhotos('household_photo_test');
    expect(rescanned.photos).toHaveLength(0);
    expect(rescanned.curation[0]).toMatchObject({ favourite: false, hidden: true });
    const restored = await fixture.provider.curatePhoto('household_photo_test', photo.id, 'unhide');
    expect(restored?.photos[0]).toMatchObject({ id: photo.id, favourite: false });
    await fixture.close();
  });

  it('stores managed uploads privately, preserves portrait orientation and deduplicates content', async () => {
    const fixture = await photoFixture();
    const bytes = await sharp({
      create: { width: 600, height: 1000, channels: 3, background: '#8d6f83' },
    })
      .jpeg()
      .toBuffer();

    const first = await fixture.provider.uploadPhoto('household_photo_test', {
      bytes,
      mimeType: 'image/jpeg',
      capturedAt: '2026-08-08T04:30:00.000Z',
      actorId: 'member_adult',
    });
    const duplicate = await fixture.provider.uploadPhoto('household_photo_test', {
      bytes,
      mimeType: 'image/jpeg',
      capturedAt: '2026-08-08T04:30:00.000Z',
      actorId: 'member_adult',
    });

    expect(first).toMatchObject({
      duplicate: false,
      photo: { orientation: 'portrait', width: 600, height: 1000 },
      snapshot: {
        index: { managedPhotoCount: 1, importedPhotoCount: 0 },
        source: { kind: 'hearth-managed', status: 'ready' },
      },
    });
    expect(duplicate).toMatchObject({ duplicate: true, photo: { id: first?.photo.id } });
    expect(duplicate?.snapshot.curation).toHaveLength(1);
    expect(JSON.stringify(first)).not.toContain(fixture.uploads);

    await expect(
      fixture.provider.uploadPhoto('household_photo_test', {
        bytes: new Uint8Array([1, 2, 3]),
        mimeType: 'image/jpeg',
        capturedAt: null,
        actorId: 'member_adult',
      }),
    ).resolves.toBeNull();

    const rescanned = await fixture.provider.refreshApprovedPhotos('household_photo_test');
    expect(rescanned.curation).toHaveLength(1);
    expect(rescanned.index.managedPhotoCount).toBe(1);
    expect(first?.photo).toMatchObject({
      source: 'hearth-upload',
      canDeletePermanently: true,
    });
    expect(await readdir(fixture.uploads)).toHaveLength(1);
    expect(await readdir(fixture.derivatives)).toHaveLength(2);

    const deleted = await fixture.provider.deleteManagedPhoto(
      'household_photo_test',
      first!.photo.id,
    );
    expect(deleted).toMatchObject({
      kind: 'deleted',
      snapshot: { index: { managedPhotoCount: 0 }, curation: [] },
    });
    expect(await readdir(fixture.uploads)).toHaveLength(0);
    expect(await readdir(fixture.derivatives)).toHaveLength(0);
    await fixture.close();
  });

  it('keeps imported originals source-controlled while allowing Hearth curation', async () => {
    const fixture = await photoFixture();
    await writeFile(
      join(fixture.source, 'family.jpg'),
      await sharp({ create: { width: 900, height: 600, channels: 3, background: '#748c7a' } })
        .jpeg()
        .toBuffer(),
    );
    const indexed = await fixture.provider.refreshApprovedPhotos('household_photo_test');
    expect(indexed.curation[0]).toMatchObject({
      source: 'synology-folder',
      canDeletePermanently: false,
    });

    const deletion = await fixture.provider.deleteManagedPhoto(
      'household_photo_test',
      indexed.curation[0]!.id,
    );
    expect(deletion).toEqual({ kind: 'not-managed' });
    expect(await readdir(fixture.source)).toEqual(['family.jpg']);
    await fixture.close();
  });

  it('requires absolute, separate source and derivative locations', () => {
    expect(resolveSynologyPhotoSourceConfiguration({})).toMatchObject({
      sourceDirectory: null,
      derivativeDirectory: '/data/photo-derivatives',
      uploadDirectory: '/data/photo-uploads',
    });
    expect(() =>
      resolveSynologyPhotoSourceConfiguration({
        HEARTH_PHOTO_SOURCE_DIR: '/photos',
        HEARTH_PHOTO_DERIVATIVE_DIR: '/photos/derived',
      }),
    ).toThrow(/separate/);
    expect(() =>
      resolveSynologyPhotoSourceConfiguration({
        HEARTH_PHOTO_SOURCE_DIR: 'photos',
        HEARTH_PHOTO_DERIVATIVE_DIR: '/data/derived',
      }),
    ).toThrow(/absolute/);
  });
});

async function photoFixture() {
  const directory = await mkdtemp(join(tmpdir(), 'hearth-photo-source-'));
  temporaryDirectories.push(directory);
  const source = join(directory, 'source');
  const derivatives = join(directory, 'derivatives');
  const uploads = join(directory, 'uploads');
  await writeFile(join(directory, '.keep'), 'fixture');
  await mkdir(source);
  const database = new Database(join(directory, 'hearth.sqlite'));
  applyMigrations(database);
  database
    .prepare(
      `INSERT INTO households
       (id, name, timezone, locale, week_starts_on, created_at, updated_at)
       VALUES ('household_photo_test', 'Photo test', 'Australia/Perth', 'en-AU', 1, ?, ?)`,
    )
    .run('2026-08-09T00:00:00.000Z', '2026-08-09T00:00:00.000Z');
  const provider = new SynologyFolderPhotoSourceProvider(
    database,
    {
      sourceDirectory: source,
      derivativeDirectory: derivatives,
      uploadDirectory: uploads,
      collectionName: 'Approved family photos',
      scanIntervalMs: 0,
    },
    new FixedClock('2026-08-09T10:00:00.000Z'),
  );
  return {
    source,
    derivatives,
    uploads,
    provider,
    close: async () => {
      await provider.close();
      database.close();
    },
  };
}
