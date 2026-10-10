import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WeatherForecast } from '@hearth/shared';

import { WeatherScreen } from './WeatherScreen';

const mocks = vi.hoisted(() => ({ instant: '2026-08-03T00:30:00.000Z', query: vi.fn() }));
vi.mock('../hooks/useHouseholdClock', () => ({
  useHouseholdDateTime: () => ({ instant: mocks.instant }),
}));
vi.mock('../hooks/useOnlineStatus', () => ({ useOnlineStatus: () => true }));
vi.mock('../runtime/sharedScreen', () => ({ useSharedScreen: () => false }));
vi.mock('../hooks/useWeatherForecastQuery', () => ({ useWeatherForecastQuery: mocks.query }));

function forecast(day = '2026-08-03'): WeatherForecast {
  const next = new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const hourly = Array.from({ length: 25 }, (_, index) => ({
    time: `${index === 24 ? next : day}T${String(index % 24).padStart(2, '0')}:00`,
    temperatureCelsius: 10 + index,
    apparentTemperatureCelsius: 9 + index,
    condition: 'clear' as const,
    label: 'Clear',
    precipitationProbabilityPercent: 10,
    precipitationMillimetres: 0,
    windSpeedKph: 10,
    windGustKph: 15,
    windDirectionDegrees: 0,
  }));
  return {
    householdId: 'household_test',
    timezone: 'Australia/Perth',
    locationLabel: 'Test weather',
    generatedAt: mocks.instant,
    updatedAt: mocks.instant,
    freshness: 'current',
    statusMessage: null,
    source: 'demo',
    current: hourly[8]!,
    hourly,
    daily: [],
  };
}

const view = () => (
  <MemoryRouter>
    <WeatherScreen preparing={false} scenario="healthy" />
  </MemoryRouter>
);

