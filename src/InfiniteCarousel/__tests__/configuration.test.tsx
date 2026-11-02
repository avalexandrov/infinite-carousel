import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InfiniteCarousel } from '../InfiniteCarousel';
import { createGeometry } from '../utils';
import type { CarouselImage } from '../types';

function makeImages(count: number): CarouselImage[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `id-${index}`,
    src: `/image-${index}.jpg`,
    alt: `Image ${index}`,
    width: 100,
    height: 100,
  }));
}

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(420);
});

afterEach(() => vi.restoreAllMocks());

describe('carousel configuration', () => {
  it('keeps the displayed image while a changed resolver refreshes it', async () => {
    const data = makeImages(1);
    const first = async (image: CarouselImage) => ({
      ...image,
      src: '/small.jpg',
    });
    let finish!: (image: CarouselImage) => void;
    const second = vi.fn(
      () =>
        new Promise<CarouselImage>((resolve) => {
          finish = resolve;
        }),
    );
    const { container, rerender } = render(
      <InfiniteCarousel images={data} resolveImage={first} />,
    );
    fireEvent.scroll(container.querySelector('.carousel__track')!);
    await waitFor(() =>
      expect(screen.getAllByAltText('Image 0')[0]).toHaveAttribute(
        'src',
        '/small.jpg',
      ),
    );

    rerender(<InfiniteCarousel images={data} resolveImage={second} />);
    expect(screen.getAllByAltText('Image 0')[0]).toHaveAttribute(
      'src',
      '/small.jpg',
    );
    await waitFor(() => expect(second).toHaveBeenCalledTimes(1));
    await act(async () => finish({ ...data[0], src: '/large.jpg' }));
    await waitFor(() =>
      expect(screen.getAllByAltText('Image 0')[0]).toHaveAttribute(
        'src',
        '/large.jpg',
      ),
    );
  });

  it('uses a custom class and fixed or responsive image height', async () => {
    const data = makeImages(30);
    const { container, rerender } = render(
      <InfiniteCarousel images={data} className="featured" imageHeight={200} />,
    );
    const track = container.querySelector<HTMLElement>('.carousel__track')!;
    fireEvent.scroll(track);
    const region = screen.getByRole('region', { name: 'Infinite carousel' });
    expect(region).toHaveClass('featured');
    await waitFor(() =>
      expect(screen.getByAltText('Image 0').parentElement).toHaveStyle({
        height: '200px',
        width: '200px',
      }),
    );
    rerender(
      <InfiniteCarousel images={data} imageHeight={(width) => width / 8} />,
    );
    await waitFor(() =>
      expect(screen.getByAltText('Image 0').parentElement).toHaveStyle({
        height: '100px',
      }),
    );
    rerender(<InfiniteCarousel images={data} imageHeight={() => 0} />);
    await waitFor(() =>
      expect(screen.getByAltText('Image 0').parentElement).toHaveStyle({
        height: '420px',
      }),
    );
  });

  it('starts at the requested index even outside the initial window', async () => {
    const { container } = render(
      <InfiniteCarousel
        images={makeImages(1500)}
        initialIndex={1200}
        imageHeight={200}
      />,
    );
    const track = container.querySelector<HTMLElement>('.carousel__track')!;
    fireEvent.scroll(track);
    await waitFor(() =>
      expect(
        screen.getByRole('img', { name: 'Image 1200' }),
      ).toBeInTheDocument(),
    );
  });

  it('clamps an out-of-range initial index to the last image', async () => {
    const { container } = render(
      <InfiniteCarousel images={makeImages(30)} initialIndex={500} />,
    );
    fireEvent.scroll(container.querySelector('.carousel__track')!);
    await waitFor(() =>
      expect(screen.getByRole('img', { name: 'Image 29' })).toBeInTheDocument(),
    );
  });

  it('starts at the initial image when a previously empty collection is repopulated', async () => {
    const data = makeImages(30);
    const { container, rerender } = render(
      <InfiniteCarousel images={data} initialIndex={2} imageHeight={200} />,
    );
    const track = container.querySelector<HTMLElement>('.carousel__track')!;
    track.scrollLeft += 1000;
    fireEvent.scroll(track);
    rerender(
      <InfiniteCarousel images={[]} initialIndex={2} imageHeight={200} />,
    );
    rerender(
      <InfiniteCarousel images={data} initialIndex={2} imageHeight={200} />,
    );
    fireEvent.scroll(container.querySelector('.carousel__track')!);
    await waitFor(() =>
      expect(screen.getByRole('img', { name: 'Image 2' })).toBeInTheDocument(),
    );
  });

  it('resets to initialIndex when the collection is reordered', async () => {
    const data = makeImages(30);
    const { container, rerender } = render(
      <InfiniteCarousel images={data} initialIndex={1} imageHeight={200} />,
    );
    const track = container.querySelector<HTMLElement>('.carousel__track')!;
    track.scrollLeft += 1000;
    fireEvent.scroll(track);
    const reordered = [...data].reverse();
    rerender(
      <InfiniteCarousel
        images={reordered}
        initialIndex={1}
        imageHeight={200}
      />,
    );
    fireEvent.scroll(track);
    await waitFor(() =>
      expect(screen.getByRole('img', { name: 'Image 28' })).toBeInTheDocument(),
    );
    const geometry = createGeometry(Array(30).fill(200), 12, 800, -100);
    expect(track.scrollLeft).toBeCloseTo(geometry.starts[101]);
  });

  it('limits active resolutions to six by default', async () => {
    const resolveImage = vi.fn(
      (_image: CarouselImage) => new Promise<CarouselImage>(() => {}),
    );
    const { container } = render(
      <InfiniteCarousel
        images={makeImages(1500)}
        resolveImage={resolveImage}
        buffer={12}
      />,
    );
    fireEvent.scroll(container.querySelector('.carousel__track')!);
    await waitFor(() => expect(resolveImage).toHaveBeenCalledTimes(6));
  });

  it('permits disabling both overscan buffers', async () => {
    const { container } = render(
      <InfiniteCarousel images={makeImages(30)} imageHeight={200} buffer={0} />,
    );
    fireEvent.scroll(container.querySelector('.carousel__track')!);
    await waitFor(() =>
      expect(screen.getByRole('img', { name: 'Image 0' })).toBeInTheDocument(),
    );
    expect(
      container.querySelectorAll('.carousel__virtual-item[inert]'),
    ).toHaveLength(0);
  });

  it('uses LTR and keeps offscreen overscan out of the accessibility tree', async () => {
    const { container } = render(
      <InfiniteCarousel images={makeImages(30)} imageHeight={200} />,
    );
    const region = screen.getByRole('region', { name: 'Infinite carousel' });
    const track = container.querySelector<HTMLElement>('.carousel__track')!;
    expect(region).toHaveAttribute('dir', 'ltr');
    expect(track.scrollLeft).toBeGreaterThan(0);
    fireEvent.scroll(track);
    await waitFor(() =>
      expect(screen.getByRole('img', { name: 'Image 0' })).toBeInTheDocument(),
    );
    const items = [
      ...container.querySelectorAll<HTMLElement>('.carousel__virtual-item'),
    ];
    expect(
      items.some(
        (item) =>
          item.hasAttribute('inert') &&
          item.getAttribute('aria-hidden') === 'true',
      ),
    ).toBe(true);
  });

  it.each([
    { buffer: undefined, expected: 12 },
    { buffer: 2, expected: 2 },
  ])(
    'uses a symmetric buffer of $expected on both sides',
    async ({ buffer, expected }) => {
      const { container } = render(
        <InfiniteCarousel
          images={makeImages(1500)}
          imageHeight={200}
          buffer={buffer}
        />,
      );
      const track = container.querySelector<HTMLElement>('.carousel__track')!;
      fireEvent.scroll(track);
      await waitFor(() =>
        expect(
          screen.getByRole('img', { name: 'Image 0' }),
        ).toBeInTheDocument(),
      );
      const items = [
        ...container.querySelectorAll<HTMLElement>('.carousel__virtual-item'),
      ];
      const firstVisible = items.findIndex(
        (item) => !item.hasAttribute('inert'),
      );
      const lastVisible = items.findLastIndex(
        (item) => !item.hasAttribute('inert'),
      );
      expect(firstVisible).toBe(expected);
      expect(items.length - lastVisible - 1).toBe(expected);
    },
  );

  it('shows a custom loading state and retries a resolver failure', async () => {
    const resolveImage = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockImplementation(async (image: CarouselImage) => image);
    const { container } = render(
      <InfiniteCarousel
        images={makeImages(30)}
        resolveImage={resolveImage}
        renderLoading={({ index }) => <span>Loading {index}</span>}
        renderError={({ index, retry }) => (
          <button onClick={retry}>Retry item {index}</button>
        )}
      />,
    );
    fireEvent.scroll(container.querySelector('.carousel__track')!);
    expect(screen.getAllByText(/Loading/).length).toBeGreaterThan(0);
    const retry = await screen.findByRole('button', { name: 'Retry item 0' });
    fireEvent.click(retry);
    await waitFor(() =>
      expect(screen.getByRole('img', { name: 'Image 0' })).toHaveAttribute(
        'src',
        '/image-0.jpg',
      ),
    );
    expect(
      resolveImage.mock.calls.filter(([image]) => image.id === 'id-0'),
    ).toHaveLength(2);
  });

  it('allows retry after an image download error', async () => {
    const { container } = render(<InfiniteCarousel images={makeImages(30)} />);
    fireEvent.scroll(container.querySelector('.carousel__track')!);
    const image = await screen.findByAltText('Image 0');
    fireEvent.error(image);
    const retry = await screen.findByRole('button', { name: 'Retry Image 0' });
    fireEvent.click(retry);
    expect(screen.getByRole('img', { name: 'Image 0' })).toHaveAttribute(
      'src',
      '/image-0.jpg',
    );
  });

  it('shows an error for an empty direct source and recovers when it changes', async () => {
    const data = makeImages(30);
    data[0] = { ...data[0], src: '' };
    const { container, rerender } = render(<InfiniteCarousel images={data} />);
    fireEvent.scroll(container.querySelector('.carousel__track')!);
    expect(
      await screen.findByText('Unable to load Image 0.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Retry Image 0' }),
    ).not.toBeInTheDocument();

    rerender(
      <InfiniteCarousel
        images={[{ ...data[0], src: '/fixed.jpg' }, ...data.slice(1)]}
      />,
    );
    fireEvent.scroll(container.querySelector('.carousel__track')!);
    expect(await screen.findByRole('img', { name: 'Image 0' })).toHaveAttribute(
      'src',
      '/fixed.jpg',
    );
  });

  it('uses the custom error renderer for an empty direct source', async () => {
    const data = makeImages(30);
    data[0] = { ...data[0], src: '' };
    const { container } = render(
      <InfiniteCarousel
        images={data}
        renderError={({ image }) => <span>Missing source for {image.alt}</span>}
      />,
    );
    fireEvent.scroll(container.querySelector('.carousel__track')!);
    expect(
      await screen.findByText('Missing source for Image 0'),
    ).toBeInTheDocument();
  });

  it('allows retry when a resolver fails for an initially empty source', async () => {
    const resolveImage = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ src: '/generated.jpg', alt: 'Generated' });
    const { container } = render(
      <InfiniteCarousel
        images={[{ src: '', alt: 'Generated' }]}
        resolveImage={resolveImage}
      />,
    );
    fireEvent.scroll(container.querySelector('.carousel__track')!);
    const buttons = await screen.findAllByRole('button', {
      name: 'Retry Generated',
    });
    fireEvent.click(buttons[0]);
    await waitFor(() =>
      expect(screen.getAllByAltText('Generated')[0]).toHaveAttribute(
        'src',
        '/generated.jpg',
      ),
    );
  });

  it('keeps a custom loading indicator visible until image bytes load', async () => {
    const { container } = render(
      <InfiniteCarousel
        images={makeImages(30)}
        renderLoading={({ index }) => <span>Preparing {index}</span>}
      />,
    );
    fireEvent.scroll(container.querySelector('.carousel__track')!);
    const image = await screen.findByAltText('Image 0');
    const item = image.parentElement!;
    expect(item.querySelector('.carousel__loading-overlay')).toHaveTextContent(
      'Preparing 0',
    );
    fireEvent.load(image);
    expect(
      item.querySelector('.carousel__loading-overlay'),
    ).not.toBeInTheDocument();
  });

  it('aborts obsolete resolver work when unmounted', async () => {
    let signal: AbortSignal | undefined;
    const resolveImage = vi.fn(
      (_image: CarouselImage, requestSignal?: AbortSignal) => {
        signal = requestSignal;
        return new Promise<CarouselImage>(() => {});
      },
    );
    const { container, unmount } = render(
      <InfiniteCarousel images={makeImages(30)} resolveImage={resolveImage} />,
    );
    fireEvent.scroll(container.querySelector('.carousel__track')!);
    await waitFor(() => expect(resolveImage).toHaveBeenCalled());
    expect(signal?.aborted).toBe(false);
    act(() => unmount());
    expect(signal?.aborted).toBe(true);
  });
});
