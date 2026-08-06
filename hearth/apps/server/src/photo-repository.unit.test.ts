import { describe, expect, it } from 'vitest';

import { FakePhotoSourceProvider } from './integrations/photo-source.js';
import { PhotoService } from './photo-repository.js';

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
});
