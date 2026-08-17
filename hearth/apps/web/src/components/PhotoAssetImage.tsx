import { useState } from 'react';

import './PhotoAssetImage.css';

import { Icon } from './Icon';

export function PhotoAssetImage({
  alt,
  className,
  fetchPriority = 'auto',
  loading = 'lazy',
  src,
}: {
  alt: string;
  className: string;
  fetchPriority?: 'auto' | 'high' | 'low';
  loading?: 'eager' | 'lazy';
  src: string;
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
      loading={loading}
      onError={() => setFailed(true)}
      src={src}
    />
  );
}
