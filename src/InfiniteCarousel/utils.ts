import type { CarouselImage, Geometry } from './types';

export function getImageHeight(
  viewportWidth: number,
  maxImageHeight = 420,
  imageHeight?: number | ((trackWidth: number) => number),
) {
  const requested =
    typeof imageHeight === 'function'
      ? imageHeight(viewportWidth)
      : imageHeight;
  if (requested !== undefined && Number.isFinite(requested) && requested > 0)
    return requested;
  return Math.max(
    1,
    Math.min(maxImageHeight, Math.max(160, viewportWidth * 0.55)),
  );
}

export function boundedInteger(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
) {
  return value === undefined || !Number.isFinite(value)
    ? fallback
    : Math.min(max, Math.max(min, Math.floor(value)));
}

export function imageIdentity(image: CarouselImage) {
  return image.id === undefined ? `src:${image.src}` : `id:${image.id}`;
}

export function modulo(index: number, length: number) {
  return ((index % length) + length) % length;
}

export function imageSize(image: CarouselImage, height: number) {
  const ratio =
    image.width && image.height && image.width > 0 && image.height > 0
      ? image.width / image.height
      : 1.5;
  return { width: height * ratio, height };
}

export function preserveOffset(
  offset: number,
  oldWidth: number,
  newWidth: number,
) {
  return offset > oldWidth
    ? newWidth + offset - oldWidth
    : (offset / oldWidth) * newWidth;
}

export function createGeometry(
  widths: number[],
  gap: number,
  viewportWidth: number,
  base: number,
): Geometry {
  if (!widths.length) {
    return {
      starts: [],
      widths,
      count: 0,
      base,
    };
  }

  const minimumStride = Math.max(
    1,
    widths.reduce((minimum, width) => Math.min(minimum, width), Infinity) + gap,
  );
  const desiredSlots = Math.max(
    201,
    Math.ceil((viewportWidth * 6) / minimumStride),
  );
  const count = desiredSlots + (1 - (desiredSlots % 2));
  const starts: number[] = [];
  let position = 0;
  for (let index = 0; index < count; index++) {
    starts.push(position);
    position += widths[modulo(base + index, widths.length)] + gap;
  }
  return {
    starts,
    widths,
    count,
    base,
  };
}

export function itemAtOffset(geometry: Geometry, offset: number) {
  let low = 0;
  let high = geometry.count - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (geometry.starts[middle] <= offset) low = middle;
    else high = middle - 1;
  }
  return low;
}
