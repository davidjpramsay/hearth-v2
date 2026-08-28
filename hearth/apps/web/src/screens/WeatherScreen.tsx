import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';

import type {
  DemoScenario,
  HourlyWeatherForecast,
  WeatherCondition,
  WeatherForecastDay,
} from '@hearth/shared';

import './WeatherScreen.css';

import { Icon, type IconName } from '../components/Icon';
import { EmptyState, FailureState, LoadingState, StatusBanner } from '../components/Status';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useWeatherForecastQuery } from '../hooks/useWeatherForecastQuery';

type WeatherMode = 'temperature' | 'rain' | 'wind';

const MODES: readonly WeatherMode[] = ['temperature', 'rain', 'wind'];

export function WeatherScreen({
  preparing,
  scenario,
}: {
  preparing: boolean;
  scenario: DemoScenario | 'offline';
}) {
  const query = useWeatherForecastQuery(!preparing);
  const online = useOnlineStatus(scenario === 'offline');
  const [mode, setMode] = useState<WeatherMode>('temperature');
  const [selectedIndex, setSelectedIndex] = useState(0);

  if (preparing || query.isPending) return <LoadingState />;
  if (query.data === undefined) return <FailureState onRetry={() => void query.refetch()} />;

  const forecast = query.data;
  if (forecast.current === null || forecast.hourly.length === 0) {
    return (
      <div className="screen weather-screen weather-screen--empty">
        <EmptyState title="Set a weather location" description="Choose it in Household settings." />
        <Link className="weather-setup-link focusable" to="/admin/household">
          Open settings <Icon name="chevron-right" />
        </Link>
      </div>
    );
  }

  const selected = forecast.hourly[Math.min(selectedIndex, forecast.hourly.length - 1)]!;
  const today = forecast.daily.find((day) => day.localDate === forecast.current?.time.slice(0, 10));

  return (
    <div className="screen weather-screen">
      <header className="weather-hero">
        <div className="weather-hero__title">
          <h1>Weather</h1>
          <p>
            {forecast.locationLabel ?? 'Local weather'} <Icon name="location" />
          </p>
          <span className="weather-updated">
            <i aria-hidden="true" /> {updatedLabel(forecast.updatedAt, forecast.generatedAt)}
          </span>
        </div>
        <div className="weather-current" aria-label={currentConditionsLabel(forecast.current)}>
          <div className="weather-current__temperature">
            <Icon name={conditionIcon(forecast.current.condition)} />
            <strong>{forecast.current.temperatureCelsius}°</strong>
          </div>
          <div className="weather-current__feels">
            <span>Feels like {forecast.current.apparentTemperatureCelsius}°</span>
            <strong>
              {today?.lowTemperatureCelsius ?? '–'}° / {today?.highTemperatureCelsius ?? '–'}°
            </strong>
          </div>
          <div className="weather-current__detail">
            <strong>{forecast.current.label}</strong>
            <div>
              <span>
                <Icon name="droplet" /> {forecast.current.precipitationProbabilityPercent}%
              </span>
              <span>
                <Icon name="wind" /> {forecast.current.windSpeedKph} km/h{' '}
                {compassDirection(forecast.current.windDirectionDegrees)}
              </span>
            </div>
          </div>
        </div>
      </header>

      {!online ? (
        <StatusBanner kind="offline">Offline · Showing saved weather.</StatusBanner>
      ) : forecast.freshness === 'stale' ? (
        <StatusBanner kind="stale">Showing the last saved forecast.</StatusBanner>
      ) : null}

      <div aria-label="Weather graph" className="weather-mode-switch" role="group">
        {MODES.map((candidate, index) => (
          <button
            aria-pressed={mode === candidate}
            className="focusable"
            data-focus-entry={index === 0 ? 'true' : undefined}
            data-focus-id={`weather-mode-${candidate}`}
            data-focus-left={index === 0 ? 'nav-weather' : `weather-mode-${MODES[index - 1]}`}
            data-focus-right={
              index === MODES.length - 1
                ? `weather-mode-${candidate}`
                : `weather-mode-${MODES[index + 1]}`
            }
            data-focus-down="weather-chart"
            key={candidate}
            onClick={() => setMode(candidate)}
            type="button"
          >
            {capitalise(candidate)}
          </button>
        ))}
      </div>

      <section className="weather-hourly" aria-labelledby="weather-hourly-title">
        <h2 className="sr-only" id="weather-hourly-title">
          Next 24 hours
        </h2>
        <div className="weather-hourly__topline">
          <SelectedHourSummary hour={selected} mode={mode} />
          <ChartLegend mode={mode} />
        </div>

        <div className="weather-chart-shell">
          <button
            aria-label="Previous hour"
            className="weather-hour-step weather-hour-step--previous focusable"
            disabled={selectedIndex === 0}
            onClick={() => setSelectedIndex((index) => Math.max(0, index - 1))}
            type="button"
          >
            <Icon name="chevron-left" />
          </button>
          <WeatherChart
            hours={forecast.hourly}
            mode={mode}
            onKeyDown={(event) => handleChartKeys(event, forecast.hourly.length)}
            selectedIndex={selectedIndex}
          />
          <button
            aria-label="Next hour"
            className="weather-hour-step weather-hour-step--next focusable"
            disabled={selectedIndex >= forecast.hourly.length - 1}
            onClick={() =>
              setSelectedIndex((index) => Math.min(forecast.hourly.length - 1, index + 1))
            }
            type="button"
          >
            <Icon name="chevron-right" />
          </button>
        </div>
      </section>

      <SevenDayForecast
        currentTemperature={forecast.current.temperatureCelsius}
        days={forecast.daily}
      />
    </div>
  );

  function handleChartKeys(event: KeyboardEvent<HTMLDivElement>, hourCount: number): void {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      if (
        (event.key === 'ArrowLeft' && selectedIndex === 0) ||
        (event.key === 'ArrowRight' && selectedIndex === hourCount - 1)
      ) {
        return;
      }
      event.preventDefault();
      const delta = event.key === 'ArrowLeft' ? -1 : 1;
      setSelectedIndex((index) => Math.max(0, Math.min(hourCount - 1, index + delta)));
      return;
    }
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      const currentModeIndex = MODES.indexOf(mode);
      const delta = event.key === 'ArrowUp' ? -1 : 1;
      setMode(MODES[(currentModeIndex + delta + MODES.length) % MODES.length]!);
    }
  }
}

