import { useState } from 'react';
import { imageSize } from './utils';
import type { CarouselImage, CarouselProps } from './types';

export function Picture({
  image,
  index,
  resolved,
  failed,
  retry,
  reportImageError,
  renderLoading,
  renderError,
  recordSize,
  height,
}: {
  image: CarouselImage;
  index: number;
  resolved: boolean;
  failed: boolean;
  retry: () => void;
  reportImageError: (index: number, src: string) => void;
  renderLoading?: CarouselProps['renderLoading'];
  renderError?: CarouselProps['renderError'];
  recordSize: (index: number, width: number, height: number) => void;
  height: number;
}) {
  const [loadedSource, setLoadedSource] = useState('');
  const size = imageSize(image, height);
  const missingSource = resolved && !image.src && !failed;

  return (
    <div
      className="carousel__item"
      style={{ width: size.width, height: size.height }}
    >
      {failed || missingSource ? (
        <div className="carousel__placeholder carousel__error" role="status">
          {renderError ? (
            renderError({ image, index, retry })
          ) : (
            <>
              <span>Unable to load {image.alt || 'image'}.</span>
              {!missingSource && (
                <button
                  type="button"
                  onClick={retry}
                  aria-label={`Retry ${image.alt || 'image'}`}
                >
                  Retry
                </button>
              )}
            </>
          )}
        </div>
      ) : resolved && image.src ? (
        <>
          <img
            src={image.src}
            alt={image.alt ?? ''}
            loading="eager"
            decoding="async"
            draggable={false}
            onError={() => {
              setLoadedSource('');
              reportImageError(index, image.src);
            }}
            onLoad={(event) => {
              setLoadedSource(image.src);
              recordSize(
                index,
                event.currentTarget.naturalWidth,
                event.currentTarget.naturalHeight,
              );
            }}
          />
          {loadedSource !== image.src && renderLoading && (
            <div className="carousel__loading-overlay">
              {renderLoading({ image, index })}
            </div>
          )}
        </>
      ) : (
        <div className="carousel__placeholder">
          {renderLoading ? (
            renderLoading({ image, index })
          ) : (
            <span role="img" aria-label={image.alt || 'Image loading'} />
          )}
        </div>
      )}
    </div>
  );
}
