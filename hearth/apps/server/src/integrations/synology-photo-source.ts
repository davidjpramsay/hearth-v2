import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import type Database from 'better-sqlite3';
import sharp, { type OutputInfo } from 'sharp';

import type {
  PhotoAsset,
  PhotoCurationAction,
  PhotoCurationAsset,
  PhotoSourceSummary,
} from '@hearth/shared';

import { SystemClock, type HearthClock } from '../runtime-context.js';
import type {
  PhotoDerivativeAsset,
  PhotoDerivativeVariant,
  PhotoSourceIndexSnapshot,
  PhotoSourceDeletion,
  PhotoSourceProvider,
  PhotoSourceSnapshot,
  PhotoSourceUpload,
  PhotoUploadInput,
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
const IGNORED_SOURCE_DIRECTORIES = new Set(['@eaDir', '#recycle']);
export const MAX_MANAGED_PHOTO_BYTES = 25 * 1024 * 1024;
const MAX_INPUT_PIXELS = 120_000_000;
const DERIVATIVE_KEY_PATTERN = /^[a-f0-9]{64}-(display|thumbnail)\.webp$/;
const MASTER_KEY_PATTERN = /^[a-f0-9]{64}-master\.webp$/;
const ACCEPTED_UPLOAD_MIME_TYPES = new Set([
  'image/avif',
  'image/heic',
  'image/heif',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/tif',
  'image/tiff',
  'image/webp',
  'image/x-heic',
  'image/x-heif',
]);
const ACCEPTED_UPLOAD_IMAGE_FORMATS = new Set(['avif', 'heif', 'jpeg', 'png', 'tiff', 'webp']);

export interface SynologyPhotoSourceConfiguration {
  sourceDirectory: string | null;
  derivativeDirectory: string;
  uploadDirectory: string;
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

interface FolderImportRow {
  status: 'ready' | 'unconfigured' | 'unavailable';
  last_checked_at: string | null;
  imported_photo_count: number;
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
  hidden: number;
  managed_master_key: string | null;
}

interface ManagedDeletionRow {
  derivative_key: string;
  thumbnail_key: string;
  master_key: string | null;
}

export class SynologyFolderPhotoSourceProvider implements PhotoSourceProvider {
  private scanPromise: Promise<PhotoSourceSnapshot> | null = null;
  private scanHouseholdId: string | null = null;
  private scanTimer: ReturnType<typeof setInterval> | null = null;
  private uploadPromise: Promise<PhotoSourceUpload | null> | null = null;

  constructor(
    private readonly database: InstanceType<typeof Database>,
    private readonly configuration: SynologyPhotoSourceConfiguration,
    private readonly clock: HearthClock = new SystemClock(),
  ) {}

  async listApprovedPhotos(householdId: string): Promise<PhotoSourceSnapshot> {
    await this.prepareManagedStorage(householdId);
    this.startScheduledScan(householdId);
    const source = this.source(householdId);
    if (
      this.configuration.sourceDirectory !== null &&
      (source === null || this.folderImport(householdId).last_checked_at === null)
    ) {
      return this.refreshApprovedPhotos(householdId);
    }
    const lastCheckedAt = this.folderImport(householdId).last_checked_at;
    const age = lastCheckedAt === null ? 0 : this.clock.now().getTime() - Date.parse(lastCheckedAt);
    if (
      this.configuration.sourceDirectory !== null &&
      age >= this.configuration.scanIntervalMs &&
      this.scanPromise === null
    ) {
      void this.refreshApprovedPhotos(householdId);
    }
    return this.snapshot(householdId);
  }

  async refreshApprovedPhotos(householdId: string): Promise<PhotoSourceSnapshot> {
    await this.prepareManagedStorage(householdId);
    if (this.configuration.sourceDirectory === null) return this.snapshot(householdId);
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

  async uploadPhoto(
    householdId: string,
    input: PhotoUploadInput,
  ): Promise<PhotoSourceUpload | null> {
    if (this.uploadPromise !== null) {
      await this.uploadPromise;
    }
    const upload = this.runUploadPhoto(householdId, input).finally(() => {
      if (this.uploadPromise === upload) this.uploadPromise = null;
    });
    this.uploadPromise = upload;
    return upload;
  }

  private async runUploadPhoto(
    householdId: string,
    input: PhotoUploadInput,
  ): Promise<PhotoSourceUpload | null> {
    if (
      input.bytes.byteLength === 0 ||
      input.bytes.byteLength > MAX_MANAGED_PHOTO_BYTES ||
      !ACCEPTED_UPLOAD_MIME_TYPES.has(input.mimeType.toLowerCase())
    ) {
      return null;
    }
    await this.prepareManagedStorage(householdId);
    const uploadedAt = this.clock.now().toISOString();
    const capturedAt = input.capturedAt ?? uploadedAt;
    let master: { data: Buffer; info: OutputInfo };
    try {
      const metadata = await sharp(input.bytes, {
        failOn: 'error',
        limitInputPixels: MAX_INPUT_PIXELS,
      }).metadata();
      if (metadata.format === undefined || !ACCEPTED_UPLOAD_IMAGE_FORMATS.has(metadata.format)) {
        return null;
      }
      master = await sharp(input.bytes, {
        failOn: 'error',
        limitInputPixels: MAX_INPUT_PIXELS,
      })
        .autoOrient()
        .resize({ width: 7680, height: 7680, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 92, effort: 4, smartSubsample: true })
        .toBuffer({ resolveWithObject: true });
    } catch {
      return null;
    }
    const contentHash = createHash('sha256').update(master.data).digest('hex');
    const existing = this.database
      .prepare(
        `SELECT a.id
         FROM photo_managed_uploads u
         JOIN photo_assets a ON a.id = u.asset_id
         WHERE u.household_id = ? AND u.content_hash = ?`,
      )
      .get(householdId, contentHash) as { id: string } | undefined;
    if (existing !== undefined) {
      const snapshot = this.snapshot(householdId);
      const photo = snapshot.curation.find((asset) => asset.id === existing.id);
      return photo === undefined ? null : { snapshot, photo, duplicate: true };
    }

    const masterKey = `${contentHash}-master.webp`;
    const derivativeKey = `${contentHash}-display.webp`;
    const thumbnailKey = `${contentHash}-thumbnail.webp`;
    const masterTemporaryKey = `${masterKey}.tmp-${randomUUID()}`;
    const displayTemporaryKey = `${derivativeKey}.tmp-${randomUUID()}`;
    const thumbnailTemporaryKey = `${thumbnailKey}.tmp-${randomUUID()}`;
    const masterTemporary = this.managedPath(masterTemporaryKey);
    const displayTemporary = this.derivativePath(displayTemporaryKey);
    const thumbnailTemporary = this.derivativePath(thumbnailTemporaryKey);
    try {
      await writeFile(masterTemporary, master.data, { flag: 'wx' });
      const displayInfo = await sharp(master.data)
        .resize({ width: 3840, height: 2160, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 84, effort: 4, smartSubsample: true })
        .toFile(displayTemporary);
      await sharp(master.data)
        .resize({ width: 960, height: 960, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 78, effort: 4, smartSubsample: true })
        .toFile(thumbnailTemporary);
      await Promise.all([
        rename(masterTemporary, this.managedPath(masterKey)),
        rename(displayTemporary, this.derivativePath(derivativeKey)),
        rename(thumbnailTemporary, this.derivativePath(thumbnailKey)),
      ]);
      const assetId = `photo_${digest(`${householdId}:managed:${contentHash}`).slice(0, 40)}`;
      const sourceId = sourceIdFor(householdId);
      const uploadId = `photo_upload_${randomUUID().replaceAll('-', '_')}`;
      this.database.transaction(() => {
        this.database
          .prepare(
            `INSERT INTO photo_assets
              (id, source_id, provider_asset_id, derivative_key, thumbnail_key, alternative_text,
               width, height, orientation, captured_at, favourite, hidden, asset_status,
               last_shown_at, indexed_at, source_fingerprint)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, 'ready', NULL, ?, ?)`,
          )
          .run(
            assetId,
            sourceId,
            `managed:${contentHash}`,
            derivativeKey,
            thumbnailKey,
            familyPhotoAlt(capturedAt),
            displayInfo.width,
            displayInfo.height,
            orientation(displayInfo.width, displayInfo.height),
            capturedAt,
            uploadedAt,
            contentHash,
          );
        this.database
          .prepare(
            `INSERT INTO photo_managed_uploads
              (id, household_id, asset_id, master_key, content_hash, byte_size, uploaded_at,
               uploaded_by, source_channel)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'companion')`,
          )
          .run(
            uploadId,
            householdId,
            assetId,
            masterKey,
            contentHash,
            master.data.byteLength,
            uploadedAt,
            input.actorId,
          );
        this.database
          .prepare(
            `UPDATE photo_sources
             SET status = 'ready', last_indexed_at = ?, updated_at = ?
             WHERE id = ? AND household_id = ?`,
          )
          .run(uploadedAt, uploadedAt, sourceId, householdId);
      })();
      const snapshot = this.snapshot(householdId);
      const photo = snapshot.curation.find((asset) => asset.id === assetId);
      return photo === undefined ? null : { snapshot, photo, duplicate: false };
    } catch (error) {
      await Promise.all([
        rm(masterTemporary, { force: true }),
        rm(displayTemporary, { force: true }),
        rm(thumbnailTemporary, { force: true }),
        rm(this.managedPath(masterKey), { force: true }),
        rm(this.derivativePath(derivativeKey), { force: true }),
        rm(this.derivativePath(thumbnailKey), { force: true }),
      ]);
      throw error;
    }
  }

  async curatePhoto(
    householdId: string,
    assetId: string,
    action: PhotoCurationAction,
  ): Promise<PhotoSourceSnapshot | null> {
    const row = this.database
      .prepare(
        `SELECT a.id
         FROM photo_assets a
         JOIN photo_sources s ON s.id = a.source_id
         WHERE s.household_id = ? AND a.id = ? AND a.asset_status = 'ready'`,
      )
      .get(householdId, assetId);
    if (row === undefined) return null;
    const value = action === 'favourite' || action === 'hide' ? 1 : 0;
    const statement =
      action === 'favourite' || action === 'unfavourite'
        ? 'UPDATE photo_assets SET favourite = ? WHERE id = ?'
        : 'UPDATE photo_assets SET hidden = ? WHERE id = ?';
    this.database.prepare(statement).run(value, assetId);
    return this.snapshot(householdId);
  }

  async deleteManagedPhoto(
    householdId: string,
    assetId: string,
  ): Promise<PhotoSourceDeletion | null> {
    const row = this.database
      .prepare(
        `SELECT a.derivative_key, a.thumbnail_key, u.master_key
         FROM photo_assets a
         JOIN photo_sources s ON s.id = a.source_id
         LEFT JOIN photo_managed_uploads u ON u.asset_id = a.id
         WHERE s.household_id = ? AND a.id = ? AND a.asset_status = 'ready'`,
      )
      .get(householdId, assetId) as ManagedDeletionRow | undefined;
    if (row === undefined) return null;
    if (row.master_key === null) return { kind: 'not-managed' };

    const suffix = `delete-${randomUUID()}`;
    const moves = [
      {
        original: this.managedPath(row.master_key),
        quarantined: this.managedPath(`${row.master_key}.${suffix}`),
      },
      {
        original: this.derivativePath(row.derivative_key),
        quarantined: this.derivativePath(`${row.derivative_key}.${suffix}`),
      },
      {
        original: this.derivativePath(row.thumbnail_key),
        quarantined: this.derivativePath(`${row.thumbnail_key}.${suffix}`),
      },
    ];
    const moved: typeof moves = [];
    try {
      for (const move of moves) {
        if (await renameIfPresent(move.original, move.quarantined)) moved.push(move);
      }
      this.database.transaction(() => {
        const deleted = this.database
          .prepare(
            `DELETE FROM photo_assets
             WHERE id = ?
               AND source_id IN (SELECT id FROM photo_sources WHERE household_id = ?)`,
          )
          .run(assetId, householdId);
        if (deleted.changes !== 1) throw new Error('Managed photo changed during deletion.');
      })();
    } catch (error) {
      await Promise.all(
        moved.map((move) => rename(move.quarantined, move.original).catch(() => undefined)),
      );
      throw error;
    }
    await Promise.all(moved.map((move) => rm(move.quarantined, { force: true })));
    return { kind: 'deleted', snapshot: this.snapshot(householdId) };
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
         WHERE s.household_id = ? AND a.id = ? AND a.asset_status = 'ready'`,
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
    await this.uploadPromise?.catch(() => undefined);
  }

  private async scan(householdId: string): Promise<PhotoSourceSnapshot> {
    const indexedAt = this.clock.now().toISOString();
    this.ensureSource(householdId, indexedAt);
    const sourceDirectory = this.configuration.sourceDirectory;
    if (sourceDirectory === null) return this.snapshot(householdId);
    try {
      await mkdir(this.configuration.derivativeDirectory, { recursive: true });
      const files = await discoverSourceFiles(sourceDirectory);
      const sourceId = sourceIdFor(householdId);
      const existing = this.existingFolderAssets(sourceId);
      const indexed: IndexedAsset[] = [];
      for (const file of files) {
        indexed.push(await this.indexFile(householdId, file, existing, indexedAt));
      }
      const nextProviderIds = new Set(indexed.map((asset) => asset.providerAssetId));
      const removed = [...existing.values()].filter(
        (asset) => !nextProviderIds.has(asset.provider_asset_id),
      );
      this.commitScan(householdId, sourceId, indexed, removed, indexedAt);
      this.writeFolderImportStatus(householdId, 'ready', indexedAt, indexed.length);
      await this.removeObsoleteDerivatives(existing, indexed, removed);
      return this.snapshot(householdId);
    } catch {
      this.writeFolderImportStatus(
        householdId,
        'unavailable',
        indexedAt,
        this.folderImport(householdId).imported_photo_count,
      );
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
        `SELECT a.id, a.derivative_key, a.thumbnail_key, a.alternative_text, a.width, a.height,
                a.orientation, a.captured_at, a.favourite, a.hidden, u.master_key AS managed_master_key
         FROM photo_assets a
         LEFT JOIN photo_managed_uploads u ON u.asset_id = a.id
         WHERE a.source_id = ? AND a.asset_status = 'ready'
         ORDER BY a.hidden, a.favourite DESC, a.captured_at DESC, a.id`,
      )
      .all(sourceId) as PhotoAssetRow[];
    const curation = rows.map((row): PhotoCurationAsset => {
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
        hidden: row.hidden === 1,
        source: row.managed_master_key === null ? 'synology-folder' : 'hearth-upload',
        canDeletePermanently: row.managed_master_key !== null,
      };
    });
    const photos = curation.filter((photo) => !photo.hidden).map(withoutHidden);
    const index = this.indexSnapshot(householdId, sourceId, photos.length);
    return {
      collectionId: `photo_collection_${digest(householdId).slice(0, 32)}`,
      collectionName: source?.display_name ?? this.configuration.collectionName,
      updatedAt: source?.last_indexed_at ?? null,
      source: sourceSummary(source, index.visiblePhotoCount),
      featuredPhotoId: photos[0]?.id ?? null,
      photos,
      curation,
      index: { ...index, scanInProgress: this.scanHouseholdId === householdId },
    };
  }

  private indexSnapshot(
    householdId: string,
    sourceId: string,
    visiblePhotoCount: number,
  ): PhotoSourceIndexSnapshot {
    const row = this.database
      .prepare(
        `SELECT
           COUNT(*) AS indexed,
           SUM(CASE WHEN asset_status = 'ready' AND hidden = 1 THEN 1 ELSE 0 END) AS hidden,
           SUM(CASE WHEN asset_status = 'unsupported' THEN 1 ELSE 0 END) AS unsupported,
           SUM(CASE WHEN asset_status = 'corrupt' THEN 1 ELSE 0 END) AS corrupt,
           SUM(CASE WHEN asset_status = 'ready' AND u.id IS NOT NULL THEN 1 ELSE 0 END) AS managed,
           SUM(CASE WHEN asset_status = 'ready' AND u.id IS NULL THEN 1 ELSE 0 END) AS imported
         FROM photo_assets a
         LEFT JOIN photo_managed_uploads u ON u.asset_id = a.id
         WHERE a.source_id = ?`,
      )
      .get(sourceId) as {
      indexed: number;
      hidden: number | null;
      unsupported: number | null;
      corrupt: number | null;
      managed: number | null;
      imported: number | null;
    };
    const folderImport = this.folderImport(householdId);
    const importedPhotoCount = row.imported ?? 0;
    return {
      scanInProgress: false,
      indexedFileCount: row.indexed,
      visiblePhotoCount,
      hiddenPhotoCount: row.hidden ?? 0,
      unsupportedFileCount: row.unsupported ?? 0,
      corruptFileCount: row.corrupt ?? 0,
      managedPhotoCount: row.managed ?? 0,
      importedPhotoCount,
      upload: {
        enabled: true,
        maxFileBytes: MAX_MANAGED_PHOTO_BYTES,
        acceptedFormats: ['JPEG', 'PNG', 'HEIC', 'HEIF', 'TIFF', 'AVIF', 'WebP'],
      },
      folderImport: {
        configured: this.configuration.sourceDirectory !== null,
        status: folderImport.status,
        lastCheckedAt: folderImport.last_checked_at,
        importedPhotoCount,
        message: folderImportMessage(
          this.configuration.sourceDirectory !== null,
          folderImport.status,
          importedPhotoCount,
        ),
      },
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

  private folderImport(householdId: string): FolderImportRow {
    const row = this.database
      .prepare(
        `SELECT status, last_checked_at, imported_photo_count
         FROM photo_folder_import_status WHERE household_id = ?`,
      )
      .get(householdId) as FolderImportRow | undefined;
    return (
      row ?? {
        status: this.configuration.sourceDirectory === null ? 'unconfigured' : 'unavailable',
        last_checked_at: null,
        imported_photo_count: 0,
      }
    );
  }

  private writeFolderImportStatus(
    householdId: string,
    status: FolderImportRow['status'],
    checkedAt: string | null,
    importedPhotoCount: number,
  ): void {
    this.database
      .prepare(
        `INSERT INTO photo_folder_import_status
          (household_id, status, last_checked_at, imported_photo_count, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(household_id) DO UPDATE SET
           status = excluded.status,
           last_checked_at = excluded.last_checked_at,
           imported_photo_count = excluded.imported_photo_count,
           updated_at = excluded.updated_at`,
      )
      .run(householdId, status, checkedAt, importedPhotoCount, this.clock.now().toISOString());
  }

  private async prepareManagedStorage(householdId: string): Promise<void> {
    const now = this.clock.now().toISOString();
    await Promise.all([
      mkdir(this.configuration.derivativeDirectory, { recursive: true }),
      mkdir(this.configuration.uploadDirectory, { recursive: true }),
    ]);
    this.ensureSource(householdId, now);
    this.database
      .prepare(
        `UPDATE photo_sources
         SET status = 'ready', updated_at = ?
         WHERE household_id = ?`,
      )
      .run(now, householdId);
    if (this.configuration.sourceDirectory === null) {
      this.writeFolderImportStatus(householdId, 'unconfigured', null, 0);
    }
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

  private existingFolderAssets(sourceId: string): Map<string, ExistingAssetRow> {
    const rows = this.database
      .prepare(
        `SELECT id, provider_asset_id, derivative_key, thumbnail_key, source_fingerprint,
                alternative_text, width, height, orientation, captured_at, asset_status, indexed_at
         FROM photo_assets a
         WHERE source_id = ?
           AND NOT EXISTS (SELECT 1 FROM photo_managed_uploads u WHERE u.asset_id = a.id)`,
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

  private managedPath(key: string): string {
    if (
      !MASTER_KEY_PATTERN.test(key) &&
      !/^[a-f0-9]{64}-master\.webp\.(tmp|delete)-[a-f0-9-]+$/.test(key)
    ) {
      throw new Error('Managed photo key is invalid.');
    }
    const root = resolve(this.configuration.uploadDirectory);
    const path = resolve(root, key);
    if (path !== root && !path.startsWith(`${root}${sep}`)) {
      throw new Error('Managed photo key left its approved directory.');
    }
    return path;
  }

  private startScheduledScan(householdId: string): void {
    if (
      this.configuration.sourceDirectory === null ||
      this.scanTimer !== null ||
      this.configuration.scanIntervalMs <= 0
    ) {
      return;
    }
    this.scanTimer = setInterval(() => {
      void this.refreshApprovedPhotos(householdId);
    }, this.configuration.scanIntervalMs);
    this.scanTimer.unref();
  }
}

function withoutHidden(photo: PhotoCurationAsset): PhotoAsset {
  const {
    hidden: _hidden,
    source: _source,
    canDeletePermanently: _canDeletePermanently,
    ...visible
  } = photo;
  return visible;
}

export function resolveSynologyPhotoSourceConfiguration(
  environment: NodeJS.ProcessEnv,
): SynologyPhotoSourceConfiguration {
  const configuredSource = environment.HEARTH_PHOTO_SOURCE_DIR?.trim();
  const sourceDirectory =
    configuredSource === undefined || configuredSource === '' ? null : configuredSource;
  const derivativeDirectory =
    environment.HEARTH_PHOTO_DERIVATIVE_DIR?.trim() || '/data/photo-derivatives';
  const uploadDirectory = environment.HEARTH_PHOTO_UPLOAD_DIR?.trim() || '/data/photo-uploads';
  if (
    (sourceDirectory !== null && !isAbsolute(sourceDirectory)) ||
    !isAbsolute(derivativeDirectory) ||
    !isAbsolute(uploadDirectory)
  ) {
    throw new Error('Hearth photo directories must be absolute paths.');
  }
  const source = sourceDirectory === null ? null : resolve(sourceDirectory);
  const derivatives = resolve(derivativeDirectory);
  const uploads = resolve(uploadDirectory);
  const roots = [derivatives, uploads, ...(source === null ? [] : [source])];
  for (const [index, root] of roots.entries()) {
    for (const other of roots.slice(index + 1)) {
      if (
        root === other ||
        other.startsWith(`${root}${sep}`) ||
        root.startsWith(`${other}${sep}`)
      ) {
        throw new Error('Hearth photo source, upload and derivative directories must be separate.');
      }
    }
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
    uploadDirectory: uploads,
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
        if (IGNORED_SOURCE_DIRECTORIES.has(entry.name)) continue;
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
      kind: 'hearth-managed',
      label: 'Hearth photos',
      status: 'unavailable',
      message: 'Hearth could not reach its private photo storage. Saved photos may still appear.',
    };
  }
  return {
    kind: 'hearth-managed',
    label: 'Hearth photos',
    status: source?.status ?? 'ready',
    message:
      source?.status === 'ready'
        ? `${visibleCount} approved ${visibleCount === 1 ? 'photo is' : 'photos are'} stored privately on this Hearth.`
        : 'Private photo storage is ready for uploads.',
  };
}

function folderImportMessage(
  configured: boolean,
  status: FolderImportRow['status'],
  importedPhotoCount: number,
): string {
  if (!configured) return 'Optional Synology folder import is not connected.';
  if (status === 'unavailable') {
    return 'Hearth cannot read the optional import folder right now; managed uploads still work.';
  }
  if (status === 'ready') {
    return `${importedPhotoCount} ${importedPhotoCount === 1 ? 'photo has' : 'photos have'} been imported from the optional folder.`;
  }
  return 'The optional Synology folder is ready to be checked.';
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

async function renameIfPresent(original: string, destination: string): Promise<boolean> {
  try {
    await rename(original, destination);
    return true;
  } catch (error) {
    if (isMissingFile(error)) return false;
    throw error;
  }
}