function SelectedHourSummary({ hour, mode }: { hour: HourlyWeatherForecast; mode: WeatherMode }) {
  return (
    <p aria-live="polite" className="weather-selected-hour">
      <time>{hourLabel(hour.time)}</time>
      <strong>{selectedPrimaryValue(hour, mode)}</strong>
      <span>{selectedSecondaryValue(hour, mode)}</span>
    </p>
  );
}

function WeatherChart({
  hours,
  mode,
  selectedIndex,
  onKeyDown,
}: {
  hours: readonly HourlyWeatherForecast[];
  mode: WeatherMode;
  selectedIndex: number;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasWidth, setCanvasWidth] = useState(1000);
  const geometry = useMemo(
    () => chartGeometry(hours, mode, canvasWidth),
    [canvasWidth, hours, mode],
  );
  const selectedX = geometry.x(selectedIndex);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return undefined;
    const updateWidth = () => setCanvasWidth(Math.max(360, Math.round(canvas.clientWidth)));
    updateWidth();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(updateWidth);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      aria-label={`${capitalise(mode)} forecast. Use left and right to inspect hours, or up and down to change graph.`}
      aria-valuemax={hours.length - 1}
      aria-valuemin={0}
      aria-valuenow={selectedIndex}
      aria-valuetext={`${hourLabel(hours[selectedIndex]?.time ?? hours[0]?.time ?? '00:00')}, ${selectedPrimaryValue(hours[selectedIndex] ?? hours[0]!, mode)}`}
      className="weather-chart focusable"
      data-focus-id="weather-chart"
      data-focus-left="nav-weather"
      data-focus-up={`weather-mode-${mode}`}
      onKeyDown={onKeyDown}
      role="slider"
      tabIndex={0}
    >
      <div className="weather-chart__canvas" ref={canvasRef}>
        <div
          className={`weather-chart__markers weather-chart__markers--${mode}`}
          aria-hidden="true"
        >
          {hours.map((hour, index) =>
            index % 2 === 0 ? (
              <span
                className={`weather-chart__marker weather-chart__marker--${hourlyMarkerTone(hour)}`}
                key={`marker-${hour.time}`}
                style={{ left: `${geometry.x(index)}px` }}
              >
                {mode === 'wind' ? (
                  <i style={{ transform: `rotate(${hour.windDirectionDegrees}deg)` }}>↑</i>
                ) : (
                  <Icon name={hourlyConditionIcon(hour)} />
                )}
              </span>
            ) : null,
          )}
        </div>
        <svg aria-hidden="true" preserveAspectRatio="none" viewBox={`0 0 ${canvasWidth} 300`}>
          <defs>
            <linearGradient id={`weather-area-${mode}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="var(--eucalyptus)" stopOpacity="0.32" />
              <stop offset="1" stopColor="var(--eucalyptus)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {geometry.ticks.map((tick) => (
            <g className="weather-chart__grid" key={tick.value}>
              <line x1="58" x2={canvasWidth - 18} y1={tick.y} y2={tick.y} />
              <text x="48" y={tick.y + 5} textAnchor="end">
                {tick.label}
              </text>
            </g>
          ))}
          {mode === 'rain' ? (
            <>
              <g className="weather-chart__rain-bars">
                {hours.map((hour, index) => {
                  const y = geometry.y(hour.precipitationProbabilityPercent);
                  return (
                    <rect
                      height={geometry.baseline - y}
                      key={hour.time}
                      rx="3"
                      width="24"
                      x={geometry.x(index) - 12}
                      y={y}
                    />
                  );
                })}
              </g>
              <path className="weather-chart__rain-amount" d={geometry.secondaryPath} />
            </>
          ) : (
            <>
              <path
                className="weather-chart__area"
                d={geometry.areaPath}
                fill={`url(#weather-area-${mode})`}
              />
              <path className="weather-chart__primary" d={geometry.primaryPath} />
              <path className="weather-chart__secondary" d={geometry.secondaryPath} />
            </>
          )}
          <line
            className="weather-chart__selected-line"
            x1={selectedX}
            x2={selectedX}
            y1="42"
            y2="258"
          />
          <circle
            className="weather-chart__selected-point"
            cx={selectedX}
            cy={geometry.primaryY(selectedIndex)}
            r="7"
          />
          {hours.map((hour, index) =>
            index % 4 === 0 || index === hours.length - 1 ? (
              <text
                className="weather-chart__hour"
                key={`hour-${hour.time}`}
                textAnchor="middle"
                x={geometry.x(index)}
                y="287"
              >
                {hourLabel(hour.time)}
              </text>
            ) : null,
          )}
        </svg>
      </div>
      <p className="sr-only">{chartTextSummary(hours, mode)}</p>
    </div>
  );
}

