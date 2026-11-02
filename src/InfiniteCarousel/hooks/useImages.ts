import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CarouselImage, CarouselProps } from '../types';

const MAX_CONCURRENT_RESOLUTIONS = 6;

export function useImages(
  images: CarouselImage[],
  resolveImage?: CarouselProps['resolveImage'],
) {
  const imageData = useMemo(() => JSON.stringify(images), [images]);
  const hasResolver = Boolean(resolveImage);
  // A direct source and a resolved source have separate lifetimes.
  const cache = useMemo(
    () => ({
      imageData,
      hasResolver,
      resolved: new Map<number, CarouselImage>(),
      resolvedBy: new Map<number, symbol>(),
      errors: new Map<number, symbol>(),
      pending: new Map<number, Promise<void>>(),
      controllers: new Map<number, AbortController>(),
      queue: [] as number[],
    }),
    [imageData, hasResolver],
  );
  // A new generation refreshes resolved entries without hiding their old values.
  const generation = useMemo(
    () => Symbol(cache.hasResolver ? resolveImage?.name : undefined),
    [cache, resolveImage],
  );
  const [version, setVersion] = useState(0);
  const activeGeneration = useRef<symbol | null>(null);

  useLayoutEffect(() => {
    activeGeneration.current = generation;
    return () => {
      activeGeneration.current = null;
      cache.queue.splice(0);
      for (const controller of cache.controllers.values()) controller.abort();
      cache.pending.clear();
      cache.controllers.clear();
    };
  }, [cache, generation]);

  const getImage = useCallback(
    (index: number) => cache.resolved.get(index) ?? images[index],
    [cache, images],
  );
  const isResolved = useCallback(
    (index: number) => !resolveImage || cache.resolved.has(index),
    [cache, resolveImage],
  );
  const hasError = useCallback(
    (index: number) => cache.errors.get(index) === generation,
    [cache, generation],
  );

  const drainQueue = useCallback(
    function drainQueue() {
      if (!resolveImage || activeGeneration.current !== generation) return;
      while (
        cache.pending.size < MAX_CONCURRENT_RESOLUTIONS &&
        cache.queue.length > 0
      ) {
        const index = cache.queue.shift()!;
        if (
          cache.resolvedBy.get(index) === generation ||
          cache.pending.has(index) ||
          hasError(index)
        )
          continue;
        const image = images[index];
        if (!image) continue;
        const controller = new AbortController();
        cache.controllers.set(index, controller);
        // Start in a microtask so synchronous resolver errors are handled too.
        const promise = Promise.resolve()
          .then(() => {
            if (controller.signal.aborted) {
              throw new DOMException('Aborted', 'AbortError');
            }
            return resolveImage(image, controller.signal);
          })
          .then((resolved) => {
            if (
              activeGeneration.current === generation &&
              !controller.signal.aborted
            ) {
              if (!resolved.src)
                throw new Error('Image resolver returned an empty source');
              cache.resolved.set(index, resolved);
              cache.resolvedBy.set(index, generation);
              cache.errors.delete(index);
            }
          })
          .catch(() => {
            if (
              activeGeneration.current === generation &&
              !controller.signal.aborted
            ) {
              if (cache.resolved.has(index)) {
                // Keep the old image and mark this refresh as attempted.
                cache.resolvedBy.set(index, generation);
              } else {
                cache.errors.set(index, generation);
              }
            }
          })
          .finally(() => {
            if (cache.pending.get(index) !== promise) return;
            cache.pending.delete(index);
            cache.controllers.delete(index);
            if (activeGeneration.current === generation) {
              setVersion((value) => value + 1);
              drainQueue();
            }
          });
        cache.pending.set(index, promise);
      }
    },
    [cache, generation, hasError, images, resolveImage],
  );

  const prefetchImages = useCallback(
    (indexes: number[]) => {
      if (!resolveImage || activeGeneration.current !== generation) return;
      // Replace work not yet started so a fast scroll can reprioritize it.
      const queue = [...new Set(indexes)].filter(
        (index) =>
          index >= 0 &&
          index < images.length &&
          cache.resolvedBy.get(index) !== generation &&
          !cache.pending.has(index) &&
          !hasError(index),
      );
      cache.queue.splice(0, cache.queue.length, ...queue);
      drainQueue();
    },
    [cache, drainQueue, generation, hasError, images.length, resolveImage],
  );

  const reportImageError = useCallback(
    (index: number, src: string) => {
      if (getImage(index)?.src !== src || hasError(index)) return;
      cache.errors.set(index, generation);
      setVersion((value) => value + 1);
    },
    [cache, generation, getImage, hasError],
  );

  const retryImage = useCallback(
    (index: number) => {
      if (!hasError(index)) return;
      cache.errors.delete(index);
      if (resolveImage) {
        cache.resolved.delete(index);
        cache.resolvedBy.delete(index);
        cache.queue.unshift(index);
        drainQueue();
      }
      setVersion((value) => value + 1);
    },
    [cache, drainQueue, hasError, resolveImage],
  );

  const recordSize = useCallback(
    (index: number, width: number, height: number) => {
      const image = getImage(index);
      if (!image || !width || !height || (image.width && image.height)) return;
      cache.resolved.set(index, { ...image, width, height });
      setVersion((value) => value + 1);
    },
    [cache, getImage],
  );

  return {
    cache,
    getImage,
    isResolved,
    hasError,
    prefetchImages,
    recordSize,
    reportImageError,
    retryImage,
    version,
  };
}
