import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { InfiniteCarousel, type CarouselImage } from './InfiniteCarousel';
import {
  fitRequestSize,
  getRequestHeight,
  type ImageDimensions,
} from './picsum';
import './App.css';

function App() {
  const [imageCount, setImageCount] = useState(30);
  const [requestHeight, setRequestHeight] = useState(600);
  const carouselContainer = useRef<HTMLDivElement>(null);
  const metadata = useRef(new Map<string, Promise<ImageDimensions>>());

  useLayoutEffect(() => {
    const container = carouselContainer.current;
    if (!container) return;
    const update = () => {
      if (container.clientWidth > 0) {
        setRequestHeight(
          getRequestHeight(container.clientWidth, window.devicePixelRatio),
        );
      }
    };
    update();
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(container);
    window.addEventListener('resize', update);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  const images = useMemo<CarouselImage[]>(
    () =>
      Array.from({ length: imageCount }, (_, index) => ({
        src: `https://picsum.photos/seed/carousel-${index + 1}`,
        alt: `Infinite carousel photo ${index + 1}`,
      })),
    [imageCount],
  );

  // a Picsum-specific adapter for the demo; the carousel accepts any image source
  const resolveImage = useCallback(
    async (image: CarouselImage): Promise<CarouselImage> => {
      let request = metadata.current.get(image.src);
      if (!request) {
        request = fetch(`${image.src}/info`).then(async (response) => {
          if (!response.ok) throw new Error('Unable to load image metadata');
          const data: ImageDimensions = await response.json();
          if (!(data.width > 0 && data.height > 0))
            throw new Error('Invalid image dimensions');
          return data;
        });
        metadata.current.set(image.src, request);
        request.catch(() => metadata.current.delete(image.src));
      }
      const { width, height } = await request;
      const { width: requestedWidth, height: requestedHeight } = fitRequestSize(
        { width, height },
        { width: 900, height: requestHeight },
      );
      return {
        ...image,
        src: `${image.src}/${requestedWidth}/${requestedHeight}`,
        width,
        height,
      };
    },
    [requestHeight],
  );

  return (
    <main>
      <h1>Infinite carousel</h1>
      <div className="controls">
        <label>
          Data amount
          <select
            value={imageCount}
            onChange={(event) => setImageCount(Number(event.target.value))}
          >
            {[30, 1500].map((count) => (
              <option key={count} value={count}>
                {count.toLocaleString()} images
              </option>
            ))}
          </select>
        </label>
      </div>
      <div ref={carouselContainer}>
        <InfiniteCarousel images={images} resolveImage={resolveImage} />
      </div>
    </main>
  );
}

export default App;