function ChartLegend({ mode }: { mode: WeatherMode }) {
  const labels =
    mode === 'temperature'
      ? (['Actual', 'Feels like'] as const)
      : mode === 'wind'
        ? (['Wind', 'Gusts'] as const)
        : (['Rain chance', 'Expected rain'] as const);
  return (
    <div className={`weather-chart-legend weather-chart-legend--${mode}`} aria-hidden="true">
      <span>
        <i /> {labels[0]}
      </span>
      <span>
        <i /> {labels[1]}
      </span>
    </div>
  );
}

function SevenDayForecast({
  days,
  currentTemperature,
}: {
  days: readonly WeatherForecastDay[];
  currentTemperature: number;
}) {
  const domain = temperatureDomain(days);
  return (
    <section className="weather-week" aria-labelledby="weather-week-title">
      <h2 className="sr-only" id="weather-week-title">
        Seven days
      </h2>
      <div className="weather-week__rows">
        {days.slice(0, 7).map((day, index) => {
          const rangeStart = rangePercent(day.lowTemperatureCelsius, domain);
          const rangeEnd = rangePercent(day.highTemperatureCelsius, domain);
          const current = rangePercent(currentTemperature, domain);
          return (
            <article
              className={`weather-day${index === 0 ? ' weather-day--today' : ''}`}
              key={day.localDate}
            >
              <strong>{index === 0 ? 'Today' : weekday(day.localDate)}</strong>
              <Icon name={conditionIcon(day.condition)} />
              <span className="weather-day__condition">{day.label}</span>
              <span className="weather-day__rain">
                <Icon name="droplet" /> {day.precipitationProbabilityPercent}%
              </span>
              <span className="weather-day__low">{day.lowTemperatureCelsius}°</span>
              <span className="weather-day__range" aria-hidden="true">
                <i
                  style={{
                    left: `${rangeStart}%`,
                    width: `${Math.max(4, rangeEnd - rangeStart)}%`,
                  }}
                />
                {index === 0 ? <b style={{ left: `${current}%` }} /> : null}
              </span>
              <span className="weather-day__high">{day.highTemperatureCelsius}°</span>
              <span className="sr-only">
                {day.label}, {day.precipitationProbabilityPercent}% chance of rain, low{' '}
                {day.lowTemperatureCelsius}°, high {day.highTemperatureCelsius}°
              </span>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function chartGeometry(
  hours: readonly HourlyWeatherForecast[],
  mode: WeatherMode,
  canvasWidth: number,
) {
  const primaryValues = hours.map((hour) =>
    mode === 'temperature'
      ? hour.temperatureCelsius
      : mode === 'rain'
        ? hour.precipitationProbabilityPercent
        : hour.windSpeedKph,
  );
  const secondaryValues = hours.map((hour) =>
    mode === 'temperature'
      ? hour.apparentTemperatureCelsius
      : mode === 'rain'
        ? hour.precipitationMillimetres
        : hour.windGustKph,
  );
  const minValue =
    mode === 'rain' ? 0 : Math.floor(Math.min(...primaryValues, ...secondaryValues) / 5) * 5;
  const maxValue =
    mode === 'rain'
      ? 100
      : Math.max(minValue + 5, Math.ceil(Math.max(...primaryValues, ...secondaryValues) / 5) * 5);
  const top = 78;
  const baseline = 258;
  const plotWidth = canvasWidth - 76;
  const x = (index: number) => 58 + (plotWidth * index) / Math.max(1, hours.length - 1);
  const y = (value: number) =>
    baseline - ((value - minValue) / (maxValue - minValue)) * (baseline - top);
  const primaryCoordinates = primaryValues.map((value, index) => [x(index), y(value)] as const);
  const secondaryScaleMaximum =
    mode === 'rain' ? Math.max(3, ...secondaryValues) : Math.max(0.2, ...secondaryValues);
  const secondaryCoordinates = secondaryValues.map(
    (value, index) =>
      [
        x(index),
        mode === 'rain' ? baseline - (value / secondaryScaleMaximum) * (baseline - top) : y(value),
      ] as const,
  );
  const ticks = Array.from({ length: 5 }, (_, index) => {
    const value = minValue + ((maxValue - minValue) * index) / 4;
    return {
      value,
      y: y(value),
      label:
        mode === 'temperature'
          ? `${Math.round(value)}°`
          : mode === 'rain'
            ? `${Math.round(value)}%`
            : `${Math.round(value)}`,
    };
  });
  return {
    areaPath: `${smoothPath(primaryCoordinates)} L ${x(hours.length - 1)} ${baseline} L ${x(0)} ${baseline} Z`,
    baseline,
    primaryPath: smoothPath(primaryCoordinates),
    primaryY: (index: number) => y(primaryValues[index] ?? minValue),
    secondaryPath: smoothPath(secondaryCoordinates),
    ticks,
    x,
    y,
  };
}

function conditionIcon(condition: WeatherCondition): IconName {
  if (condition === 'clear') return 'sun';
  if (condition === 'partly-cloudy') return 'cloud-sun';
  if (condition === 'rain') return 'cloud-rain';
  return 'cloud';
}

function hourlyConditionIcon(hour: HourlyWeatherForecast): IconName {
  const localHour = Number(hour.time.slice(11, 13));
  if (hour.condition === 'rain') return 'cloud-rain';
  if (localHour >= 19 || localHour < 6) return 'moon';
  return conditionIcon(hour.condition);
}

function hourlyMarkerTone(hour: HourlyWeatherForecast): 'day' | 'night' | 'rain' | 'cloud' {
  const localHour = Number(hour.time.slice(11, 13));
  if (hour.condition === 'rain') return 'rain';
  if (localHour >= 19 || localHour < 6) return 'night';
  if (hour.condition === 'cloudy') return 'cloud';
  return 'day';
}

function smoothPath(points: readonly (readonly [number, number])[]): string {
  const first = points[0];
  if (first === undefined) return '';
  if (points.length === 1) return `M ${first[0]} ${first[1]}`;

  return points.slice(1).reduce((path, point, index) => {
    const previous = points[index]!;
    const midpointX = (previous[0] + point[0]) / 2;
    return `${path} C ${midpointX} ${previous[1]}, ${midpointX} ${point[1]}, ${point[0]} ${point[1]}`;
  }, `M ${first[0]} ${first[1]}`);
}

function selectedPrimaryValue(hour: HourlyWeatherForecast, mode: WeatherMode): string {
  if (mode === 'temperature') return `${hour.temperatureCelsius}°`;
  if (mode === 'rain') return `${hour.precipitationProbabilityPercent}%`;
  return `${hour.windSpeedKph} km/h ${compassDirection(hour.windDirectionDegrees)}`;
}

function selectedSecondaryValue(hour: HourlyWeatherForecast, mode: WeatherMode): string {
  if (mode === 'temperature') return `Feels ${hour.apparentTemperatureCelsius}°`;
  if (mode === 'rain') return `${hour.precipitationMillimetres.toFixed(1)} mm expected`;
  return `Gusts ${hour.windGustKph} km/h`;
}

function chartTextSummary(hours: readonly HourlyWeatherForecast[], mode: WeatherMode): string {
  if (mode === 'temperature') {
    return `Temperature ranges from ${Math.min(...hours.map((hour) => hour.temperatureCelsius))}° to ${Math.max(...hours.map((hour) => hour.temperatureCelsius))}° over the next 24 hours.`;
  }
  if (mode === 'rain') {
    return `The highest rain chance is ${Math.max(...hours.map((hour) => hour.precipitationProbabilityPercent))}%.`;
  }
  return `Wind reaches ${Math.max(...hours.map((hour) => hour.windSpeedKph))} kilometres per hour, with gusts up to ${Math.max(...hours.map((hour) => hour.windGustKph))}.`;
}

function temperatureDomain(days: readonly WeatherForecastDay[]): readonly [number, number] {
  if (days.length === 0) return [0, 1];
  const minimum = Math.min(...days.map((day) => day.lowTemperatureCelsius));
  const maximum = Math.max(...days.map((day) => day.highTemperatureCelsius));
  return minimum === maximum ? [minimum - 1, maximum + 1] : [minimum, maximum];
}

function rangePercent(value: number, [minimum, maximum]: readonly [number, number]): number {
  return Math.max(0, Math.min(100, ((value - minimum) / (maximum - minimum)) * 100));
}

function hourLabel(time: string): string {
  const hour = Number(time.slice(11, 13));
  if (hour === 0) return '12 am';
  if (hour === 12) return '12 pm';
  return `${hour % 12} ${hour < 12 ? 'am' : 'pm'}`;
}

function weekday(localDate: string): string {
  return new Intl.DateTimeFormat('en-AU', { weekday: 'short', timeZone: 'UTC' }).format(
    new Date(`${localDate}T12:00:00.000Z`),
  );
}

function compassDirection(degrees: number): string {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return directions[Math.round(degrees / 45) % 8] ?? 'N';
}

function updatedLabel(updatedAt: string | null, generatedAt: string): string {
  if (updatedAt === null) return 'No saved forecast';
  const minutes = Math.max(
    0,
    Math.round((new Date(generatedAt).getTime() - new Date(updatedAt).getTime()) / 60_000),
  );
  if (minutes < 1) return 'Updated now';
  if (minutes === 1) return 'Updated 1 minute ago';
  if (minutes < 60) return `Updated ${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  return `Updated ${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
}

function currentConditionsLabel(current: {
  temperatureCelsius: number;
  apparentTemperatureCelsius: number;
  label: string;
  precipitationProbabilityPercent: number;
  windSpeedKph: number;
}): string {
  return `${current.temperatureCelsius}°, feels ${current.apparentTemperatureCelsius}°, ${current.label}, ${current.precipitationProbabilityPercent}% chance of rain, wind ${current.windSpeedKph} kilometres per hour.`;
}

function capitalise(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}