describe('weather clock and inspection', () => {
  it('maps taps through CSS zoom and ignores scrolling or cancelled pointers', () => {
    vi.stubGlobal('PointerEvent', MouseEvent);
    const { container } = render(view());
    const plot = container.querySelector('.weather-chart__plot')!;
    vi.spyOn(plot, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 0,
      width: 2000,
      height: 476,
      right: 2100,
      bottom: 476,
      x: 100,
      y: 0,
      toJSON: () => ({}),
    });
    const chart = screen.getByRole('slider');
    fireEvent.pointerDown(chart, { clientX: 1128, clientY: 120, button: 0 });
    fireEvent.pointerUp(chart, { clientX: 1128, clientY: 120, button: 0 });
    expect(chart).toHaveAttribute('aria-valuenow', '12');
    fireEvent.click(screen.getByRole('button', { name: 'Return to current time' }));
    fireEvent.pointerDown(chart, { clientX: 1128, clientY: 120, button: 0 });
    fireEvent.pointerUp(chart, { clientX: 1128, clientY: 180, button: 0 });
    expect(chart).toHaveAttribute('aria-valuenow', '8');
    fireEvent.pointerDown(chart, { clientX: 1128, clientY: 120, button: 0 });
    fireEvent.pointerCancel(chart);
    fireEvent.pointerUp(chart, { clientX: 1128, clientY: 120, button: 0 });
    expect(chart).toHaveAttribute('aria-valuenow', '8');
  });

  it('renders rainfall as amount bars in a separately labelled lane, with both selected values accessible', () => {
    const data = forecast();
    data.hourly[8]!.precipitationMillimetres = 1.5;
    mocks.query.mockReturnValue({ data, isPending: false, refetch: vi.fn() });
    const { container } = render(view());
    fireEvent.click(screen.getByRole('button', { name: 'Rain' }));
    expect(container.querySelector('.weather-chart__lane-label--chance')).toHaveTextContent(
      'Rain chance (%)',
    );
    expect(container.querySelector('.weather-chart__lane-label--amount')).toHaveTextContent(
      'Expected rain (mm per hour)',
    );
    expect(container.querySelectorAll('.weather-chart__rain-bars rect')).toHaveLength(25);
    const bars = container.querySelectorAll('.weather-chart__rain-bars rect');
    expect(bars[0]).toHaveAttribute('height', '0');
    expect(Number(bars[8]!.getAttribute('height'))).toBeGreaterThan(0);
    expect(container.querySelector('.weather-chart__rain-amount')).toBeNull();
    expect(screen.getByRole('slider')).toHaveAttribute(
      'aria-valuetext',
      '8 am, 10% chance, 1.5 mm expected',
    );
    expect(container.querySelector('.weather-selected-hour')).toHaveTextContent(
      '10% chance1.5 mm expected',
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });
  beforeEach(() => {
    mocks.instant = '2026-08-03T00:30:00.000Z';
    mocks.query.mockReturnValue({ data: forecast(), isPending: false, refetch: vi.fn() });
  });

  it('observes the HTML canvas rather than the SVG user-space bounds and disconnects on unmount', () => {
    const observe = vi.fn();
    const disconnect = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe = observe;
        disconnect = disconnect;
      },
    );
    const { container, unmount } = render(view());
    expect(observe).toHaveBeenCalledWith(container.querySelector('.weather-chart__canvas'));
    expect(observe).not.toHaveBeenCalledWith(container.querySelector('.weather-chart__plot'));
    unmount();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('follows current household time without waiting for a weather refresh', () => {
    const { container, rerender } = render(view());
    expect(container.querySelector('.weather-chart__now')).toHaveAttribute('data-minute', '510');
    const firstX = Number(
      container.querySelector('.weather-chart__now circle')!.getAttribute('cx'),
    );
    mocks.instant = '2026-08-03T00:31:00.000Z';
    rerender(view());
    expect(container.querySelector('.weather-chart__now')).toHaveAttribute('data-minute', '511');
    expect(
      Number(container.querySelector('.weather-chart__now circle')!.getAttribute('cx')),
    ).toBeGreaterThan(firstX);
    expect(container.querySelector('.weather-selected-hour')).toHaveTextContent('Now · 8 am');
  });

  it('retains deliberate inspection while the separate now dot moves and can return to following', () => {
    const { container, rerender } = render(view());
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowRight' });
    expect(container.querySelector('.weather-selected-hour')).toHaveTextContent('9 am');
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuenow', '9');
    mocks.instant = '2026-08-03T02:00:00.000Z';
    rerender(view());
    expect(container.querySelector('.weather-selected-hour')).toHaveTextContent('9 am');
    expect(container.querySelector('.weather-chart__now')).toHaveAttribute('data-minute', '600');
    fireEvent.click(screen.getByRole('button', { name: 'Return to current time' }));
    expect(container.querySelector('.weather-selected-hour')).toHaveTextContent('Now · 10 am');
    expect(container.querySelector('.weather-chart__selected-point')).toBeNull();
  });

  it('resets a previous-day inspection on a fresh day without labelling old cached weather as now', () => {
    const { container, rerender } = render(view());
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowRight' });
    mocks.instant = '2026-08-03T16:00:00.000Z';
    rerender(view());
    expect(container.querySelector('.weather-chart__now')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Showing the last saved forecast');
    mocks.query.mockReturnValue({
      data: forecast('2026-08-04'),
      isPending: false,
      refetch: vi.fn(),
    });
    rerender(view());
    expect(container.querySelector('.weather-selected-hour')).toHaveTextContent('Now · 12 am');
    expect(container.querySelector('.weather-chart__now')).toHaveAttribute('data-minute', '0');
  });

  it('does not carry an inspected midnight endpoint into the next day as manual selection', () => {
    const { container, rerender } = render(view());
    for (let index = 8; index < 24; index += 1)
      fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowRight' });
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuenow', '24');
    mocks.instant = '2026-08-03T16:00:00.000Z';
    mocks.query.mockReturnValue({
      data: forecast('2026-08-04'),
      isPending: false,
      refetch: vi.fn(),
    });
    rerender(view());
    expect(container.querySelector('.weather-selected-hour')).toHaveTextContent('Now · 12 am');
    expect(container.querySelector('.weather-chart__selected-point')).toBeNull();
  });

  it('keeps explicit midnight endpoints, mode switching and previous/next controls', () => {
    const { container } = render(view());
    const labels = [...container.querySelectorAll('.weather-chart__hour')].map(
      (element) => element.textContent,
    );
    expect(labels[0]).toBe('12 am');
    expect(labels.at(-1)).toBe('12 am');
    fireEvent.click(container.querySelector('button[aria-label="Next hour"]')!);
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuenow', '9');
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowDown' });
    expect(screen.getByRole('button', { name: 'Rain' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(container.querySelector('button[aria-label="Previous hour"]')!);
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuenow', '8');
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowRight' });
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'Enter' });
    expect(container.querySelector('.weather-selected-hour')).toHaveTextContent('Now · 8 am');
    expect(container.querySelector('.weather-chart__selected-point')).toBeNull();
  });
});
