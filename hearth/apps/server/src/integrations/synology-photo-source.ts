import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, stat, unlink } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import type Database from 'better-sqlite3';
import sharp from 'sharp';

import type { PhotoAsset, PhotoSourceSummary } from '@hearth/shared';

import { SystemClock, type HearthClock } from '../runtime-context.js';
import type {
  PhotoDerivativeAsset,
  PhotoDerivativeVariant,
  PhotoSourceIndexSnapshot,
  PhotoSourceProvider,
  PhotoSourceSnapshot,
} from './photo-source.js';

const SUPPORTED_EXTENSIONS = new Set([
  '.avif',
  '.heic',
  '.heif',
  '.jpeg',
  '.jpg',
  '.png',
  '.tif',
  '.tiff',
  '.webp',
]);
const UNSUPPORTED_IMAGE_EXTENSIONS = new Set(['.bmp', '.gif', '.pdf', '.svg']);
const MAX_SOURCE_FILES = 20_000;
const MAX_SOURCE_DEPTH = 16;
const MAX_SOURCE_BYTES = 120 * 1024 * 1024;
const MAX_INPUT_PIXELS = 120_000_000;
const DERIVATIVE_KEY_PATTERN = /^[a-f0-9]{64}-(display|thumbnail)\.webp$/;

export interface SynologyPhotoSourceConfiguration {
  sourceDirectory: string;
  derivativeDirectory: string;
  collectionName: string;
  scanIntervalMs: number;
}

interface SourceFile {
  absolutePath: string;
  relativePath: string;
  extension: string;
  size: number;
  modifiedAt: string;
}

interface IndexedAsset {
  id: string;
  providerAssetId: string;
  sourceFingerprint: string;
  derivativeKey: string;
  thumbnailKey: string;
  alternativeText: string;
  width: number;
  height: number;
  orientation: 'landscape' | 'portrait' | 'square';
  capturedAt: string | null;
  assetStatus: 'ready' | 'unsupported' | 'corrupt';
  indexedAt: string;
}

interface ExistingAssetRow {
  id: string;
  provider_asset_id: string;
  derivative_key: string;
  thumbnail_key: string;
  source_fingerprint: string | null;
  alternative_text: string;
  width: number;
  height: number;
  orientation: 'landscape' | 'portrait' | 'square';
  captured_at: string | null;
  asset_status: 'ready' | 'unsupported' | 'corrupt';
  indexed_at: string;
}

interface PhotoSourceRow {
  id: string;
  display_name: string;
  status: 'ready' | 'unconfigured' | 'unavailable';
  last_indexed_at: string | null;
}

interface PhotoAssetRow {
  id: string;
  derivative_key: string;
  thumbnail_key: string;
  alternative_text: string;
  width: number;
  height: number;
  orientation: 'landscape' | 'portrait' | 'square';
  captured_at: string | null;
  favourite: number;
}

