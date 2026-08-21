import { useState } from 'react';

import './PhotoAssetImage.css';

import { Icon } from './Icon';

export function PhotoAssetImage({
  alt,
  className,
  fetchPriority = 'auto',
  height,
  loading = 'lazy',
  src,
  width,
}: {
  alt: string;
  className: string;
  fetchPriority?: 'auto' | 'high' | 'low';
  height?: number;
  loading?: 'eager' | 'lazy';
  src: string;
  width?: number;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div
        aria-label={
          alt.length === 0 ? 'This photo is unavailable.' : `${alt} This photo is unavailable.`
        }
        className={`${className} photo-image-fallback`}
        role="img"
      >
        <Icon name="image" />
        <span>Photo unavailable</span>
      </div>
    );
  }
  return (
    <img
      alt={alt}
      className={className}
      decoding="async"
      fetchPriority={fetchPriority}
      height={height}
      loading={loading}
      onError={() => setFailed(true)}
      src={src}
      width={width}
    />
  );
}
