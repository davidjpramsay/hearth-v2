import { useMemo, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';

import type { HourlyWeatherForecast, WeatherCondition, WeatherForecastDay } from '@hearth/shared';

import './WeatherScreen.css';

import { Icon, type IconName } from '../components/Icon';
import { EmptyState, FailureState, LoadingState, StatusBanner } from '../components/Status';
import { useWeatherForecastQuery } from '../hooks/useWeatherForecastQuery';

type WeatherMode = 'temperature' | 'rain' | 'wind';

const MODES: readonly WeatherMode[] = ['temperature', 'rain', 'wind'];

export function WeatherScreen({ preparing }: { preparing: boolean }) {
  const query = useWeatherForecastQuery(!preparing);
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
          <p>{forecast.locationLabel ?? 'Local weather'}</p>
          <span>{updatedLabel(forecast.updatedAt, forecast.generatedAt)}</span>
        </div>
        <div className="weather-current" aria-label={currentConditionsLabel(forecast.current)}>
          <Icon name={conditionIcon(forecast.current.condition)} />
          <strong>{forecast.current.temperatureCelsius}°</strong>
          <div>
            <b>{forecast.current.label}</b>
            <span>Feels {forecast.current.apparentTemperatureCelsius}°</span>
          </div>
          <dl>
            <div>
              <dt>Low / high</dt>
              <dd>
                {today?.lowTemperatureCelsius ?? '–'}° / {today?.highTemperatureCelsius ?? '–'}°
              </dd>
            </div>
            <div>
              <dt>Rain</dt>
              <dd>{forecast.current.precipitationProbabilityPercent}%</dd>
            </div>
            <div>
              <dt>Wind</dt>
              <dd>
                {forecast.current.windSpeedKph} km/h{' '}
                {compassDirection(forecast.current.windDirectionDegrees)}
              </dd>
            </div>
          </dl>
        </div>
      </header>

      {forecast.freshness === 'stale' ? (
        <StatusBanner kind="stale">Showing the last saved forecast.</StatusBanner>
      ) : null}

      <section className="weather-hourly" aria-labelledby="weather-hourly-title">
        <div className="weather-hourly__topline">
          <div>
            <h2 id="weather-hourly-title">Next 24 hours</h2>
            <SelectedHourSummary hour={selected} mode={mode} />
          </div>
          <div aria-label="Weather graph" className="weather-mode-switch" role="group">
            {MODES.map((candidate, index) => (
              <button
                aria-pressed={mode === candidate}
                className="focusable"
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

      <footer className="weather-attribution">
        Weather data by <a href="https://open-meteo.com/">Open-Meteo</a>
      </footer>
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
  const geometry = useMemo(() => chartGeometry(hours, mode), [hours, mode]);
  const selectedX = geometry.x(selectedIndex);
  return (
    <div
      aria-label={`${capitalise(mode)} forecast. Use left and right to inspect hours, or up and down to change graph.`}
      aria-valuemax={hours.length - 1}
      aria-valuemin={0}
      aria-valuenow={selectedIndex}
      aria-valuetext={`${hourLabel(hours[selectedIndex]?.time ?? hours[0]?.time ?? '00:00')}, ${selectedPrimaryValue(hours[selectedIndex] ?? hours[0]!, mode)}`}
      className="weather-chart focusable"
      data-focus-entry="true"
      data-focus-id="weather-chart"
      data-focus-left="nav-weather"
      data-focus-up={`weather-mode-${mode}`}
      onKeyDown={onKeyDown}
      role="slider"
      tabIndex={0}
    >
      <ChartLegend mode={mode} />
      <svg aria-hidden="true" viewBox="0 0 1000 300">
        {geometry.ticks.map((tick) => (
          <g className="weather-chart__grid" key={tick.value}>
            <line x1="58" x2="982" y1={tick.y} y2={tick.y} />
            <text x="48" y={tick.y + 5} textAnchor="end">
              {tick.label}
            </text>
          </g>
        ))}
        {hours.map((hour, index) =>
          index % 3 === 0 ? (
            <text
              className="weather-chart__condition"
              key={`condition-${hour.time}`}
              textAnchor="middle"
              x={geometry.x(index)}
              y="31"
            >
              {conditionGlyph(hour.condition, hour.time)}
            </text>
          ) : null,
        )}
        {mode === 'rain' ? (
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
        ) : (
          <>
            <polyline className="weather-chart__primary" points={geometry.primaryPoints} />
            <polyline className="weather-chart__secondary" points={geometry.secondaryPoints} />
          </>
        )}
        {mode === 'wind' ? (
          <g className="weather-chart__directions">
            {hours.map((hour, index) =>
              index % 3 === 0 ? (
                <text
                  key={`direction-${hour.time}`}
                  transform={`rotate(${hour.windDirectionDegrees} ${geometry.x(index)} 64)`}
                  x={geometry.x(index)}
                  y="69"
                  textAnchor="middle"
                >
                  ↑
                </text>
              ) : null,
            )}
          </g>
        ) : null}
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
        : (['Rain chance', 'Expected amount on selection'] as const);
  return (
    <span className={`weather-chart-legend weather-chart-legend--${mode}`} aria-hidden="true">
      <span>
        <i /> {labels[0]}
      </span>
      <span>
        <i /> {labels[1]}
      </span>
    </span>
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
      <h2 id="weather-week-title">Seven days</h2>
      <div className="weather-week__rows">
        {days.slice(0, 7).map((day, index) => {
          const rangeStart = rangePercent(day.lowTemperatureCelsius, domain);
          const rangeEnd = rangePercent(day.highTemperatureCelsius, domain);
          const current = rangePercent(currentTemperature, domain);
          return (
            <article className="weather-day" key={day.localDate}>
              <strong>{index === 0 ? 'Today' : weekday(day.localDate)}</strong>
              <Icon name={conditionIcon(day.condition)} />
              <span className="weather-day__rain">{day.precipitationProbabilityPercent}%</span>
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

function chartGeometry(hours: readonly HourlyWeatherForecast[], mode: WeatherMode) {
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
  const plotWidth = 924;
  const x = (index: number) => 58 + (plotWidth * index) / Math.max(1, hours.length - 1);
  const y = (value: number) =>
    baseline - ((value - minValue) / (maxValue - minValue)) * (baseline - top);
  const primaryPoints = primaryValues.map((value, index) => `${x(index)},${y(value)}`).join(' ');
  const secondaryPoints = secondaryValues
    .map((value, index) => `${x(index)},${mode === 'rain' ? baseline : y(value)}`)
    .join(' ');
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
    baseline,
    primaryPoints,
    primaryY: (index: number) => y(primaryValues[index] ?? minValue),
    secondaryPoints,
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

function conditionGlyph(condition: WeatherCondition, time: string): string {
  const hour = Number(time.slice(11, 13));
  if (condition === 'rain') return '☂';
  if (condition === 'cloudy') return '●';
  if (condition === 'partly-cloudy') return hour >= 18 || hour < 6 ? '☾' : '◒';
  return hour >= 18 || hour < 6 ? '☾' : '☀';
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
