import { test, expect } from '@playwright/test';
import { setupMocks, openApp, defaultPhotos } from '../helpers.js';

const shown = (page, id) => page.evaluate(id => imgsOf(ANIMALS.find(a => a.id === id)).map(fileKey), id);

test('range maps, globes and hand-blocked files are never shown', async ({ context, page }) => {
  await setupMocks(context);
  await openApp(page);
  const isMap = await page.evaluate(() => [
    'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Anglerfish_Range_Map.svg/640px-Anglerfish_Range_Map.svg.png',
    'https://upload.wikimedia.org/wikipedia/commons/2/2b/Clupeaharengusdistkils.jpg?utm_source=cs.wikipedia.org&utm_content=thumbnail_unscaled',
    'https://upload.wikimedia.org/wikipedia/commons/3/3c/LocationSolomonIslands.png?utm_source=cs.wikipedia.org',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/a/aa/Steelhead_Global_Range_Map.JPG/640px-Steelhead_Global_Range_Map.JPG',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/a/aa/Verbreitungskarte_Hering.png/640px-Verbreitungskarte_Hering.png',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Cyprinus_carpio.jpeg/640px-Cyprinus_carpio.jpeg',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Picasso_fish.jpg/640px-Picasso_fish.jpg',
  ].map(isMapImage));
  expect(isMap).toEqual([true, true, true, true, true, false, false]);
});

test('Czech Wikipedia is looked up by Latin name first (no wrong-species redirects)', async ({ context, page }) => {
  await setupMocks(context, {
    photos: (host, t) => host === 'cs' && t === 'vlk mořský' ? 'C.jpg'               // "Vlk mořský" -> seabass
      : host === 'cs' && t === 'Tinca tinca' ? null                                 // no Latin redirect: fall back to Czech
      : defaultPhotos(host, t),
  });
  await openApp(page);
  const vlk = await page.evaluate(() => IMAGES['vlk mořský']);
  expect(vlk.some(u => u.includes('C__'))).toBe(false);
  const lin = await page.evaluate(() => IMAGES['lín obecný']);
  expect(lin.some(u => decodeURIComponent(u).includes('cs_lín_obecný'))).toBe(true);
});

test('identical photos (resized or mirrored copies) are hidden', async ({ context, page }) => {
  const bySource = { en: 'A.jpg', cs: 'A_flip.jpg', de: 'A_small.jpg', fr: 'B.jpg', it: 'C.jpg' };
  await setupMocks(context, { photos: (host, t) => t === 'Cyprinus carpio' ? (bySource[host] || null) : defaultPhotos(host, t) });
  await openApp(page);
  await page.waitForFunction(() => DUPES.size > 0, null, { timeout: 45000 });
  const kapr = await shown(page, 'kapr obecný');
  expect(kapr.map(k => k.split('__')[0])).toEqual(['A', 'B', 'C']);
});

test('every one of the 147 animals has at least one photo', async ({ context, page }) => {
  await setupMocks(context);
  await openApp(page);
  expect(await page.evaluate(() => ANIMALS.length)).toBe(147);
  expect(await page.evaluate(() => ANIMALS.filter(a => !hasImg(a)).map(a => a.id))).toEqual([]);
});
