import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { TodayPhoto } from './TodayPhoto';

afterEach(cleanup);

describe('TodayPhoto', () => {
  it('renders one accessible image without a decorative backing layer', () => {
    const { container } = render(
      <TodayPhoto
        photo={{
          alt: 'A family portrait.',
          url: '/demo/family-portrait.webp',
        }}
      />,
    );

    expect(screen.getByRole('img', { name: 'A family portrait.' })).toHaveClass(
      'today-photo__image',
    );
    expect(container.querySelectorAll('img')).toHaveLength(1);
    expect(container.querySelector('.today-photo__backdrop')).not.toBeInTheDocument();
  });
});
