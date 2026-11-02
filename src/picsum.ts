import { getImageHeight } from './InfiniteCarousel/utils';

export type ImageDimensions = { width: number; height: number };

/** Request enough pixels for the responsive carousel height, up to the demo limit. */
export function getRequestHeight(viewportWidth: number, pixelRatio: number) {
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) {
    return 600;
  }
  const ratio = Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1;
  const displayHeight = getImageHeight(viewportWidth);
  // Group nearby sizes so small viewport changes don't trigger new image URLs.
  return Math.min(600, Math.ceil((displayHeight * ratio) / 64) * 64);
}

/** Fit a source image into the request bounds without changing its aspect ratio. */
export function fitRequestSize(
  source: ImageDimensions,
  bounds: ImageDimensions,
): ImageDimensions {
  const scale = Math.min(
    bounds.width / source.width,
    bounds.height / source.height,
    1,
  );
  return {
    width: Math.max(1, Math.floor(source.width * scale)),
    height: Math.max(1, Math.floor(source.height * scale)),
  };
}
