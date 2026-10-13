import type { Page } from '@playwright/test';
import type { PhotoGallery } from '@hearth/shared';

// Pin non-security display randomness only in layout/remote fixtures. Production stays random.
// For the five demo assets this preserves the previous breakfast -> park composition so the
// geometry/focus assertions remain meaningful; shuffle behavior has separate cycle tests.
export async function stabilizePhotoPlayback(page: Page, seed = 1984) {
  await page.addInitScript((value) => {
    Math.random = () => value / 0x1_0000_0000;
  }, seed);
}

// Geometry fixtures must supply the same image/shape through both Today and its playback album.
export async function useSinglePhotoAlbum(
  page: Page,
  photo: {
    orientation: 'landscape' | 'portrait' | 'square';
    width: number;
    height: number;
    url?: string;
    alt?: string;
  },
) {
  await page.route('**/api/v1/households/*/photos', async (route) => {
    const response = await route.fetch();
    const data = (await response.json()) as PhotoGallery;
    const base = data.photos.find((asset) => asset.id === data.featuredPhotoId) ?? data.photos[0];
    if (base) {
      data.photos = [
        {
          ...base,
          orientation: photo.orientation,
          width: photo.width,
          height: photo.height,
          displayUrl: photo.url ?? base.displayUrl,
          alt: photo.alt ?? base.alt,
        },
      ];
      data.featuredPhotoId = base.id;
      data.collection.photoCount = 1;
    }
    await route.fulfill({ response, json: data });
  });
}
