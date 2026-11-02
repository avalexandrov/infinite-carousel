import { act, renderHook, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useImages } from '../hooks/useImages';
import type { CarouselImage } from '../types';

afterEach(() => vi.restoreAllMocks());

describe('useImages', () => {
  it('serializes the collection once while its array reference stays the same', () => {
    const images: CarouselImage[] = [{ src: '/photo.jpg' }];
    const stringify = vi.spyOn(JSON, 'stringify');
    const { rerender } = renderHook(() => useImages(images));
    rerender();
    rerender();
    expect(
      stringify.mock.calls.filter(([value]) => value === images),
    ).toHaveLength(1);
  });

  it('keeps the resolved cache for equivalent collections but replaces it for changed images', async () => {
    const original: CarouselImage[] = [{ src: '/photo.jpg' }];
    const resolver = vi.fn(async (image: CarouselImage) => ({
      ...image,
      width: 800,
      height: 600,
    }));
    const { result, rerender } = renderHook(
      ({ images }) => useImages(images, resolver),
      { initialProps: { images: original } },
    );
    act(() => result.current.prefetchImages([0]));
    await waitFor(() =>
      expect(result.current.cache.resolved.has(0)).toBe(true),
    );
    const previousCache = result.current.cache;
    rerender({ images: [{ src: '/photo.jpg' }] });
    expect(result.current.cache).toBe(previousCache);
    rerender({ images: [{ src: '/different.jpg' }] });
    expect(result.current.cache).not.toBe(previousCache);
    expect(result.current.cache.resolved.size).toBe(0);
    expect(result.current.getImage(0)?.src).toBe('/different.jpg');
    expect(result.current.isResolved(0)).toBe(false);
  });

  it('limits concurrent resolutions and replaces queued work with the latest priority order', async () => {
    const images = Array.from({ length: 10 }, (_, index) => ({
      src: `/photo-${index}.jpg`,
    }));
    const finish: Array<(image: CarouselImage) => void> = [];
    const resolver = vi.fn(
      (_image: CarouselImage) =>
        new Promise<CarouselImage>((resolve) => finish.push(resolve)),
    );
    const { result, unmount } = renderHook(() => useImages(images, resolver));

    act(() => result.current.prefetchImages(images.map((_, index) => index)));
    await waitFor(() => expect(resolver).toHaveBeenCalledTimes(6));
    act(() => result.current.prefetchImages([9, 8, 7, 6]));
    await act(async () => finish[0]({ src: '/photo-0.jpg' }));
    await waitFor(() => expect(resolver).toHaveBeenCalledTimes(7));
    expect(resolver.mock.calls[6][0]).toEqual(images[9]);

    unmount();
    await act(async () => finish[1]({ src: '/photo-1.jpg' }));
    expect(resolver).toHaveBeenCalledTimes(7);
  });

  it('ignores an old collection’s pending result after replacement', async () => {
    let finish!: (image: CarouselImage) => void;
    const resolver = vi.fn(
      () => new Promise<CarouselImage>((resolve) => (finish = resolve)),
    );
    const { result, rerender } = renderHook(
      ({ images }) => useImages(images, resolver),
      { initialProps: { images: [{ src: '/old.jpg' }] } },
    );
    act(() => result.current.prefetchImages([0]));
    await waitFor(() => expect(resolver).toHaveBeenCalledTimes(1));
    rerender({ images: [{ src: '/new.jpg' }] });
    await act(async () => finish({ src: '/old-resolved.jpg' }));
    expect(result.current.cache.resolved.size).toBe(0);
  });

  it('retains the previous image while the resolver refreshes and replaces it on success', async () => {
    const images = [{ src: '/photo.jpg' }];
    const first = vi.fn(async () => ({
      src: '/small.jpg',
      width: 800,
      height: 600,
    }));
    let finish!: (image: CarouselImage) => void;
    const second = vi.fn(
      () => new Promise<CarouselImage>((resolve) => (finish = resolve)),
    );
    const { result, rerender } = renderHook(
      ({ resolver }) => useImages(images, resolver),
      {
        initialProps: {
          resolver: first as (image: CarouselImage) => Promise<CarouselImage>,
        },
      },
    );

    act(() => result.current.prefetchImages([0]));
    await waitFor(() =>
      expect(result.current.cache.resolved.has(0)).toBe(true),
    );
    rerender({ resolver: second });
    expect(result.current.getImage(0)?.src).toBe('/small.jpg');
    expect(result.current.isResolved(0)).toBe(true);
    act(() => result.current.prefetchImages([0]));
    await waitFor(() => expect(second).toHaveBeenCalledTimes(1));
    expect(result.current.getImage(0)?.src).toBe('/small.jpg');
    await act(async () =>
      finish({ src: '/large.jpg', width: 800, height: 600 }),
    );
    expect(result.current.getImage(0)?.src).toBe('/large.jpg');
  });

  it('does not trigger an extra synchronous render when the resolver changes', async () => {
    const images = [{ src: '/photo.jpg' }];
    const first = async () => ({ src: '/first.jpg', width: 800, height: 600 });
    const second = async () => ({
      src: '/second.jpg',
      width: 800,
      height: 600,
    });
    let renders = 0;
    const { result, rerender } = renderHook(
      ({ resolver }) => {
        renders += 1;
        return useImages(images, resolver);
      },
      { initialProps: { resolver: first } },
    );
    act(() => result.current.prefetchImages([0]));
    await waitFor(() =>
      expect(result.current.getImage(0)?.src).toBe('/first.jpg'),
    );
    const before = renders;
    rerender({ resolver: second });
    expect(renders - before).toBe(1);
    expect(result.current.getImage(0)?.src).toBe('/first.jpg');
  });

  it('retains the previous image and dimensions when a resolver refresh fails', async () => {
    const images = [{ src: '/photo.jpg' }];
    const first = async () => ({ src: '/first.jpg', width: 800, height: 600 });
    let rejectRefresh!: (error: Error) => void;
    const failing = vi.fn(
      () =>
        new Promise<CarouselImage>((_, reject) => {
          rejectRefresh = reject;
        }),
    );
    const { result, rerender } = renderHook(
      ({ resolver }) => useImages(images, resolver),
      {
        initialProps: {
          resolver: first as (image: CarouselImage) => Promise<CarouselImage>,
        },
      },
    );
    act(() => result.current.prefetchImages([0]));
    await waitFor(() =>
      expect(result.current.getImage(0)?.src).toBe('/first.jpg'),
    );
    rerender({ resolver: failing });
    act(() => result.current.prefetchImages([0]));
    await waitFor(() => expect(failing).toHaveBeenCalledTimes(1));
    await act(async () => rejectRefresh(new Error('offline')));
    expect(result.current.getImage(0)).toEqual({
      src: '/first.jpg',
      width: 800,
      height: 600,
    });
    expect(result.current.isResolved(0)).toBe(true);
    expect(result.current.hasError(0)).toBe(false);
  });

  it('aborts an obsolete resolver and ignores its late result', async () => {
    const images = [{ src: '/photo.jpg' }];
    let finishOld!: (image: CarouselImage) => void;
    let oldSignal: AbortSignal | undefined;
    const first = vi.fn((_image: CarouselImage, signal?: AbortSignal) => {
      oldSignal = signal;
      return new Promise<CarouselImage>((resolve) => {
        finishOld = resolve;
      });
    });
    const second = vi.fn(async () => ({ src: '/new.jpg' }));
    const { result, rerender } = renderHook(
      ({ resolver }) => useImages(images, resolver),
      {
        initialProps: {
          resolver: first as (
            image: CarouselImage,
            signal?: AbortSignal,
          ) => Promise<CarouselImage>,
        },
      },
    );
    act(() => result.current.prefetchImages([0]));
    await waitFor(() => expect(first).toHaveBeenCalledTimes(1));
    rerender({ resolver: second });
    expect(oldSignal?.aborted).toBe(true);
    act(() => result.current.prefetchImages([0]));
    await waitFor(() =>
      expect(result.current.getImage(0)?.src).toBe('/new.jpg'),
    );
    await act(async () => finishOld({ src: '/stale.jpg' }));
    expect(result.current.getImage(0)?.src).toBe('/new.jpg');
  });

  it('uses the original source when a resolver is removed and refreshes when one is added', async () => {
    const images = [{ src: '/original.jpg' }];
    const first = async () => ({ src: '/first.jpg', width: 800, height: 600 });
    const second = vi.fn(async () => ({
      src: '/second.jpg',
      width: 800,
      height: 600,
    }));
    const { result, rerender } = renderHook(
      ({
        resolver,
      }: {
        resolver?: (image: CarouselImage) => Promise<CarouselImage>;
      }) => useImages(images, resolver),
      {
        initialProps: {
          resolver: first as
            ((image: CarouselImage) => Promise<CarouselImage>) | undefined,
        },
      },
    );
    act(() => result.current.prefetchImages([0]));
    await waitFor(() =>
      expect(result.current.getImage(0)?.src).toBe('/first.jpg'),
    );
    rerender({ resolver: undefined });
    expect(result.current.getImage(0)?.src).toBe('/original.jpg');
    expect(result.current.isResolved(0)).toBe(true);
    rerender({ resolver: second });
    expect(result.current.isResolved(0)).toBe(false);
    act(() => result.current.prefetchImages([0]));
    await waitFor(() =>
      expect(result.current.getImage(0)?.src).toBe('/second.jpg'),
    );
  });

  it('resolves images correctly under StrictMode', async () => {
    const images = [{ src: '/original.jpg' }];
    const resolver = vi.fn(async () => ({ src: '/resolved.jpg' }));
    const { result } = renderHook(() => useImages(images, resolver), {
      wrapper: StrictMode,
    });
    act(() => result.current.prefetchImages([0]));
    await waitFor(() =>
      expect(result.current.getImage(0)?.src).toBe('/resolved.jpg'),
    );
  });

  it('refreshes again when a previous resolver is reused after another resolver', async () => {
    const images = [{ src: '/original.jpg' }];
    const first = vi
      .fn()
      .mockResolvedValueOnce({ src: '/first-v1.jpg' })
      .mockResolvedValueOnce({ src: '/first-v2.jpg' });
    const second = vi.fn(async () => ({ src: '/second.jpg' }));
    const { result, rerender } = renderHook(
      ({
        resolver,
      }: {
        resolver: (image: CarouselImage) => Promise<CarouselImage>;
      }) => useImages(images, resolver),
      { initialProps: { resolver: first } },
    );
    act(() => result.current.prefetchImages([0]));
    await waitFor(() =>
      expect(result.current.getImage(0)?.src).toBe('/first-v1.jpg'),
    );
    rerender({ resolver: second });
    act(() => result.current.prefetchImages([0]));
    await waitFor(() =>
      expect(result.current.getImage(0)?.src).toBe('/second.jpg'),
    );
    rerender({ resolver: first });
    expect(result.current.getImage(0)?.src).toBe('/second.jpg');
    act(() => result.current.prefetchImages([0]));
    await waitFor(() =>
      expect(result.current.getImage(0)?.src).toBe('/first-v2.jpg'),
    );
    expect(first).toHaveBeenCalledTimes(2);
  });

  it('allows a new resolver to recover after the previous resolver failed', async () => {
    const images = [{ src: '/original.jpg' }];
    const first = vi.fn(async () => {
      throw new Error('offline');
    });
    const second = vi.fn(async () => ({ src: '/recovered.jpg' }));
    const { result, rerender } = renderHook(
      ({
        resolver,
      }: {
        resolver: (image: CarouselImage) => Promise<CarouselImage>;
      }) => useImages(images, resolver),
      {
        initialProps: {
          resolver: first as (image: CarouselImage) => Promise<CarouselImage>,
        },
      },
    );
    act(() => result.current.prefetchImages([0]));
    await waitFor(() => expect(result.current.hasError(0)).toBe(true));
    rerender({ resolver: second });
    expect(result.current.hasError(0)).toBe(false);
    act(() => result.current.prefetchImages([0]));
    await waitFor(() =>
      expect(result.current.getImage(0)?.src).toBe('/recovered.jpg'),
    );
    expect(second).toHaveBeenCalledTimes(1);
  });
});
