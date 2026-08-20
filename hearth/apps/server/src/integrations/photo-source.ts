import type {
  PhotoAsset,
  PhotoCurationAction,
  PhotoCurationAsset,
  PhotoSourceSummary,
} from '@hearth/shared';

export interface PhotoSourceSnapshot {
  collectionId: string;
  collectionName: string;
  updatedAt: string | null;
  source: PhotoSourceSummary;
  featuredPhotoId: string | null;
  photos: PhotoAsset[];
  curation: PhotoCurationAsset[];
  index: PhotoSourceIndexSnapshot;
}

export interface PhotoSourceIndexSnapshot {
  scanInProgress: boolean;
  indexedFileCount: number;
  visiblePhotoCount: number;
  hiddenPhotoCount: number;
  unsupportedFileCount: number;
  corruptFileCount: number;
  managedPhotoCount: number;
  importedPhotoCount: number;
  upload: {
    enabled: boolean;
    maxFileBytes: number;
    acceptedFormats: ['JPEG', 'PNG', 'HEIC', 'HEIF', 'TIFF', 'AVIF', 'WebP'];
  };
  folderImport: {
    configured: boolean;
    status: 'ready' | 'unconfigured' | 'unavailable';
    lastCheckedAt: string | null;
    importedPhotoCount: number;
    message: string;
  };
}

export type PhotoDerivativeVariant = 'display' | 'thumbnail';

export interface PhotoDerivativeAsset {
  bytes: Uint8Array;
  mimeType: 'image/webp';
  cacheKey: string;
}

export interface PhotoUploadInput {
  bytes: Uint8Array;
  mimeType: string;
  capturedAt: string | null;
  actorId: string;
}

export interface PhotoSourceUpload {
  snapshot: PhotoSourceSnapshot;
  photo: PhotoCurationAsset;
  duplicate: boolean;
}

export interface PhotoSourceProvider {
  listApprovedPhotos(householdId: string): Promise<PhotoSourceSnapshot>;
  refreshApprovedPhotos(householdId: string): Promise<PhotoSourceSnapshot>;
  uploadPhoto(householdId: string, input: PhotoUploadInput): Promise<PhotoSourceUpload | null>;
  curatePhoto(
    householdId: string,
    assetId: string,
    action: PhotoCurationAction,
  ): Promise<PhotoSourceSnapshot | null>;
  getDerivative(
    householdId: string,
    assetId: string,
    variant: PhotoDerivativeVariant,
  ): Promise<PhotoDerivativeAsset | null>;
  close(): Promise<void> | void;
  reset?(): void;
}

const DEMO_PHOTOS: PhotoAsset[] = [
  {
    id: 'photo_coastal_picnic',
    thumbnailUrl: '/demo/photos/thumbs/coastal-picnic.webp',
    displayUrl: '/demo/photos/coastal-picnic.webp',
    alt: 'Ezra and Maya share fruit at a sunset beach picnic.',
    width: 1536,
    height: 1024,
    orientation: 'landscape',
    capturedAt: '2026-01-18T10:12:00.000Z',
    favourite: true,
  },
  {
    id: 'photo_family_breakfast',
    thumbnailUrl: '/demo/photos/thumbs/family-breakfast.webp',
    displayUrl: '/demo/family-breakfast.webp',
    alt: 'Ezra and Maya set the breakfast table together.',
    width: 1200,
    height: 800,
    orientation: 'landscape',
    capturedAt: '2026-06-14T00:28:00.000Z',
    favourite: true,
  },
  {
    id: 'photo_park_football',
    thumbnailUrl: '/demo/photos/thumbs/park-football.webp',
    displayUrl: '/demo/photos/park-football.webp',
    alt: 'Ezra and Maya play football together at the park.',
    width: 1536,
    height: 1024,
    orientation: 'landscape',
    capturedAt: '2026-05-09T07:36:00.000Z',
    favourite: true,
  },
  {
    id: 'photo_bush_camping',
    thumbnailUrl: '/demo/photos/thumbs/bush-camping.webp',
    displayUrl: '/demo/photos/bush-camping.webp',
    alt: 'Ezra and Maya toast marshmallows beside a small campfire.',
    width: 1536,
    height: 1024,
    orientation: 'landscape',
    capturedAt: '2026-04-04T09:02:00.000Z',
    favourite: true,
  },
  {
    id: 'photo_garden_morning',
    thumbnailUrl: '/demo/photos/thumbs/garden-morning.webp',
    displayUrl: '/demo/photos/garden-morning.webp',
    alt: 'Ezra and Maya water herbs in the family garden.',
    width: 1024,
    height: 1536,
    orientation: 'portrait',
    capturedAt: '2026-07-05T01:18:00.000Z',
    favourite: true,
  },
];

export class FakePhotoSourceProvider implements PhotoSourceProvider {
  private readonly curation = new Map<string, Map<string, PhotoCurationAsset>>();

