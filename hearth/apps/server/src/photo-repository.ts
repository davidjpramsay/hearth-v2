import { randomUUID } from 'node:crypto';

import type Database from 'better-sqlite3';

import {
  AuditSummarySchema,
  PhotoCurationCommandResultSchema,
  PhotoGallerySchema,
  PhotoSourceIndexStatusSchema,
  PhotoSourceRefreshResultSchema,
  PhotoUploadResultSchema,
  type DemoScenario,
  type PhotoCurationAction,
  type PhotoCurationCommandResult,
  type PhotoGallery,
  type PhotoSourceIndexStatus,
  type PhotoSourceRefreshResult,
  type PhotoUploadResult,
} from '@hearth/shared';

import type { AdminRepository } from './admin-repository.js';
import {
  FakePhotoSourceProvider,
  type PhotoDerivativeAsset,
  type PhotoDerivativeVariant,
  type PhotoSourceProvider,
  type PhotoSourceSnapshot,
  type PhotoUploadInput,
} from './integrations/photo-source.js';
import { RepositoryError, type CommandActor } from './repository.js';
import { SystemClock, type HearthClock } from './runtime-context.js';

export interface PhotoRepository {
  getGallery(householdId: string): Promise<PhotoGallery>;
  getSourceStatus(householdId: string): Promise<PhotoSourceIndexStatus>;
  refreshSource(
    householdId: string,
    requestId: string,
    actor: CommandActor,
  ): Promise<PhotoSourceRefreshResult>;
  uploadPhoto(
    householdId: string,
    input: Omit<PhotoUploadInput, 'actorId'>,
    requestId: string,
    actor: CommandActor,
  ): Promise<PhotoUploadResult>;
  updateCuration(
    householdId: string,
    assetId: string,
    action: PhotoCurationAction,
    requestId: string,
    actor: CommandActor,
  ): Promise<PhotoCurationCommandResult>;
  getDerivative(
    householdId: string,
    assetId: string,
    variant: PhotoDerivativeVariant,
  ): Promise<PhotoDerivativeAsset | null>;
  reset(): void;
  setScenario(scenario: DemoScenario): void;
  close(): Promise<void> | void;
}

interface PhotoServiceOptions {
  adminRepository?: AdminRepository;
  database?: InstanceType<typeof Database>;
  clock?: HearthClock;
}

const REFRESH_COMMAND_TYPE = 'photo-source:refresh';
const CURATION_COMMAND_TYPE = 'photo-asset:curation';
const UPLOAD_COMMAND_TYPE = 'photo-asset:upload';
const CURATION_AUDIT_ACTION = {
  favourite: 'photo.favourite',
  unfavourite: 'photo.unfavourite',
  hide: 'photo.hide',
  unhide: 'photo.unhide',
} as const;

export class PhotoService implements PhotoRepository {
  private scenario: DemoScenario = 'healthy';
  private failNext = false;
  private readonly receipts = new Map<string, PhotoSourceRefreshResult>();
  private readonly refreshes = new Map<string, Promise<PhotoSourceRefreshResult>>();
  private readonly curationReceipts = new Map<string, PhotoCurationCommandResult>();
  private readonly curations = new Map<string, Promise<PhotoCurationCommandResult>>();
  private readonly uploadReceipts = new Map<string, PhotoUploadResult>();
  private readonly uploads = new Map<string, Promise<PhotoUploadResult>>();
  private readonly adminRepository: AdminRepository | undefined;
  private readonly database: InstanceType<typeof Database> | undefined;
  private readonly clock: HearthClock;

  constructor(
    private readonly provider: PhotoSourceProvider = new FakePhotoSourceProvider(),
    options: PhotoServiceOptions = {},
  ) {
    this.adminRepository = options.adminRepository;
    this.database = options.database;
    this.clock = options.clock ?? new SystemClock();
  }

  async getGallery(householdId: string): Promise<PhotoGallery> {
    if (this.failNext) {
      this.failNext = false;
      throw new RepositoryError(
        'INTEGRATION_UNAVAILABLE',
        'The photo source could not be reached. Try again.',
        true,
      );
    }
    const snapshot = await this.provider.listApprovedPhotos(householdId);
    const empty = this.scenario === 'empty';
    const unavailable = this.scenario === 'unavailable' || snapshot.source.status === 'unavailable';
    const stale = this.scenario === 'stale' || unavailable;
    const photos = empty ? [] : snapshot.photos;
    return PhotoGallerySchema.parse({
      householdId,
      freshness: stale ? 'stale' : 'current',
      statusMessage: unavailable
        ? 'Photo source is unavailable · Showing saved family photos.'
        : stale
          ? 'Photos were last checked yesterday · Trying again quietly.'
          : null,
      collection: collectionFromSnapshot(snapshot, photos.length, unavailable),
      featuredPhotoId: empty ? null : snapshot.featuredPhotoId,
      photos,
    });
  }

