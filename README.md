# Infinite carousel

A scroll-only, virtualized React carousel for images of different aspect ratios. Images share a responsive height and retain their full proportions; wide images may extend beyond the viewport. The demo uses Picsum and offers 30 or 1,500 images.

Requires Node.js 22.12 or newer and pnpm 12.

```sh
pnpm install
pnpm dev
```

## Using the carousel

```tsx
import { InfiniteCarousel, type CarouselImage } from './InfiniteCarousel';

const photos: CarouselImage[] = [
  {
    id: 'mountain',
    src: '/mountain.jpg',
    alt: 'A mountain',
    width: 1200,
    height: 800,
  },
  {
    id: 'forest',
    src: '/forest.jpg',
    alt: 'A forest',
    width: 800,
    height: 1200,
  },
];

<InfiniteCarousel
  images={photos}
  label="Travel photos"
  className="travel-carousel"
  imageHeight={(trackWidth) => Math.min(300, trackWidth / 2)}
  gap={16}
  initialIndex={0}
  buffer={12}
/>;
```

Supply new arrays and image objects when the collection changes. When no dimensions are provided, the carousel estimates an image's aspect ratio until the image loads. Sources can be any image URLs supported by the browser; Picsum is only used by the demo.

| Prop             | Purpose and default                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `images`         | Array of `{ src, id?, alt?, width?, height? }`. Supply a meaningful `alt` for informative images. An empty collection renders nothing.                                                                                                                                                                                                                                                                                                           |
| `imageHeight`    | Positive pixel height, or a function receiving the track width in pixels. It takes precedence over `maxImageHeight`. Invalid or non-positive values use the default sizing rule.                                                                                                                                                                                                                                                                 |
| `maxImageHeight` | Maximum height for the default responsive sizing rule; defaults to `420`. The rule uses 55% of track width, normally at least 160 pixels, capped by this maximum.                                                                                                                                                                                                                                                                                |
| `gap`            | Gap between items in pixels; defaults to `12`. Negative values become zero.                                                                                                                                                                                                                                                                                                                                                                      |
| `label`          | Accessible carousel region label; defaults to `Infinite carousel`.                                                                                                                                                                                                                                                                                                                                                                               |
| `className`      | Additional class on the outer carousel region. Scope styles to this class and avoid overriding the item dimensions used by virtualization.                                                                                                                                                                                                                                                                                                       |
| `initialIndex`   | Zero-based starting index, default `0`; clamped to the collection. Used on first mount and when a collection change resets the position. Changing it alone does not navigate the carousel.                                                                                                                                                                                                                                                       |
| `buffer`         | Number of additional items rendered on each side of the visible range; defaults to `12` and is clamped to 0–100. Non-finite values use the default.                                                                                                                                                                                                                                                                                              |
| `resolveImage`   | Optional async `(image, signal) => CarouselImage` for resolving a URL or dimensions near the viewport. The signal is aborted when the collection or resolver changes or the component unmounts; resolvers may ignore it. The carousel internally allows up to six concurrent resolver calls for the active collection; requests whose resolvers ignore cancellation may continue after a change. The browser manages image downloads separately. |
| `renderLoading`  | Optional `({ image, index }) => ReactNode` for the loading state during resolution or image download.                                                                                                                                                                                                                                                                                                                                            |
| `renderError`    | Optional `({ image, index, retry }) => ReactNode` for resolver or image download errors. Invoke `retry()` to retry without navigating the carousel. By default the carousel shows a retry button.                                                                                                                                                                                                                                                |

The carousel resets to `initialIndex` when image URLs or their order change. A change to `alt` or dimensions alone does not reset the collection. Keep an async resolver reference stable when its behavior has not changed to avoid unnecessary refreshes.

If a resolver refresh fails while a previous resolved image is available, the carousel keeps displaying that image.

An empty direct `src` displays an error without a retry button, because the caller must provide a valid URL. Custom error renderers can check `image.src` before offering retry.

A source-specific resolver can fetch metadata with the supplied cancellation signal:

```tsx
const resolvePhoto = async (image: CarouselImage, signal?: AbortSignal) => {
  const response = await fetch(`/api/photos/${image.id}`, { signal });
  if (!response.ok) throw new Error('Could not resolve image');
  const { url, width, height } = await response.json();
  return { ...image, src: url, width, height };
};

<InfiniteCarousel images={photos} resolveImage={resolvePhoto} />;
```

The Picsum demo requests image sizes based on the displayed height and device pixel ratio, up to 900 × 600. These request bounds are independent of displayed carousel dimensions. The carousel uses native horizontal scrolling; focus its track to scroll with a keyboard. Overscan items are excluded from the accessibility tree and keyboard focus until visible.

## Checks

- `pnpm test` / `pnpm test:watch` - component and utility tests
- `pnpm build` - type-check and build for production
- `pnpm lint` - run Oxlint
- `pnpm format` / `pnpm format:check` - format or check formatting with Prettier
- `pnpm preview` - preview the production build

The jsdom tests do not simulate real browser layout, touch gestures, or momentum. Verify momentum and accessibility on target mobile devices and assistive technologies before relying on them in production.
