import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PhotoAssetImage } from './PhotoAssetImage';

describe('PhotoAssetImage', () => {
  it('replaces a missing derivative with a family-readable fallback', () => {
    render(
      <PhotoAssetImage
        alt="Ezra and Maya at the park."
        className="test-photo"
        src="/demo/photos/missing.webp"
      />,
    );
    fireEvent.error(screen.getByRole('img', { name: 'Ezra and Maya at the park.' }));
    expect(
      screen.getByRole('img', {
        name: 'Ezra and Maya at the park. This photo is unavailable.',
      }),
    ).toHaveTextContent('Photo unavailable');
    expect(screen.queryByText(/missing\.webp/)).not.toBeInTheDocument();
  });
});
