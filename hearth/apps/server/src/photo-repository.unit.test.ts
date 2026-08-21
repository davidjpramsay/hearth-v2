import { describe, expect, it } from 'vitest';

import { FakePhotoSourceProvider } from './integrations/photo-source.js';
import { PhotoService } from './photo-repository.js';
import { InMemoryAdminRepository } from './admin-repository.js';

describe('PhotoService', () => {
  it('projects only safe derivatives and keeps portrait metadata', async () => {
    const service = new PhotoService(new FakePhotoSourceProvider());
    const gallery = await service.getGallery('household_hearth_demo');
    expect(gallery.photos).toHaveLength(5);
    expect(gallery.photos.some((photo) => photo.orientation === 'portrait')).toBe(true);
    expect(gallery.photos.every((photo) => photo.displayUrl.startsWith('/'))).toBe(true);
    expect(JSON.stringify(gallery)).not.toMatch(/volume1|filesystem|sourcePath/);
  });

  it('keeps cached derivatives when the approved source is unavailable', async () => {
    const service = new PhotoService();
    service.setScenario('unavailable');
    const gallery = await service.getGallery('household_hearth_demo');
    expect(gallery.freshness).toBe('stale');
    expect(gallery.collection.source.status).toBe('unavailable');
    expect(gallery.photos).toHaveLength(5);
  });

  it('fails one read deterministically and recovers on retry', async () => {
    const service = new PhotoService();
    service.setScenario('fail-next');
    await expect(service.getGallery('household_hearth_demo')).rejects.toMatchObject({
      code: 'INTEGRATION_UNAVAILABLE',
      retryable: true,
    });
    await expect(service.getGallery('household_hearth_demo')).resolves.toMatchObject({
      freshness: 'current',
    });
  });

  it('audits an adult refresh, replays duplicate requests and rejects television actors', async () => {
    const service = new PhotoService(new FakePhotoSourceProvider(), {
      adminRepository: new InMemoryAdminRepository(),
    });
    const actor = { id: 'member_maya', type: 'member', source: 'companion' } as const;
    const first = await service.refreshSource(
      'household_hearth_demo',
      'request_photo_refresh',
      actor,
    );
    const replay = await service.refreshSource(
      'household_hearth_demo',
      'request_photo_refresh',
      actor,
    );
    expect(first).toMatchObject({ replayed: false, audit: { action: 'photo.source.refresh' } });
    expect(replay).toMatchObject({ replayed: true, audit: { id: first.audit.id } });
    await expect(
      service.refreshSource('household_hearth_demo', 'request_tv_refresh', {
        id: 'device_living_room_tv',
        type: 'device',
        source: 'tv',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('uploads through an adult-only idempotent command and creates a safe audit summary', async () => {
    const service = new PhotoService(new FakePhotoSourceProvider(), {
      adminRepository: new InMemoryAdminRepository(),
    });
    const actor = { id: 'member_maya', type: 'member', source: 'companion' } as const;
    const input = {
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: 'image/jpeg',
      capturedAt: '2026-08-03T00:30:00.000Z',
    };
    const first = await service.uploadPhoto(
      'household_hearth_demo',
      input,
      'request_photo_upload',
      actor,
    );
    const replay = await service.uploadPhoto(
      'household_hearth_demo',
      input,
      'request_photo_upload',
      actor,
    );

    expect(first).toMatchObject({
      replayed: false,
      duplicate: false,
      audit: { action: 'photo.upload', actorId: 'member_maya', source: 'companion' },
    });
    expect(replay).toMatchObject({ replayed: true, audit: { id: first.audit.id } });
    await expect(
      service.uploadPhoto('household_hearth_demo', input, 'request_photo_upload_tv', {
        id: 'device_living_room_tv',
        type: 'device',
        source: 'tv',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('curates photos idempotently, excludes hidden photos and resets the demo safely', async () => {
    const service = new PhotoService(new FakePhotoSourceProvider(), {
      adminRepository: new InMemoryAdminRepository(),
    });
    const actor = { id: 'member_maya', type: 'member', source: 'companion' } as const;
    const first = await service.updateCuration(
      'household_hearth_demo',
      'photo_family_breakfast',
      'hide',
      'request_photo_hide',
      actor,
    );
    const replay = await service.updateCuration(
      'household_hearth_demo',
      'photo_family_breakfast',
      'hide',
      'request_photo_hide',
      actor,
    );
    expect(first).toMatchObject({
      replayed: false,
      photo: { hidden: true },
      status: { visiblePhotoCount: 4, hiddenPhotoCount: 1 },
      audit: { action: 'photo.hide' },
    });
    expect(replay).toMatchObject({ replayed: true, audit: { id: first.audit.id } });
    expect((await service.getGallery('household_hearth_demo')).photos).toHaveLength(4);

    const restored = await service.updateCuration(
      'household_hearth_demo',
      'photo_family_breakfast',
      'unhide',
      'request_photo_restore',
      actor,
    );
    expect(restored).toMatchObject({
      photo: { hidden: false },
      status: { visiblePhotoCount: 5, hiddenPhotoCount: 0 },
      audit: { action: 'photo.unhide' },
    });
    const unfavourited = await service.updateCuration(
      'household_hearth_demo',
      'photo_family_breakfast',
      'unfavourite',
      'request_photo_unfavourite',
      actor,
    );
    const favourited = await service.updateCuration(
      'household_hearth_demo',
      'photo_family_breakfast',
      'favourite',
      'request_photo_favourite',
      actor,
    );
    expect(unfavourited).toMatchObject({
      photo: { favourite: false },
      audit: { action: 'photo.unfavourite' },
    });
    expect(favourited).toMatchObject({
      photo: { favourite: true },
      audit: { action: 'photo.favourite' },
    });
    await expect(
      service.updateCuration(
        'household_hearth_demo',
        'photo_family_breakfast',
        'hide',
        'request_photo_tv_hide',
        { id: 'device_living_room_tv', type: 'device', source: 'tv' },
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    service.reset();
    expect((await service.getSourceStatus('household_hearth_demo')).hiddenPhotoCount).toBe(0);
  });

  it('permanently removes only managed photos through an adult idempotent command', async () => {
    const service = new PhotoService(new FakePhotoSourceProvider(), {
      adminRepository: new InMemoryAdminRepository(),
    });
    const actor = { id: 'member_maya', type: 'member', source: 'companion' } as const;
    const first = await service.deleteManagedPhoto(
      'household_hearth_demo',
      'photo_family_breakfast',
      'request_photo_delete',
      actor,
    );
    const replay = await service.deleteManagedPhoto(
      'household_hearth_demo',
      'photo_family_breakfast',
      'request_photo_delete',
      actor,
    );

    expect(first).toMatchObject({
      replayed: false,
      deletedAssetId: 'photo_family_breakfast',
      status: { managedPhotoCount: 4, visiblePhotoCount: 4 },
      audit: { action: 'photo.delete' },
    });
    expect(replay).toMatchObject({ replayed: true, audit: { id: first.audit.id } });
    expect((await service.getGallery('household_hearth_demo')).photos).toHaveLength(4);
    await expect(
      service.deleteManagedPhoto(
        'household_hearth_demo',
        'photo_coastal_picnic',
        'request_photo_delete_tv',
        { id: 'device_living_room_tv', type: 'device', source: 'tv' },
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