export class SynologyFolderPhotoSourceProvider implements PhotoSourceProvider {
  private scanPromise: Promise<PhotoSourceSnapshot> | null = null;
  private scanHouseholdId: string | null = null;
  private scanTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly database: InstanceType<typeof Database>,
    private readonly configuration: SynologyPhotoSourceConfiguration,
    private readonly clock: HearthClock = new SystemClock(),
  ) {}

  async listApprovedPhotos(householdId: string): Promise<PhotoSourceSnapshot> {
    this.startScheduledScan(householdId);
    const source = this.source(householdId);
    if (source === null || source.last_indexed_at === null) {
      return this.refreshApprovedPhotos(householdId);
    }
    const age = this.clock.now().getTime() - Date.parse(source.last_indexed_at);
    if (age >= this.configuration.scanIntervalMs && this.scanPromise === null) {
      void this.refreshApprovedPhotos(householdId);
    }
    return this.snapshot(householdId);
  }

  async refreshApprovedPhotos(householdId: string): Promise<PhotoSourceSnapshot> {
    if (this.scanPromise !== null) {
      if (this.scanHouseholdId === householdId) return this.scanPromise;
      await this.scanPromise;
    }
    this.scanHouseholdId = householdId;
    const scan = this.scan(householdId).finally(() => {
      if (this.scanPromise === scan) {
        this.scanPromise = null;
        this.scanHouseholdId = null;
      }
    });
    this.scanPromise = scan;
    return scan;
  }

  async getDerivative(
    householdId: string,
    assetId: string,
    variant: PhotoDerivativeVariant,
  ): Promise<PhotoDerivativeAsset | null> {
    const row = this.database
      .prepare(
        `SELECT a.derivative_key, a.thumbnail_key
         FROM photo_assets a
         JOIN photo_sources s ON s.id = a.source_id
         WHERE s.household_id = ? AND a.id = ? AND a.asset_status = 'ready' AND a.hidden = 0`,
      )
      .get(householdId, assetId) as { derivative_key: string; thumbnail_key: string } | undefined;
    if (row === undefined) return null;
    const key = variant === 'display' ? row.derivative_key : row.thumbnail_key;
    if (!DERIVATIVE_KEY_PATTERN.test(key)) return null;
    const path = this.derivativePath(key);
    try {
      return { bytes: await readFile(path), mimeType: 'image/webp', cacheKey: key };
    } catch {
      return null;
    }
  }

  async close(): Promise<void> {
    if (this.scanTimer !== null) clearInterval(this.scanTimer);
    this.scanTimer = null;
    await this.scanPromise?.catch(() => undefined);
  }

  private async scan(householdId: string): Promise<PhotoSourceSnapshot> {
    const indexedAt = this.clock.now().toISOString();
    this.ensureSource(householdId, indexedAt);
    try {
      await mkdir(this.configuration.derivativeDirectory, { recursive: true });
      const files = await discoverSourceFiles(this.configuration.sourceDirectory);
      const sourceId = sourceIdFor(householdId);
      const existing = this.existingAssets(sourceId);
      const indexed: IndexedAsset[] = [];
      for (const file of files) {
        indexed.push(await this.indexFile(householdId, file, existing, indexedAt));
      }
      const nextProviderIds = new Set(indexed.map((asset) => asset.providerAssetId));
      const removed = [...existing.values()].filter(
        (asset) => !nextProviderIds.has(asset.provider_asset_id),
      );
      this.commitScan(householdId, sourceId, indexed, removed, indexedAt);
      await this.removeObsoleteDerivatives(existing, indexed, removed);
      return this.snapshot(householdId);
    } catch {
      this.database
        .prepare(
          `UPDATE photo_sources
           SET status = 'unavailable', updated_at = ?
           WHERE household_id = ?`,
        )
        .run(indexedAt, householdId);
      return this.snapshot(householdId);
    }
  }

  private async indexFile(
    householdId: string,
    file: SourceFile,
    existing: Map<string, ExistingAssetRow>,
    indexedAt: string,
  ): Promise<IndexedAsset> {
    const providerAssetId = digest(file.relativePath);
    const id = `photo_${digest(`${householdId}:${file.relativePath}`).slice(0, 40)}`;
    const sourceFingerprint = digest(`${file.size}:${file.modifiedAt}`);
    const contentKey = digest(`${providerAssetId}:${sourceFingerprint}`);
    const derivativeKey = `${contentKey}-display.webp`;
    const thumbnailKey = `${contentKey}-thumbnail.webp`;
    const prior = existing.get(providerAssetId);
    if (
      prior !== undefined &&
      prior.source_fingerprint === sourceFingerprint &&
      (prior.asset_status !== 'ready' ||
        ((await fileExists(this.derivativePath(prior.derivative_key))) &&
          (await fileExists(this.derivativePath(prior.thumbnail_key)))))
    ) {
      return assetFromExisting(prior, sourceFingerprint);
    }
    if (UNSUPPORTED_IMAGE_EXTENSIONS.has(file.extension)) {
      return {
        id,
        providerAssetId,
        sourceFingerprint,
        derivativeKey,
        thumbnailKey,
        alternativeText: 'Unsupported image in the approved family folder',
        width: 1,
        height: 1,
        orientation: 'square',
        capturedAt: null,
        assetStatus: 'unsupported',
        indexedAt,
      };
    }
    try {
      const displayTemporary = this.derivativePath(`${derivativeKey}.tmp-${randomUUID()}`);
      const thumbnailTemporary = this.derivativePath(`${thumbnailKey}.tmp-${randomUUID()}`);
      try {
        const displayInfo = await sharp(file.absolutePath, {
          failOn: 'error',
          limitInputPixels: MAX_INPUT_PIXELS,
        })
          .autoOrient()
          .resize({
            width: 3840,
            height: 2160,
            fit: 'inside',
            withoutEnlargement: true,
          })
          .webp({ quality: 84, effort: 4, smartSubsample: true })
          .toFile(displayTemporary);
        await sharp(file.absolutePath, {
          failOn: 'error',
          limitInputPixels: MAX_INPUT_PIXELS,
        })
          .autoOrient()
          .resize({ width: 960, height: 960, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 78, effort: 4, smartSubsample: true })
          .toFile(thumbnailTemporary);
        await rename(displayTemporary, this.derivativePath(derivativeKey));
        await rename(thumbnailTemporary, this.derivativePath(thumbnailKey));
        const width = displayInfo.width;
        const height = displayInfo.height;
        return {
          id,
          providerAssetId,
          sourceFingerprint,
          derivativeKey,
          thumbnailKey,
          alternativeText: familyPhotoAlt(file.modifiedAt),
          width,
          height,
          orientation: orientation(width, height),
          capturedAt: file.modifiedAt,
          assetStatus: 'ready',
          indexedAt,
        };
      } finally {
        await Promise.all([
          rm(displayTemporary, { force: true }),
          rm(thumbnailTemporary, { force: true }),
        ]);
      }
    } catch {
      return {
        id,
        providerAssetId,
        sourceFingerprint,
        derivativeKey,
        thumbnailKey,
        alternativeText: 'Unreadable image in the approved family folder',
        width: 1,
        height: 1,
        orientation: 'square',
        capturedAt: file.modifiedAt,
        assetStatus: 'corrupt',
        indexedAt,
      };
    }
  }

  private commitScan(
    householdId: string,
    sourceId: string,
    assets: IndexedAsset[],
    removed: ExistingAssetRow[],
    indexedAt: string,
  ): void {
    const upsert = this.database.prepare(
      `INSERT INTO photo_assets
        (id, source_id, provider_asset_id, derivative_key, thumbnail_key, alternative_text,
         width, height, orientation, captured_at, favourite, hidden, asset_status, last_shown_at,
         indexed_at, source_fingerprint)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, NULL, ?, ?)
       ON CONFLICT(source_id, provider_asset_id) DO UPDATE SET
         derivative_key = excluded.derivative_key,
         thumbnail_key = excluded.thumbnail_key,
         alternative_text = excluded.alternative_text,
         width = excluded.width,
         height = excluded.height,
         orientation = excluded.orientation,
         captured_at = excluded.captured_at,
         asset_status = excluded.asset_status,
         indexed_at = excluded.indexed_at,
         source_fingerprint = excluded.source_fingerprint`,
    );
    this.database.transaction(() => {
      for (const asset of assets) {
        upsert.run(
          asset.id,
          sourceId,
          asset.providerAssetId,
          asset.derivativeKey,
          asset.thumbnailKey,
          asset.alternativeText,
          asset.width,
          asset.height,
          asset.orientation,
          asset.capturedAt,
          asset.assetStatus,
          asset.indexedAt,
          asset.sourceFingerprint,
        );
      }
      const remove = this.database.prepare(
        'DELETE FROM photo_assets WHERE source_id = ? AND provider_asset_id = ?',
      );
      for (const asset of removed) remove.run(sourceId, asset.provider_asset_id);
      this.database
        .prepare(
          `UPDATE photo_sources
           SET display_name = ?, status = 'ready', last_indexed_at = ?, updated_at = ?
           WHERE id = ? AND household_id = ?`,
        )
        .run(this.configuration.collectionName, indexedAt, indexedAt, sourceId, householdId);
    })();
  }

  private snapshot(householdId: string): PhotoSourceSnapshot {
    const source = this.source(householdId);
    const sourceId = source?.id ?? sourceIdFor(householdId);
    const rows = this.database
      .prepare(
        `SELECT id, derivative_key, thumbnail_key, alternative_text, width, height, orientation,
                captured_at, favourite
         FROM photo_assets
         WHERE source_id = ? AND asset_status = 'ready' AND hidden = 0
         ORDER BY favourite DESC, captured_at DESC, id`,
      )
      .all(sourceId) as PhotoAssetRow[];
    const photos = rows.map((row): PhotoAsset => {
      const base = `/api/v1/households/${householdId}/photo-assets/${row.id}`;
      return {
        id: row.id,
        thumbnailUrl: `${base}/thumbnail?v=${row.thumbnail_key.slice(0, 16)}`,
        displayUrl: `${base}/display?v=${row.derivative_key.slice(0, 16)}`,
        alt: row.alternative_text,
        width: row.width,
        height: row.height,
        orientation: row.orientation,
        capturedAt: row.captured_at,
        favourite: row.favourite === 1,
      };
    });
    const index = this.indexSnapshot(sourceId, photos.length);
    return {
      collectionId: `photo_collection_${digest(householdId).slice(0, 32)}`,
      collectionName: source?.display_name ?? this.configuration.collectionName,
      updatedAt: source?.last_indexed_at ?? null,
      source: sourceSummary(source, index.visiblePhotoCount),
      featuredPhotoId: photos[0]?.id ?? null,
      photos,
      index: { ...index, scanInProgress: this.scanHouseholdId === householdId },
    };
  }

  private indexSnapshot(sourceId: string, visiblePhotoCount: number): PhotoSourceIndexSnapshot {
    const row = this.database
      .prepare(
        `SELECT
           COUNT(*) AS indexed,
           SUM(CASE WHEN asset_status = 'ready' AND hidden = 1 THEN 1 ELSE 0 END) AS hidden,
           SUM(CASE WHEN asset_status = 'unsupported' THEN 1 ELSE 0 END) AS unsupported,
           SUM(CASE WHEN asset_status = 'corrupt' THEN 1 ELSE 0 END) AS corrupt
         FROM photo_assets WHERE source_id = ?`,
      )
      .get(sourceId) as {
      indexed: number;
      hidden: number | null;
      unsupported: number | null;
      corrupt: number | null;
    };
    return {
      scanInProgress: false,
      indexedFileCount: row.indexed,
      visiblePhotoCount,
      hiddenPhotoCount: row.hidden ?? 0,
      unsupportedFileCount: row.unsupported ?? 0,
      corruptFileCount: row.corrupt ?? 0,
    };
  }

  private source(householdId: string): PhotoSourceRow | null {
    return (
      (this.database
        .prepare(
          'SELECT id, display_name, status, last_indexed_at FROM photo_sources WHERE household_id = ?',
        )
        .get(householdId) as PhotoSourceRow | undefined) ?? null
    );
  }

  private ensureSource(householdId: string, now: string): void {
    this.database
      .prepare(
        `INSERT INTO photo_sources
          (id, household_id, provider, display_name, source_config_ref, status, last_indexed_at,
           created_at, updated_at)
         VALUES (?, ?, 'synology-folder', ?, 'environment:approved-photo-folder', 'unconfigured',
                 NULL, ?, ?)
         ON CONFLICT(household_id) DO UPDATE SET display_name = excluded.display_name`,
      )
      .run(sourceIdFor(householdId), householdId, this.configuration.collectionName, now, now);
  }

  private existingAssets(sourceId: string): Map<string, ExistingAssetRow> {
    const rows = this.database
      .prepare(
        `SELECT id, provider_asset_id, derivative_key, thumbnail_key, source_fingerprint,
                alternative_text, width, height, orientation, captured_at, asset_status, indexed_at
         FROM photo_assets WHERE source_id = ?`,
      )
      .all(sourceId) as ExistingAssetRow[];
    return new Map(rows.map((row) => [row.provider_asset_id, row]));
  }

  private async removeObsoleteDerivatives(
    existing: Map<string, ExistingAssetRow>,
    indexed: IndexedAsset[],
    removed: ExistingAssetRow[],
  ): Promise<void> {
    const activeKeys = new Set(
      indexed.flatMap((asset) => [asset.derivativeKey, asset.thumbnailKey]),
    );
    const obsolete = [
      ...removed.flatMap((asset) => [asset.derivative_key, asset.thumbnail_key]),
      ...[...existing.values()].flatMap((asset) => [asset.derivative_key, asset.thumbnail_key]),
    ].filter((key) => DERIVATIVE_KEY_PATTERN.test(key) && !activeKeys.has(key));
    await Promise.all(obsolete.map((key) => unlink(this.derivativePath(key)).catch(ignoreMissing)));
  }

  private derivativePath(key: string): string {
    const root = resolve(this.configuration.derivativeDirectory);
    const path = resolve(root, key);
    if (path !== root && !path.startsWith(`${root}${sep}`)) {
      throw new Error('Photo derivative key left its approved directory.');
    }
    return path;
  }

  private startScheduledScan(householdId: string): void {
    if (this.scanTimer !== null || this.configuration.scanIntervalMs <= 0) return;
    this.scanTimer = setInterval(() => {
      void this.refreshApprovedPhotos(householdId);
    }, this.configuration.scanIntervalMs);
    this.scanTimer.unref();
  }
}

