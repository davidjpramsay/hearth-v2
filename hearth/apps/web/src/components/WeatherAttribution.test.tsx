import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { WeatherAttribution } from './WeatherAttribution';

describe('WeatherAttribution', () => {
  it('links live forecast data to Open-Meteo and leaves fictional demo weather unlabelled', () => {
    const { rerender } = render(<WeatherAttribution source="open-meteo" />);
    expect(screen.getByRole('link', { name: 'Open-Meteo' })).toHaveAttribute(
      'href',
      'https://open-meteo.com/',
    );

    rerender(<WeatherAttribution source="demo" />);
    expect(screen.queryByRole('link', { name: 'Open-Meteo' })).not.toBeInTheDocument();
  });
});