  async getSourceStatus(householdId: string): Promise<PhotoSourceIndexStatus> {
    const snapshot = await this.provider.listApprovedPhotos(householdId);
    return statusFromSnapshot(householdId, snapshot);
  }

  async refreshSource(
    householdId: string,
    requestId: string,
    actor: CommandActor,
  ): Promise<PhotoSourceRefreshResult> {
    if (actor.type !== 'member' || actor.source !== 'companion') {
      throw new RepositoryError('FORBIDDEN', 'Only an adult using the companion can scan photos.');
    }
    await this.adminRepository?.getOverview(householdId, actor.id);
    const receiptKey = `${householdId}:${REFRESH_COMMAND_TYPE}:${requestId}`;
    const active = this.refreshes.get(receiptKey);
    if (active !== undefined) {
      const result = await active;
      return { ...structuredClone(result), replayed: true };
    }
    const refresh = this.runRefresh(householdId, requestId, actor, receiptKey).finally(() => {
      if (this.refreshes.get(receiptKey) === refresh) this.refreshes.delete(receiptKey);
    });
    this.refreshes.set(receiptKey, refresh);
    return refresh;
  }

  async updateCuration(
    householdId: string,
    assetId: string,
    action: PhotoCurationAction,
    requestId: string,
    actor: CommandActor,
  ): Promise<PhotoCurationCommandResult> {
    if (actor.type !== 'member' || actor.source !== 'companion') {
      throw new RepositoryError(
        'FORBIDDEN',
        'Only an adult using the companion can choose family photos.',
      );
    }
    await this.adminRepository?.getOverview(householdId, actor.id);
    const receiptKey = `${householdId}:${CURATION_COMMAND_TYPE}:${requestId}`;
    const active = this.curations.get(receiptKey);
    if (active !== undefined) {
      const result = await active;
      return { ...structuredClone(result), replayed: true };
    }
    const curation = this.runCuration(
      householdId,
      assetId,
      action,
      requestId,
      actor,
      receiptKey,
    ).finally(() => {
      if (this.curations.get(receiptKey) === curation) this.curations.delete(receiptKey);
    });
    this.curations.set(receiptKey, curation);
    return curation;
  }

  async uploadPhoto(
    householdId: string,
    input: Omit<PhotoUploadInput, 'actorId'>,
    requestId: string,
    actor: CommandActor,
  ): Promise<PhotoUploadResult> {
    if (actor.type !== 'member' || actor.source !== 'companion') {
      throw new RepositoryError(
        'FORBIDDEN',
        'Only an adult using the companion can add family photos.',
      );
    }
    await this.adminRepository?.getOverview(householdId, actor.id);
    const receiptKey = `${householdId}:${UPLOAD_COMMAND_TYPE}:${requestId}`;
    const active = this.uploads.get(receiptKey);
    if (active !== undefined) {
      const result = await active;
      return { ...structuredClone(result), replayed: true };
    }
    const upload = this.runUpload(householdId, input, requestId, actor, receiptKey).finally(() => {
      if (this.uploads.get(receiptKey) === upload) this.uploads.delete(receiptKey);
    });
    this.uploads.set(receiptKey, upload);
    return upload;
  }

  private async runUpload(
    householdId: string,
    input: Omit<PhotoUploadInput, 'actorId'>,
    requestId: string,
    actor: CommandActor,
    receiptKey: string,
  ): Promise<PhotoUploadResult> {
    const receipt =
      this.readUploadReceipt(householdId, requestId) ?? this.uploadReceipts.get(receiptKey);
    if (receipt !== undefined) return { ...structuredClone(receipt), replayed: true };
    const uploaded = await this.provider.uploadPhoto(householdId, { ...input, actorId: actor.id });
    if (uploaded === null) {
      throw new RepositoryError(
        'VALIDATION_ERROR',
        'Choose a supported family photo smaller than 25 MB.',
      );
    }
    const audit = AuditSummarySchema.parse({
      id: `audit_${randomUUID()}`,
      actorType: actor.type,
      actorId: actor.id,
      source: actor.source,
      action: 'photo.upload',
      targetId: uploaded.photo.id,
      occurredAt: this.clock.now().toISOString(),
      result: 'succeeded',
    });
    const result = PhotoUploadResultSchema.parse({
      photo: uploaded.photo,
      status: statusFromSnapshot(householdId, uploaded.snapshot),
      duplicate: uploaded.duplicate,
      audit,
      replayed: false,
    });
    if (this.database === undefined) this.uploadReceipts.set(receiptKey, result);
    else this.writeUploadReceipt(householdId, requestId, result);
    return structuredClone(result);
  }