export function resolveSynologyPhotoSourceConfiguration(
  environment: NodeJS.ProcessEnv,
): SynologyPhotoSourceConfiguration | null {
  const sourceDirectory = environment.HEARTH_PHOTO_SOURCE_DIR?.trim();
  if (sourceDirectory === undefined || sourceDirectory === '') return null;
  const derivativeDirectory =
    environment.HEARTH_PHOTO_DERIVATIVE_DIR?.trim() || '/data/photo-derivatives';
  if (!isAbsolute(sourceDirectory) || !isAbsolute(derivativeDirectory)) {
    throw new Error('Hearth photo source and derivative directories must be absolute paths.');
  }
  const source = resolve(sourceDirectory);
  const derivatives = resolve(derivativeDirectory);
  if (
    source === derivatives ||
    derivatives.startsWith(`${source}${sep}`) ||
    source.startsWith(`${derivatives}${sep}`)
  ) {
    throw new Error('Hearth photo source and derivative directories must be separate.');
  }
  const scanMinutes = Number(environment.HEARTH_PHOTO_SCAN_MINUTES ?? '15');
  if (!Number.isInteger(scanMinutes) || scanMinutes < 1 || scanMinutes > 1440) {
    throw new Error('HEARTH_PHOTO_SCAN_MINUTES must be an integer from 1 to 1440.');
  }
  const collectionName = environment.HEARTH_PHOTO_COLLECTION_NAME?.trim() || 'Family photos';
  if (collectionName.length > 100) {
    throw new Error('HEARTH_PHOTO_COLLECTION_NAME must be 100 characters or fewer.');
  }
  return {
    sourceDirectory: source,
    derivativeDirectory: derivatives,
    collectionName,
    scanIntervalMs: scanMinutes * 60_000,
  };
}

