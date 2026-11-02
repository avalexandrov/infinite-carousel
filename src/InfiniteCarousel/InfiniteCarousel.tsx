import { useVirtualizer, type Range } from '@tanstack/react-virtual';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  boundedInteger,
  createGeometry,
  getImageHeight,
  imageIdentity,
  imageSize,
  itemAtOffset,
  modulo,
  preserveOffset,
} from './utils';
import './InfiniteCarousel.css';
import { Picture } from './Picture';
import { useImages } from './hooks/useImages';
import type { Anchor, CarouselProps, Snapshot } from './types';

export function InfiniteCarousel({
  images,
  resolveImage,
  maxImageHeight = 420,
  imageHeight: requestedHeight,
  gap = 12,
  label = 'Infinite carousel',
  className,
  initialIndex = 0,
  buffer: configuredBuffer = 12,
  renderLoading,
  renderError,
}: CarouselProps) {
  // TanStack Virtual manages mutable state and cannot be memoized by React Compiler.
  'use no memo';

  const trackRef = useRef<HTMLDivElement>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [base, setBase] = useState(-100);
  const previous = useRef<Snapshot | null>(null);
  const pendingAnchor = useRef<Anchor | null>(null);
  const lastScrollOffset = useRef(0);
  const buffer = boundedInteger(configuredBuffer, 12, 0, 100);
  const {
    getImage,
    isResolved,
    hasError,
    prefetchImages,
    recordSize,
    reportImageError,
    retryImage,
    version,
  } = useImages(images, resolveImage);
  const signature = useMemo(
    () =>
      JSON.stringify(images.map((image) => [imageIdentity(image), image.src])),
    [images],
  );
  const hasImages = images.length > 0;

  // measuring the carousel track
  useLayoutEffect(() => {
    if (!hasImages) {
      previous.current = null;
      pendingAnchor.current = null;
      lastScrollOffset.current = 0;
      return;
    }
    const track = trackRef.current;
    if (!track) return;
    const update = () => setViewportWidth(track.clientWidth);
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(track);
    return () => observer.disconnect();
  }, [hasImages]);

  const safeGap = Number.isFinite(gap) ? Math.max(0, gap) : 12;
  const imageHeight = getImageHeight(
    viewportWidth,
    maxImageHeight,
    requestedHeight,
  );
  const widths = useMemo(
    () =>
      images.map(
        (image, index) =>
          imageSize(getImage(index) ?? image, imageHeight).width,
      ),
    // The cache is mutated in place; version invalidates widths when it changes.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [images, getImage, imageHeight, version],
  );
  const geometry = useMemo(
    () => createGeometry(widths, safeGap, viewportWidth, base),
    [widths, safeGap, viewportWidth, base],
  );
  const getItemKey = useMemo(
    () => (index: number) =>
      geometry.starts[index] === undefined ? -1 : index,
    [geometry],
  );
  const rangeExtractor = useCallback(
    (range: Range) => {
      const start = Math.max(0, range.startIndex - buffer);
      const end = Math.min(range.count - 1, range.endIndex + buffer);
      return Array.from(
        { length: end - start + 1 },
        (_, index) => start + index,
      );
    },
    [buffer],
  );

  // oxlint-disable-next-line react/incompatible-library -- TanStack Virtual owns its mutable state.
  const virtualizer = useVirtualizer({
    count: geometry.count,
    getScrollElement: () => trackRef.current,
    estimateSize: (index) =>
      geometry.widths[modulo(base + index, images.length)],
    horizontal: true,
    getItemKey,
    gap: safeGap,
    rangeExtractor,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const visibleRange = virtualizer.range;
  const prefetchOrder = useMemo(() => {
    if (!visibleRange || !images.length) return [];
    const { startIndex, endIndex } = visibleRange;
    const rank = (index: number) => {
      if (index >= startIndex && index <= endIndex) return 0;
      return index < startIndex ? startIndex - index : index - endIndex;
    };
    const indices = [...virtualItems].sort(
      (a, b) => rank(a.index) - rank(b.index),
    );
    return [
      ...new Set(
        indices.map((item) => modulo(base + item.index, images.length)),
      ),
    ];
  }, [base, images.length, virtualItems, visibleRange]);
  useEffect(() => {
    const track = trackRef.current;
    // the first range can precede the initial scroll to the middle of the window
    if (
      !viewportWidth ||
      !track ||
      previous.current?.geometry !== geometry ||
      Math.abs((virtualizer.scrollOffset ?? 0) - track.scrollLeft) > 1
    )
      return;
    prefetchImages(prefetchOrder);
  }, [prefetchImages, prefetchOrder, geometry, viewportWidth, virtualizer]);

  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track || !viewportWidth || !geometry.count) return;
    const old = previous.current;
    const reset = !old || old.signature !== signature;
    let target: number;
    if (reset) {
      const index = boundedInteger(initialIndex, 0, 0, images.length - 1);
      const middle = Math.floor(geometry.count / 2);
      const logical =
        index +
        Math.round((geometry.base + middle - index) / images.length) *
          images.length;
      const slot = logical - geometry.base;
      pendingAnchor.current = null;
      if (slot < 0 || slot >= geometry.count) {
        setBase(index - middle);
        return;
      }
      target = geometry.starts[slot];
    } else if (pendingAnchor.current) {
      const anchor = pendingAnchor.current;
      const index = anchor.logical - geometry.base;
      target =
        (geometry.starts[index] ??
          geometry.starts[Math.floor(geometry.count / 2)]) + anchor.offset;
      pendingAnchor.current = null;
    } else {
      const oldIndex = itemAtOffset(old.geometry, lastScrollOffset.current);
      let offset = lastScrollOffset.current - old.geometry.starts[oldIndex];
      const oldLogical = old.geometry.base + oldIndex;
      const oldWidth =
        old.geometry.widths[modulo(oldLogical, old.geometry.widths.length)];
      const newWidth =
        geometry.widths[modulo(oldLogical, geometry.widths.length)];
      offset = preserveOffset(offset, oldWidth, newWidth);
      let index = oldLogical - geometry.base;
      if (index < 0 || index >= geometry.count) {
        index = Math.floor(geometry.count / 2);
      }
      target = geometry.starts[index] + offset;
    }
    previous.current = { geometry, signature };
    track.scrollLeft = target;
    lastScrollOffset.current = track.scrollLeft;
  }, [
    geometry,
    signature,
    viewportWidth,
    virtualizer,
    images.length,
    initialIndex,
  ]);

  const onScroll = () => {
    const track = trackRef.current;
    if (!track || !geometry.count || previous.current?.geometry !== geometry) {
      return;
    }
    const offset = track.scrollLeft;
    lastScrollOffset.current = offset;
    if (pendingAnchor.current) {
      return;
    }
    const index = itemAtOffset(geometry, offset);
    if (index < geometry.count * 0.25 || index >= geometry.count * 0.75) {
      const logical = geometry.base + index;
      pendingAnchor.current = {
        logical,
        offset: offset - geometry.starts[index],
      };
      setBase(logical - Math.floor(geometry.count / 2));
    }
  };

  if (!hasImages) return null;

  return (
    <div
      className={['carousel', className].filter(Boolean).join(' ')}
      role="region"
      aria-label={label}
      dir="ltr"
    >
      <div
        className="carousel__track"
        ref={trackRef}
        tabIndex={0}
        onScroll={onScroll}
      >
        <div
          className="carousel__virtual-space"
          style={{ width: virtualizer.getTotalSize(), height: imageHeight }}
        >
          {virtualItems.map((item) => {
            const logical = base + item.index;
            const imageIndex = modulo(logical, images.length);
            const visible =
              visibleRange !== null &&
              item.index >= visibleRange.startIndex &&
              item.index <= visibleRange.endIndex;
            const image = getImage(imageIndex);
            return (
              <div
                className="carousel__virtual-item"
                key={logical}
                aria-hidden={visible ? undefined : true}
                inert={visible ? undefined : true}
                style={{
                  transform: `translateX(${item.start}px)`,
                  width: item.size,
                }}
              >
                <Picture
                  image={image}
                  index={imageIndex}
                  resolved={isResolved(imageIndex)}
                  failed={hasError(imageIndex)}
                  retry={() => retryImage(imageIndex)}
                  reportImageError={reportImageError}
                  renderLoading={renderLoading}
                  renderError={renderError}
                  recordSize={recordSize}
                  height={imageHeight}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