  private async runCuration(
    householdId: string,
    assetId: string,
    action: PhotoCurationAction,
    requestId: string,
    actor: CommandActor,
    receiptKey: string,
  ): Promise<PhotoCurationCommandResult> {
    const receipt =
      this.readCurationReceipt(householdId, requestId) ?? this.curationReceipts.get(receiptKey);
    if (receipt !== undefined) return { ...structuredClone(receipt), replayed: true };

    const snapshot = await this.provider.curatePhoto(householdId, assetId, action);
    const photo = snapshot?.curation.find((item) => item.id === assetId);
    if (snapshot === null || photo === undefined) {
      throw new RepositoryError('NOT_FOUND', 'That family photo could not be found.');
    }
    const audit = AuditSummarySchema.parse({
      id: `audit_${randomUUID()}`,
      actorType: actor.type,
      actorId: actor.id,
      source: actor.source,
      action: CURATION_AUDIT_ACTION[action],
      targetId: assetId,
      occurredAt: this.clock.now().toISOString(),
      result: 'succeeded',
    });
    const result = PhotoCurationCommandResultSchema.parse({
      photo,
      status: statusFromSnapshot(householdId, snapshot),
      audit,
      replayed: false,
    });
    if (this.database === undefined) this.curationReceipts.set(receiptKey, result);
    else this.writeCurationReceipt(householdId, requestId, result);
    return structuredClone(result);
  }

  private async runRefresh(
    householdId: string,
    requestId: string,
    actor: CommandActor,
    receiptKey: string,
  ): Promise<PhotoSourceRefreshResult> {
    const receipt = this.readReceipt(householdId, requestId) ?? this.receipts.get(receiptKey);
    if (receipt !== undefined) return { ...structuredClone(receipt), replayed: true };

    const snapshot = await this.provider.refreshApprovedPhotos(householdId);
    const audit = AuditSummarySchema.parse({
      id: `audit_${randomUUID()}`,
      actorType: actor.type,
      actorId: actor.id,
      source: actor.source,
      action: 'photo.source.refresh',
      targetId: snapshot.collectionId,
      occurredAt: this.clock.now().toISOString(),
      result: snapshot.source.status === 'unavailable' ? 'failed' : 'succeeded',
    });
    const result = PhotoSourceRefreshResultSchema.parse({
      status: statusFromSnapshot(householdId, snapshot),
      audit,
      replayed: false,
    });
    if (this.database === undefined) this.receipts.set(receiptKey, result);
    else this.writeReceipt(householdId, requestId, result);
    return structuredClone(result);
  }

  getDerivative(
    householdId: string,
    assetId: string,
    variant: PhotoDerivativeVariant,
  ): Promise<PhotoDerivativeAsset | null> {
    return this.provider.getDerivative(householdId, assetId, variant);
  }

  reset(): void {
    this.scenario = 'healthy';
    this.failNext = false;
    this.receipts.clear();
    this.refreshes.clear();
    this.curationReceipts.clear();
    this.curations.clear();
    this.uploadReceipts.clear();
    this.uploads.clear();
    this.provider.reset?.();
  }

  setScenario(scenario: DemoScenario): void {
    this.scenario = scenario;
    this.failNext = scenario === 'fail-next';
  }

  async close(): Promise<void> {
    await this.provider.close();
  }

  private readReceipt(
    householdId: string,
    requestId: string,
  ): PhotoSourceRefreshResult | undefined {
    if (this.database === undefined) return undefined;
    const row = this.database
      .prepare(
        `SELECT response_json FROM command_receipts
         WHERE household_id = ? AND request_id = ? AND command_type = ?`,
      )
      .get(householdId, requestId, REFRESH_COMMAND_TYPE) as { response_json: string } | undefined;
    return row === undefined
      ? undefined
      : PhotoSourceRefreshResultSchema.parse(JSON.parse(row.response_json));
  }

