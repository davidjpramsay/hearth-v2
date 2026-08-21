import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { SqliteAdminRepository } from './admin-repository.js';
import { openHearthDatabase } from './database.js';
import { FakePhotoSourceProvider } from './integrations/photo-source.js';
import { PhotoService } from './photo-repository.js';
import { FixedClock } from './runtime-context.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('persistent photo curation', () => {
  it('stores one safe audit and replays the original result after service restart', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hearth-photo-curation-'));
    temporaryDirectories.push(directory);
    const database = await openHearthDatabase(join(directory, 'hearth.sqlite'));
    const admin = new SqliteAdminRepository(database);
    const provider = new FakePhotoSourceProvider();
    const options = {
      adminRepository: admin,
      database,
      clock: new FixedClock('2026-08-10T01:15:00.000Z'),
    };
    const firstService = new PhotoService(provider, options);
    const actor = { id: 'member_maya', type: 'member', source: 'companion' } as const;
    const first = await firstService.updateCuration(
      'household_hearth_demo',
      'photo_family_breakfast',
      'hide',
      'request_persistent_photo_hide',
      actor,
    );

    const restartedService = new PhotoService(provider, options);
    const replay = await restartedService.updateCuration(
      'household_hearth_demo',
      'photo_family_breakfast',
      'hide',
      'request_persistent_photo_hide',
      actor,
    );
    const audit = database
      .prepare(
        `SELECT action_type, target_type, target_id, safe_summary_json
         FROM audit_events WHERE action_type = 'photo.hide'`,
      )
      .all();
    const activity = await admin.getActivity('household_hearth_demo', 'member_maya', 10);

    expect(first).toMatchObject({ replayed: false, audit: { action: 'photo.hide' } });
    expect(replay).toMatchObject({ replayed: true, audit: { id: first.audit.id } });
    expect(audit).toEqual([
      {
        action_type: 'photo.hide',
        target_type: 'photo-asset',
        target_id: 'photo_family_breakfast',
        safe_summary_json: '{"favourite":true,"hidden":true}',
      },
    ]);
    expect(JSON.stringify(audit)).not.toMatch(/volume1|sourceDirectory|token|password/i);
    expect(activity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: 'photo.hide', targetId: 'photo_family_breakfast' }),
      ]),
    );

    await restartedService.close();
    admin.close();
  });

  it('stores one upload receipt and path-free audit after a service restart', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hearth-photo-upload-'));
    temporaryDirectories.push(directory);
    const database = await openHearthDatabase(join(directory, 'hearth.sqlite'));
    const admin = new SqliteAdminRepository(database);
    const provider = new FakePhotoSourceProvider();
    const options = {
      adminRepository: admin,
      database,
      clock: new FixedClock('2026-08-10T01:20:00.000Z'),
    };
    const actor = { id: 'member_maya', type: 'member', source: 'companion' } as const;
    const input = {
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: 'image/jpeg',
      capturedAt: '2026-08-09T00:00:00.000Z',
    };
    const first = await new PhotoService(provider, options).uploadPhoto(
      'household_hearth_demo',
      input,
      'request_persistent_photo_upload',
      actor,
    );
    const replay = await new PhotoService(provider, options).uploadPhoto(
      'household_hearth_demo',
      input,
      'request_persistent_photo_upload',
      actor,
    );
    const audit = database
      .prepare(
        `SELECT action_type, target_type, target_id, safe_summary_json
         FROM audit_events WHERE action_type = 'photo.upload'`,
      )
      .all();

    expect(first).toMatchObject({ replayed: false, audit: { action: 'photo.upload' } });
    expect(replay).toMatchObject({ replayed: true, audit: { id: first.audit.id } });
    expect(audit).toEqual([
      {
        action_type: 'photo.upload',
        target_type: 'photo-asset',
        target_id: first.photo.id,
        safe_summary_json: '{"duplicate":false}',
      },
    ]);
    expect(JSON.stringify(audit)).not.toMatch(/volume1|sourceDirectory|filename|token|password/i);
    admin.close();
  });

  it('stores one permanent-removal receipt and path-free audit after restart', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hearth-photo-delete-'));
    temporaryDirectories.push(directory);
    const database = await openHearthDatabase(join(directory, 'hearth.sqlite'));
    const admin = new SqliteAdminRepository(database);
    const provider = new FakePhotoSourceProvider();
    const options = {
      adminRepository: admin,
      database,
      clock: new FixedClock('2026-08-10T01:25:00.000Z'),
    };
    const actor = { id: 'member_maya', type: 'member', source: 'companion' } as const;
    const first = await new PhotoService(provider, options).deleteManagedPhoto(
      'household_hearth_demo',
      'photo_family_breakfast',
      'request_persistent_photo_delete',
      actor,
    );
    const replay = await new PhotoService(provider, options).deleteManagedPhoto(
      'household_hearth_demo',
      'photo_family_breakfast',
      'request_persistent_photo_delete',
      actor,
    );
    const audit = database
      .prepare(
        `SELECT action_type, target_type, target_id, safe_summary_json
         FROM audit_events WHERE action_type = 'photo.delete'`,
      )
      .all();

    expect(first).toMatchObject({ replayed: false, audit: { action: 'photo.delete' } });
    expect(replay).toMatchObject({ replayed: true, audit: { id: first.audit.id } });
    expect(audit).toEqual([
      {
        action_type: 'photo.delete',
        target_type: 'photo-asset',
        target_id: 'photo_family_breakfast',
        safe_summary_json: '{"permanent":true}',
      },
    ]);
    expect(JSON.stringify(audit)).not.toMatch(/volume1|sourceDirectory|filename|token|password/i);
    admin.close();
  });
});