async function discoverSourceFiles(root: string): Promise<SourceFile[]> {
  const sourceRoot = resolve(root);
  const rootStats = await stat(sourceRoot);
  if (!rootStats.isDirectory()) throw new Error('Approved photo source is not a directory.');
  const files: SourceFile[] = [];
  const visit = async (directory: string, depth: number): Promise<void> => {
    if (depth > MAX_SOURCE_DEPTH) return;
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (files.length >= MAX_SOURCE_FILES) return;
      if (entry.isSymbolicLink()) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(path, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      const extension = extname(entry.name).toLowerCase();
      if (!SUPPORTED_EXTENSIONS.has(extension) && !UNSUPPORTED_IMAGE_EXTENSIONS.has(extension)) {
        continue;
      }
      const details = await stat(path);
      if (details.size <= 0 || details.size > MAX_SOURCE_BYTES) continue;
      const relativePath = relative(sourceRoot, path).split(sep).join('/');
      if (relativePath.startsWith('../') || relativePath === '..') continue;
      files.push({
        absolutePath: path,
        relativePath,
        extension,
        size: details.size,
        modifiedAt: details.mtime.toISOString(),
      });
    }
  };
  await visit(sourceRoot, 0);
  return files;
}

function sourceSummary(source: PhotoSourceRow | null, visibleCount: number): PhotoSourceSummary {
  if (source?.status === 'unavailable') {
    return {
      kind: 'synology-folder',
      label: 'Synology photos',
      status: 'unavailable',
      message: 'Saved photos remain available while Hearth checks the approved folder.',
    };
  }
  return {
    kind: 'synology-folder',
    label: 'Synology photos',
    status: source?.status ?? 'unconfigured',
    message:
      source?.status === 'ready'
        ? `${visibleCount} approved ${visibleCount === 1 ? 'photo is' : 'photos are'} indexed locally.`
        : 'Choose one approved Synology folder in companion administration.',
  };
}

function assetFromExisting(row: ExistingAssetRow, sourceFingerprint: string): IndexedAsset {
  return {
    id: row.id,
    providerAssetId: row.provider_asset_id,
    sourceFingerprint,
    derivativeKey: row.derivative_key,
    thumbnailKey: row.thumbnail_key,
    alternativeText: row.alternative_text,
    width: row.width,
    height: row.height,
    orientation: row.orientation,
    capturedAt: row.captured_at,
    assetStatus: row.asset_status,
    indexedAt: row.indexed_at,
  };
}

function sourceIdFor(householdId: string): string {
  return `photo_source_${digest(householdId).slice(0, 32)}`;
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function orientation(width: number, height: number): 'landscape' | 'portrait' | 'square' {
  if (width === height) return 'square';
  return width > height ? 'landscape' : 'portrait';
}

function familyPhotoAlt(modifiedAt: string): string {
  const month = new Intl.DateTimeFormat('en-AU', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(modifiedAt));
  return `Family photo from ${month}.`;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch (error) {
    if (isMissingFile(error)) return false;
    throw error;
  }
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT'
  );
}

function ignoreMissing(error: unknown): void {
  if (!isMissingFile(error)) throw error;
}