  private writeReceipt(
    householdId: string,
    requestId: string,
    result: PhotoSourceRefreshResult,
  ): void {
    this.database!.transaction(() => {
      this.database!.prepare(
        `INSERT INTO command_receipts
          (household_id, request_id, command_type, response_json, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(
        householdId,
        requestId,
        REFRESH_COMMAND_TYPE,
        JSON.stringify(result),
        this.clock.now().toISOString(),
      );
      this.database!.prepare(
        `INSERT INTO audit_events
          (id, occurred_at, household_id, actor_type, actor_id, source_channel, action_type,
           target_type, target_id, request_id, result, safe_summary_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'photo-source', ?, ?, ?, '{}')`,
      ).run(
        result.audit.id,
        result.audit.occurredAt,
        householdId,
        result.audit.actorType,
        result.audit.actorId,
        result.audit.source,
        result.audit.action,
        result.audit.targetId,
        requestId,
        result.audit.result,
      );
    })();
  }

  private readCurationReceipt(
    householdId: string,
    requestId: string,
  ): PhotoCurationCommandResult | undefined {
    if (this.database === undefined) return undefined;
    const row = this.database
      .prepare(
        `SELECT response_json FROM command_receipts
         WHERE household_id = ? AND request_id = ? AND command_type = ?`,
      )
      .get(householdId, requestId, CURATION_COMMAND_TYPE) as { response_json: string } | undefined;
    return row === undefined
      ? undefined
      : PhotoCurationCommandResultSchema.parse(JSON.parse(row.response_json));
  }

  private writeCurationReceipt(
    householdId: string,
    requestId: string,
    result: PhotoCurationCommandResult,
  ): void {
    this.database!.transaction(() => {
      this.database!.prepare(
        `INSERT INTO command_receipts
          (household_id, request_id, command_type, response_json, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(
        householdId,
        requestId,
        CURATION_COMMAND_TYPE,
        JSON.stringify(result),
        this.clock.now().toISOString(),
      );
      this.database!.prepare(
        `INSERT INTO audit_events
          (id, occurred_at, household_id, actor_type, actor_id, source_channel, action_type,
           target_type, target_id, request_id, result, safe_summary_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'photo-asset', ?, ?, ?, ?)`,
      ).run(
        result.audit.id,
        result.audit.occurredAt,
        householdId,
        result.audit.actorType,
        result.audit.actorId,
        result.audit.source,
        result.audit.action,
        result.audit.targetId,
        requestId,
        result.audit.result,
        JSON.stringify({ favourite: result.photo.favourite, hidden: result.photo.hidden }),
      );
    })();
  }

  private readUploadReceipt(householdId: string, requestId: string): PhotoUploadResult | undefined {
    if (this.database === undefined) return undefined;
    const row = this.database
      .prepare(
        `SELECT response_json FROM command_receipts
         WHERE household_id = ? AND request_id = ? AND command_type = ?`,
      )
      .get(householdId, requestId, UPLOAD_COMMAND_TYPE) as { response_json: string } | undefined;
    return row === undefined
      ? undefined
      : PhotoUploadResultSchema.parse(JSON.parse(row.response_json));
  }

  private writeUploadReceipt(
    householdId: string,
    requestId: string,
    result: PhotoUploadResult,
  ): void {
    this.database!.transaction(() => {
      this.database!.prepare(
        `INSERT INTO command_receipts
          (household_id, request_id, command_type, response_json, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(
        householdId,
        requestId,
        UPLOAD_COMMAND_TYPE,
        JSON.stringify(result),
        this.clock.now().toISOString(),
      );
      this.database!.prepare(
        `INSERT INTO audit_events
          (id, occurred_at, household_id, actor_type, actor_id, source_channel, action_type,
           target_type, target_id, request_id, result, safe_summary_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'photo-asset', ?, ?, ?, ?)`,
      ).run(
        result.audit.id,
        result.audit.occurredAt,
        householdId,
        result.audit.actorType,
        result.audit.actorId,
        result.audit.source,
        result.audit.action,
        result.audit.targetId,
        requestId,
        result.audit.result,
        JSON.stringify({ duplicate: result.duplicate }),
      );
    })();
  }
}

function statusFromSnapshot(
  householdId: string,
  snapshot: PhotoSourceSnapshot,
): PhotoSourceIndexStatus {
  return PhotoSourceIndexStatusSchema.parse({
    householdId,
    collection: collectionFromSnapshot(snapshot, snapshot.photos.length, false),
    ...snapshot.index,
    photos: snapshot.curation,
  });
}

function collectionFromSnapshot(
  snapshot: PhotoSourceSnapshot,
  photoCount: number,
  forceUnavailable: boolean,
) {
  return {
    id: snapshot.collectionId,
    name: snapshot.collectionName,
    photoCount,
    updatedAt: snapshot.updatedAt,
    source: forceUnavailable
      ? {
          ...snapshot.source,
          status: 'unavailable' as const,
          message: 'Saved photos remain available while Hearth reconnects.',
        }
      : snapshot.source,
  };
}