  async listApprovedPhotos(householdId: string): Promise<PhotoSourceSnapshot> {
    const curation = this.curationFor(householdId);
    const photos = curation.filter((photo) => !photo.hidden);
    return {
      collectionId: `photo_collection_${householdId}`,
      collectionName: 'Family favourites',
      updatedAt: '2026-08-02T23:30:00.000Z',
      source: {
        kind: 'demo',
        label: 'Demo album',
        status: 'ready',
        message: 'Fictional demo photos are ready on this Hearth.',
      },
      featuredPhotoId:
        photos.find((photo) => photo.id === 'photo_family_breakfast')?.id ?? photos[0]?.id ?? null,
      photos: photos.map(withoutHidden),
      curation,
      index: readyIndex(DEMO_PHOTOS.length, curation.length - photos.length),
    };
  }

  async refreshApprovedPhotos(householdId: string): Promise<PhotoSourceSnapshot> {
    return this.listApprovedPhotos(householdId);
  }

  async uploadPhoto(householdId: string): Promise<PhotoSourceUpload> {
    const snapshot = await this.listApprovedPhotos(householdId);
    return { snapshot, photo: snapshot.curation[0]!, duplicate: false };
  }

  async curatePhoto(
    householdId: string,
    assetId: string,
    action: PhotoCurationAction,
  ): Promise<PhotoSourceSnapshot | null> {
    const original = DEMO_PHOTOS.find((photo) => photo.id === assetId);
    if (original === undefined) return null;
    const household = this.curation.get(householdId) ?? new Map<string, PhotoCurationAsset>();
    const current = household.get(assetId) ?? { ...original, hidden: false };
    household.set(assetId, applyCurationAction(current, action));
    this.curation.set(householdId, household);
    return this.listApprovedPhotos(householdId);
  }

  async getDerivative(
    _householdId: string,
    _assetId: string,
    _variant: PhotoDerivativeVariant,
  ): Promise<PhotoDerivativeAsset | null> {
    return null;
  }

  close(): void {}

  reset(): void {
    this.curation.clear();
  }

  private curationFor(householdId: string): PhotoCurationAsset[] {
    const household = this.curation.get(householdId);
    return DEMO_PHOTOS.map((photo) => ({
      ...photo,
      hidden: household?.get(photo.id)?.hidden ?? false,
      favourite: household?.get(photo.id)?.favourite ?? photo.favourite,
    })).sort(
      (left, right) =>
        Number(left.hidden) - Number(right.hidden) ||
        Number(right.favourite) - Number(left.favourite),
    );
  }
}

export class UnconfiguredPhotoSourceProvider implements PhotoSourceProvider {
  async listApprovedPhotos(householdId: string): Promise<PhotoSourceSnapshot> {
    return {
      collectionId: `photo_collection_${householdId}`,
      collectionName: 'Family photos',
      updatedAt: null,
      source: {
        kind: 'synology-folder',
        label: 'Synology photos',
        status: 'unconfigured',
        message: 'The dedicated Synology photo folder has not been connected to this Hearth.',
      },
      featuredPhotoId: null,
      photos: [],
      curation: [],
      index: readyIndex(0),
    };
  }

  async refreshApprovedPhotos(householdId: string): Promise<PhotoSourceSnapshot> {
    return this.listApprovedPhotos(householdId);
  }

  async uploadPhoto(): Promise<null> {
    return null;
  }

  async curatePhoto(): Promise<null> {
    return null;
  }

  async getDerivative(
    _householdId: string,
    _assetId: string,
    _variant: PhotoDerivativeVariant,
  ): Promise<PhotoDerivativeAsset | null> {
    return null;
  }

  close(): void {}
}

function readyIndex(indexed: number, hidden = 0): PhotoSourceIndexSnapshot {
  return {
    scanInProgress: false,
    indexedFileCount: indexed,
    visiblePhotoCount: indexed - hidden,
    hiddenPhotoCount: hidden,
    unsupportedFileCount: 0,
    corruptFileCount: 0,
    managedPhotoCount: indexed,
    importedPhotoCount: 0,
    upload: {
      enabled: true,
      maxFileBytes: 25 * 1024 * 1024,
      acceptedFormats: ['JPEG', 'PNG', 'HEIC', 'HEIF', 'TIFF', 'AVIF', 'WebP'],
    },
    folderImport: {
      configured: false,
      status: 'unconfigured',
      lastCheckedAt: null,
      importedPhotoCount: 0,
      message: 'Optional Synology folder import is not connected.',
    },
  };
}

function withoutHidden(photo: PhotoCurationAsset): PhotoAsset {
  const { hidden: _hidden, ...visible } = photo;
  return visible;
}

function applyCurationAction(
  photo: PhotoCurationAsset,
  action: PhotoCurationAction,
): PhotoCurationAsset {
  if (action === 'favourite') return { ...photo, favourite: true };
  if (action === 'unfavourite') return { ...photo, favourite: false };
  if (action === 'hide') return { ...photo, hidden: true };
  return { ...photo, hidden: false };
}
