import { PhotoGallerySchema, type DemoScenario, type PhotoGallery } from '@hearth/shared';

import { FakePhotoSourceProvider, type PhotoSourceProvider } from './integrations/photo-source.js';
import { RepositoryError } from './repository.js';

export interface PhotoRepository {
  getGallery(householdId: string): Promise<PhotoGallery>;
  reset(): void;
  setScenario(scenario: DemoScenario): void;
}

export class PhotoService implements PhotoRepository {
  private scenario: DemoScenario = 'healthy';
  private failNext = false;

  constructor(private readonly provider: PhotoSourceProvider = new FakePhotoSourceProvider()) {}

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
    const unavailable = this.scenario === 'unavailable';
    const stale = this.scenario === 'stale' || unavailable;
    const photos = empty ? [] : snapshot.photos;
    return PhotoGallerySchema.parse({
      householdId,
      freshness: stale ? 'stale' : 'current',
      statusMessage: unavailable
        ? 'Photo source is unavailable · Showing saved favourites.'
        : stale
          ? 'Photos were last checked yesterday · Trying again quietly.'
          : null,
      collection: {
        id: snapshot.collectionId,
        name: snapshot.collectionName,
        photoCount: photos.length,
        updatedAt: snapshot.updatedAt,
        source: unavailable
          ? {
              ...snapshot.source,
              status: 'unavailable',
              message: 'Saved photos remain available while Hearth reconnects.',
            }
          : snapshot.source,
      },
      featuredPhotoId: empty ? null : snapshot.featuredPhotoId,
      photos,
    });
  }

  reset(): void {
    this.scenario = 'healthy';
    this.failNext = false;
  }

  setScenario(scenario: DemoScenario): void {
    this.scenario = scenario;
    this.failNext = scenario === 'fail-next';
  }
}
