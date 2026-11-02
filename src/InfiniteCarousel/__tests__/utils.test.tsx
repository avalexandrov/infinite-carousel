import { describe, expect, it } from 'vitest';
import { createGeometry, imageSize, modulo, preserveOffset } from '../utils';
import type { CarouselImage } from '../types';

function images(count: number): CarouselImage[] {
  return Array.from({ length: count }, (_, index) => ({
    src: `/photo-${index}.jpg`,
    alt: `Photo ${index + 1}`,
    width: index % 2 ? 400 : 800,
    height: 600,
  }));
}

describe('carousel geometry', () => {
  it('preserves relative position in an image and the distance into a gap on resize', () => {
    expect(preserveOffset(250, 500, 200)).toBe(100);
    expect(preserveOffset(508, 500, 200)).toBe(208);
  });
  it('keeps the aspect ratio when sizing portrait and landscape images', () => {
    expect(imageSize({ src: '', width: 400, height: 800 }, 420)).toEqual({
      width: 210,
      height: 420,
    });
    expect(imageSize({ src: '', width: 1600, height: 400 }, 420)).toEqual({
      width: 1680,
      height: 420,
    });
  });

  it('maps negative logical positions to the end of the sequence', () => {
    expect(modulo(-1, 30)).toBe(29);
    expect(modulo(30, 30)).toBe(0);
  });

  it.each([30, 1500])(
    'uses a bounded rolling window for %i different images',
    (count) => {
      const widths = images(count).map((image) => imageSize(image, 420).width);
      const geometry = createGeometry(widths, 12, 800, -100);
      expect(geometry.count).toBe(201);
      expect(geometry.starts[100]).toBeGreaterThan(0);
    },
  );

  it('provides enough slots for a very short collection', () => {
    const geometry = createGeometry([30], 12, 800, -100);
    expect(geometry.count).toBeGreaterThanOrEqual(201);
    expect(geometry.starts.at(-1)! + 30).toBeGreaterThan(800 * 6);
  });
});
