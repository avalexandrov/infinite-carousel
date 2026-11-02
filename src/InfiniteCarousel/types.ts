import type { ReactNode } from 'react';

export type CarouselImage = {
  src: string;
  id?: string;
  alt?: string;
  width?: number;
  height?: number;
};

export type CarouselPlaceholderProps = {
  image: CarouselImage;
  index: number;
};

export type CarouselErrorProps = CarouselPlaceholderProps & {
  retry: () => void;
};

export type CarouselProps = {
  images: CarouselImage[];
  resolveImage?: (
    image: CarouselImage,
    signal?: AbortSignal,
  ) => Promise<CarouselImage>;
  maxImageHeight?: number;
  imageHeight?: number | ((trackWidth: number) => number);
  gap?: number;
  label?: string;
  className?: string;
  initialIndex?: number;
  buffer?: number;
  renderLoading?: (props: CarouselPlaceholderProps) => ReactNode;
  renderError?: (props: CarouselErrorProps) => ReactNode;
};

export type Geometry = {
  starts: number[];
  widths: number[];
  count: number;
  base: number;
};

export type Snapshot = {
  geometry: Geometry;
  signature: string;
};

export type Anchor = {
  logical: number;
  offset: number;
};
