import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InfiniteCarousel } from '../InfiniteCarousel';
import { createGeometry, imageSize, modulo } from '../utils';
import type { CarouselImage } from '../types';

function images(count: number): CarouselImage[] {
  return Array.from({ length: count }, (_, index) => ({
    src: `/photo-${index}.jpg`,
    alt: `Photo ${index + 1}`,
    width: index % 2 ? 400 : 800,
    height: 600,
  }));
}

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(420);
});

afterEach(() => vi.restoreAllMocks());

describe('rolling carousel', () => {
  it('prioritizes resolving visible images over prefetch images', async () => {
    const resolveImage = vi.fn(
      (_image: CarouselImage) => new Promise<CarouselImage>(() => {}),
    );
    const { container } = render(
      <InfiniteCarousel images={images(1500)} resolveImage={resolveImage} />,
    );
    fireEvent.scroll(container.querySelector('.carousel__track')!);
    await waitFor(() => expect(resolveImage).toHaveBeenCalled());
    expect(resolveImage.mock.calls[0][0].src).toBe('/photo-0.jpg');
  });
  it('exposes the custom region label and a keyboard-focusable track', () => {
    render(<InfiniteCarousel images={images(30)} label="Featured titles" />);
    const region = screen.getByRole('region', { name: 'Featured titles' });
    const track = region.querySelector<HTMLElement>('.carousel__track')!;
    track.focus();
    expect(track).toHaveFocus();
    expect(track).toHaveAttribute('tabindex', '0');
  });

  it('resolves an image once even when it appears multiple times', async () => {
    const data = [{ src: '/source', alt: 'Resolved' }];
    const resolveImage = vi.fn(async (image: CarouselImage) => ({
      ...image,
      src: '/resolved.jpg',
      width: 800,
      height: 400,
    }));
    const { container } = render(
      <InfiniteCarousel images={data} resolveImage={resolveImage} />,
    );
    fireEvent.scroll(container.querySelector('.carousel__track')!);
    await waitFor(() =>
      expect(screen.getAllByAltText('Resolved')[0]).toHaveAttribute(
        'src',
        '/resolved.jpg',
      ),
    );
    expect(resolveImage).toHaveBeenCalledTimes(1);
    expect(screen.getAllByAltText('Resolved')[0].parentElement).toHaveStyle({
      width: '840px',
      height: '420px',
    });
  });

  it('shows an accessible placeholder when image resolution fails', async () => {
    let rejectResolution!: (error: Error) => void;
    const resolveImage = vi.fn(() => {
      return new Promise<CarouselImage>((_, reject) => {
        rejectResolution = reject;
      });
    });
    const { container } = render(
      <InfiniteCarousel
        images={[{ src: '/source', alt: 'Unavailable' }]}
        resolveImage={resolveImage}
      />,
    );
    fireEvent.scroll(container.querySelector('.carousel__track')!);
    await waitFor(() => expect(resolveImage).toHaveBeenCalledTimes(1));
    await act(async () => {
      rejectResolution(new Error('Unable to resolve'));
    });
    await waitFor(() =>
      expect(
        screen.getAllByRole('button', { name: 'Retry Unavailable' }).length,
      ).toBeGreaterThan(0),
    );
  });

  it('resets to the first image after the collection changes', async () => {
    const { container, rerender } = render(
      <InfiniteCarousel images={images(30)} />,
    );
    const track = container.querySelector<HTMLElement>('.carousel__track')!;
    track.scrollLeft += 2000;
    fireEvent.scroll(track);
    const replacement = images(30).map((image, index) => ({
      ...image,
      src: `/replacement-${index}.jpg`,
      alt: `Replacement ${index + 1}`,
    }));
    rerender(<InfiniteCarousel images={replacement} />);
    fireEvent.scroll(track);
    await waitFor(() =>
      expect(screen.getByAltText('Replacement 1')).toBeInTheDocument(),
    );
    const widths = replacement.map((image) => imageSize(image, 420).width);
    expect(track.scrollLeft).toBeCloseTo(
      createGeometry(widths, 12, 800, -100).starts[100],
    );
  });

  it('renders portrait and very wide images at the same height without cropping', async () => {
    const data = [
      { src: '/wide.jpg', alt: 'Wide', width: 3200, height: 400 },
      { src: '/portrait.jpg', alt: 'Portrait', width: 400, height: 800 },
    ];
    const { container } = render(
      <InfiniteCarousel images={data} maxImageHeight={200} />,
    );
    fireEvent.scroll(container.querySelector('.carousel__track')!);
    await waitFor(() =>
      expect(screen.getAllByAltText('Wide').length).toBeGreaterThan(0),
    );

    const wide = screen.getAllByAltText('Wide')[0];
    const portrait = screen.getAllByAltText('Portrait')[0];
    expect(wide.parentElement).toHaveStyle({
      width: '1600px',
      height: '200px',
    });
    expect(portrait.parentElement).toHaveStyle({
      width: '100px',
      height: '200px',
    });
  });

  it('updates an estimated width after an image loads without changing its height', async () => {
    const { container } = render(
      <InfiniteCarousel
        images={[{ src: '/unknown.jpg', alt: 'Unknown' }]}
        maxImageHeight={200}
      />,
    );
    fireEvent.scroll(container.querySelector('.carousel__track')!);
    await waitFor(() =>
      expect(screen.getAllByAltText('Unknown').length).toBeGreaterThan(0),
    );
    const image = screen.getAllByAltText('Unknown')[0];
    expect(image.parentElement).toHaveStyle({
      width: '300px',
      height: '200px',
    });
    Object.defineProperty(image, 'naturalWidth', { value: 400 });
    Object.defineProperty(image, 'naturalHeight', { value: 800 });
    fireEvent.load(image);
    await waitFor(() =>
      expect(screen.getAllByAltText('Unknown')[0].parentElement).toHaveStyle({
        width: '100px',
        height: '200px',
      }),
    );
  });

  it.each([30, 1500])(
    'renders a bounded set for %i photos and starts with the first',
    async (count) => {
      const { container } = render(<InfiniteCarousel images={images(count)} />);
      const track = container.querySelector<HTMLElement>('.carousel__track')!;
      fireEvent.scroll(track);
      await waitFor(() =>
        expect(screen.getByAltText('Photo 1')).toBeInTheDocument(),
      );
      expect(container.querySelectorAll('img').length).toBeLessThan(40);
      expect(track.scrollLeft).toBeGreaterThan(0);
    },
  );

  it('wraps to the last photo when scrolling left past the first', async () => {
    const { container } = render(<InfiniteCarousel images={images(30)} />);
    const track = container.querySelector<HTMLElement>('.carousel__track')!;
    track.scrollLeft -= 20;
    fireEvent.scroll(track);
    await waitFor(() =>
      expect(screen.getByAltText('Photo 30')).toBeInTheDocument(),
    );
    expect(screen.getByAltText('Photo 1')).toBeInTheDocument();
  });

  it('prefetches in both directions without resolving the whole collection', async () => {
    const resolveImage = vi.fn(async (image: CarouselImage) => image);
    const { container } = render(
      <InfiniteCarousel images={images(1500)} resolveImage={resolveImage} />,
    );
    const track = container.querySelector<HTMLElement>('.carousel__track')!;
    track.scrollLeft -= 10;
    fireEvent.scroll(track);
    const precedingImage = await screen.findByAltText('Photo 1489');
    track.scrollLeft += 20;
    fireEvent.scroll(track);
    const followingImage = await screen.findByAltText('Photo 12');
    expect(precedingImage).toHaveAttribute('src', '/photo-1488.jpg');
    expect(followingImage).toHaveAttribute('src', '/photo-11.jpg');
    expect(precedingImage).not.toHaveAttribute('loading', 'lazy');
    expect(followingImage).not.toHaveAttribute('loading', 'lazy');
    expect(resolveImage.mock.calls.length).toBeLessThan(60);
  });

  it('handles an empty collection becoming populated', async () => {
    const { container, rerender } = render(<InfiniteCarousel images={[]} />);
    expect(container.querySelector('.carousel__track')).toBeNull();
    rerender(<InfiniteCarousel images={images(30)} />);
    const track = container.querySelector<HTMLElement>('.carousel__track')!;
    fireEvent.scroll(track);
    await waitFor(() =>
      expect(screen.getByAltText('Photo 1')).toBeInTheDocument(),
    );
  });
});

it.each([45, 155])(
  'recenters the rolling window at slot %i without changing the logical image',
  async (oldIndex) => {
    const data = images(30);
    const widths = data.map((image) => imageSize(image, 420).width);
    const old = createGeometry(widths, 12, 800, -100);
    const { container } = render(<InfiniteCarousel images={data} />);
    const track = container.querySelector<HTMLElement>('.carousel__track')!;
    track.scrollLeft = old.starts[oldIndex] + 10;
    fireEvent.scroll(track);
    const logical = old.base + oldIndex;
    const moved = createGeometry(widths, 12, 800, logical - 100);
    await waitFor(() =>
      expect(track.scrollLeft).toBeCloseTo(moved.starts[100] + 10),
    );
    expect(
      screen.getByAltText(`Photo ${modulo(logical, data.length) + 1}`),
    ).toBeInTheDocument();
  },
);
