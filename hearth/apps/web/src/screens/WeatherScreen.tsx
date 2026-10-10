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
import { EmptyState, FailureState, LoadingState } from '../components/Status';
import { focusById, nextFocusId } from '../focus/focusGraph';
import { useHouseholdDateTime } from '../hooks/useHouseholdClock';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useSharedScreen } from '../runtime/sharedScreen';
import { useWeatherForecastQuery } from '../hooks/useWeatherForecastQuery';
import {
  chartGeometry,
  weatherClock,
  weatherMinute,
  type WeatherMode,
} from './weatherChartGeometry';

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
  const sharedScreen = useSharedScreen();
  const { instant } = useHouseholdDateTime();
  const [mode, setMode] = useState<WeatherMode>('temperature');
  const [inspection, setInspection] = useState<{ day: string; time: string } | null>(null);

  if (preparing || query.isPending) return <LoadingState />;
  if (query.data === undefined) return <FailureState onRetry={() => void query.refetch()} />;

  const forecast = query.data;
  if (forecast.current === null || forecast.hourly.length === 0) {
    const configured =
      forecast.configured ?? (forecast.source !== null || forecast.locationLabel !== null);
    return (
      <div className="screen weather-screen weather-screen--empty">
        <EmptyState
          title={configured ? 'Weather is unavailable' : 'Set a weather location'}
          description={
            configured
              ? 'Your location is saved. Try again.'
              : sharedScreen
                ? 'Ask an adult to choose a location from their phone.'
                : 'Choose it in Household settings.'
          }
        />
        {configured ? (
          <button
            className="weather-setup-link focusable"
            onClick={() => void query.refetch()}
            type="button"
          >
            Try again
          </button>
        ) : sharedScreen ? null : (
          <Link className="weather-setup-link focusable" to="/admin/household">
            Open settings <Icon name="chevron-right" />
          </Link>
        )}
      </div>
    );
  }

  const day = forecast.current.time.slice(0, 10);
  const hours = forecast.hourly.filter((hour) => {
    const minute = weatherMinute(hour.time, day);
    return minute >= 0 && minute <= 1440;
  });
  if (hours.length === 0) return <FailureState onRetry={() => void query.refetch()} />;
  const clock = weatherClock(instant, forecast.timezone);
  const nowMinute = clock.day === day ? clock.minute : null;
  const inspectedIndex =
    inspection?.day === day ? hours.findIndex((hour) => hour.time === inspection.time) : -1;
  const following = inspectedIndex < 0;
  const currentIndex = Math.max(
    0,
    hours.findLastIndex((hour) => weatherMinute(hour.time, day) <= (nowMinute ?? 0)),
  );
  const selectedIndex = following ? currentIndex : inspectedIndex;
  const selected = hours[selectedIndex]!;
  const today = forecast.daily.find((day) => day.localDate === forecast.current?.time.slice(0, 10));
  const savedMessage = !online
    ? 'Offline · Showing saved weather.'
    : forecast.freshness === 'stale' || clock.day !== day
      ? 'Showing the last saved forecast.'
      : null;

  return (
    <div className="screen weather-screen">
      <header className="weather-hero">
        <div className="weather-hero__title">
          <h1>Weather</h1>
          <p>
            {forecast.locationLabel ?? 'Local weather'} <Icon name="location" />
          </p>
          <span
            className={`weather-updated${savedMessage === null ? '' : ' weather-updated--saved'}`}
            role={savedMessage === null ? undefined : 'status'}
          >
            <i aria-hidden="true" />{' '}
            {savedMessage ?? updatedLabel(forecast.updatedAt, forecast.generatedAt)}
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
              <span>Low</span> {today?.lowTemperatureCelsius ?? '–'}° / <span>High</span>{' '}
              {today?.highTemperatureCelsius ?? '–'}°
            </strong>
          </div>
          <div className="weather-current__detail">
            <strong>{forecast.current.label}</strong>
            <div>
              <span>
                <Icon name="droplet" /> {forecast.current.precipitationProbabilityPercent}% rain
                chance
              </span>
              <span>
                <Icon name="wind" /> {forecast.current.windSpeedKph} km/h{' '}
                {compassDirection(forecast.current.windDirectionDegrees)}
              </span>
            </div>
          </div>
        </div>
      </header>

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
                ? selectedIndex === 0
                  ? 'weather-hour-now'
                  : 'weather-hour-previous'
                : `weather-mode-${MODES[index + 1]}`
            }
            data-focus-down="weather-chart"
            key={candidate}
            onClick={() => setMode(candidate)}
            onKeyDown={handleWeatherControlKeys}
            type="button"
          >
            {capitalise(candidate)}
          </button>
        ))}
      </div>

      <section className="weather-hourly" aria-labelledby="weather-hourly-title">
        <h2 className="sr-only" id="weather-hourly-title">
          Daily forecast, midnight to midnight
        </h2>
        <div className="weather-hourly__topline">
          <SelectedHourSummary
            hour={selected}
            mode={mode}
            following={following && nowMinute !== null}
          />
          {mode === 'rain' ? null : <ChartLegend mode={mode} />}
          {savedMessage === null ? null : (
            <span className="weather-saved-age">
              {updatedLabel(forecast.updatedAt, forecast.generatedAt)}
            </span>
          )}
          <div className="weather-hour-actions">
            <button
              aria-label="Previous hour"
              className="weather-hour-step focusable"
              data-focus-id="weather-hour-previous"
              data-focus-left="weather-mode-wind"
              data-focus-right="weather-hour-now"
              data-focus-up="weather-mode-wind"
              data-focus-down="weather-chart"
              disabled={selectedIndex === 0}
              onClick={() =>
                setInspection({ day, time: hours[Math.max(0, selectedIndex - 1)]!.time })
              }
              onKeyDown={handleWeatherControlKeys}
              type="button"
            >
              <Icon name="chevron-left" />
            </button>
            <button
              aria-label="Return to current time"
              aria-pressed={following}
              className="weather-now focusable"
              data-focus-id="weather-hour-now"
              data-focus-left={selectedIndex === 0 ? 'weather-mode-wind' : 'weather-hour-previous'}
              data-focus-right={
                selectedIndex >= hours.length - 1 ? 'weather-hour-now' : 'weather-hour-next'
              }
              data-focus-up="weather-mode-wind"
              data-focus-down="weather-chart"
              onClick={() => setInspection(null)}
              onKeyDown={handleWeatherControlKeys}
              type="button"
            >
              Now
            </button>
            <button
              aria-label="Next hour"
              className="weather-hour-step focusable"
              data-focus-id="weather-hour-next"
              data-focus-left="weather-hour-now"
              data-focus-right="weather-hour-next"
              data-focus-up="weather-mode-wind"
              data-focus-down="weather-chart"
              disabled={selectedIndex >= hours.length - 1}
              onClick={() =>
                setInspection({
                  day,
                  time: hours[Math.min(hours.length - 1, selectedIndex + 1)]!.time,
                })
              }
              onKeyDown={handleWeatherControlKeys}
              type="button"
            >
              <Icon name="chevron-right" />
            </button>
          </div>
        </div>

        <div className="weather-chart-shell">
          <WeatherChart
            day={day}
            hours={hours}
            mode={mode}
            nowMinute={nowMinute}
            inspecting={!following}
            onKeyDown={(event) => handleChartKeys(event)}
            onInspect={(index) => setInspection({ day, time: hours[index]!.time })}
            selectedIndex={selectedIndex}
          />
        </div>
      </section>

      <SevenDayForecast
        currentTemperature={forecast.current.temperatureCelsius}
        days={forecast.daily}
      />
    </div>
  );

  function handleChartKeys(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setInspection(null);
      return;
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      if (
        (event.key === 'ArrowLeft' && selectedIndex === 0) ||
        (event.key === 'ArrowRight' && selectedIndex === hours.length - 1)
      ) {
        return;
      }
      event.preventDefault();
      const delta = event.key === 'ArrowLeft' ? -1 : 1;
      setInspection({
        day,
        time: hours[Math.max(0, Math.min(hours.length - 1, selectedIndex + delta))]!.time,
      });
      return;
    }
    if (event.key === 'ArrowUp') {
      if (focusById(`weather-mode-${mode}`)) event.preventDefault();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setMode((current) => MODES[(MODES.indexOf(current) + 1) % MODES.length]!);
    }
  }
}

function handleWeatherControlKeys(event: KeyboardEvent<HTMLButtonElement>): void {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
  const direction =
    event.key === 'ArrowLeft'
      ? 'left'
      : event.key === 'ArrowRight'
        ? 'right'
        : event.key === 'ArrowUp'
          ? 'up'
          : event.key === 'ArrowDown'
            ? 'down'
            : null;
  // Weather's known control rows have an explicit exit. Do not leave it to
  // geometry, which can pick another chart control on a short/zoomed TV.
  if (direction !== null && focusById(nextFocusId(event.currentTarget, direction))) {
    event.preventDefault();
  }
}

function SelectedHourSummary({
  hour,
  mode,
  following,
}: {
  hour: HourlyWeatherForecast;
  mode: WeatherMode;
  following: boolean;
}) {
  return (
    <p aria-live="polite" className={`weather-selected-hour weather-selected-hour--${mode}`}>
      <time dateTime={hour.time}>
        {following ? `Now · ${hourLabel(hour.time)}` : hourLabel(hour.time)}
      </time>
      <strong>{selectedPrimaryValue(hour, mode)}</strong>
      <span>{selectedSecondaryValue(hour, mode)}</span>
    </p>
  );
}

function WeatherChart({
  day,
  hours,
  mode,
  nowMinute,
  inspecting,
  selectedIndex,
  onKeyDown,
  onInspect,
}: {
  day: string;
  hours: readonly HourlyWeatherForecast[];
  mode: WeatherMode;
  nowMinute: number | null;
  inspecting: boolean;
  selectedIndex: number;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onInspect: (index: number) => void;
}) {
  const plotRef = useRef<SVGSVGElement>(null);
  const pointerStart = useRef<readonly [number, number] | null>(null);
  const [size, setSize] = useState({ width: 1000, height: 238 });
  const geometry = useMemo(
    () => chartGeometry(hours, mode, day, size.width, size.height),
    [day, hours, mode, size.width, size.height],
  );
  const selectedX = geometry.x(selectedIndex);
  const nowPoint = nowMinute === null ? null : geometry.nowPoint(nowMinute);

  useLayoutEffect(() => {
    const canvas = plotRef.current;
    if (canvas === null) return undefined;
    const updateSize = () => {
      const width = Math.round(canvas.clientWidth);
      const height = Math.round(canvas.clientHeight);
      if (width <= 0 || height <= 0) return;
      setSize((previous) =>
        previous.width === width && previous.height === height ? previous : { width, height },
      );
    };
    updateSize();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateSize);
      return () => window.removeEventListener('resize', updateSize);
    }
    const observer = new ResizeObserver(updateSize);
    // ResizeObserver reports an SVG's user-space bounds, not its CSS viewport.
    // Observe the HTML canvas so rotation/resizing actually updates the viewBox.
    observer.observe(canvas.parentElement!);
    return () => observer.disconnect();
  }, [mode]);

  return (
    <div
      aria-label={`${capitalise(mode)} daily forecast, midnight to midnight. The filled dot marks the current time. Use left and right to inspect hours. Down changes graph. Up returns to the graph buttons; left from Temperature returns to the side menu. Select returns to current time.`}
      aria-valuemax={hours.length - 1}
      aria-valuemin={0}
      aria-valuenow={selectedIndex}
      aria-valuetext={`${hourLabel(hours[selectedIndex]?.time ?? hours[0]?.time ?? '00:00')}, ${selectedPrimaryValue(hours[selectedIndex] ?? hours[0]!, mode)}, ${selectedSecondaryValue(hours[selectedIndex] ?? hours[0]!, mode)}`}
      className={`weather-chart weather-chart--${mode} focusable`}
      data-focus-id="weather-chart"
      data-focus-left="nav-weather"
      data-focus-up={`weather-mode-${mode}`}
      onKeyDown={onKeyDown}
      onPointerDown={(event) => {
        pointerStart.current = event.button === 0 ? [event.clientX, event.clientY] : null;
      }}
      onPointerCancel={() => {
        pointerStart.current = null;
      }}
      onPointerUp={(event) => {
        const start = pointerStart.current;
        pointerStart.current = null;
        const bounds = plotRef.current?.getBoundingClientRect();
        // Tap-to-inspect does not capture a pointer or steal one-finger scrolling.
        if (
          start === null ||
          bounds === undefined ||
          Math.hypot(event.clientX - start[0], event.clientY - start[1]) > 10
        )
          return;
        const x = ((event.clientX - bounds.left) * size.width) / bounds.width;
        const nearest = hours.reduce(
          (best, _, index) =>
            Math.abs(geometry.x(index) - x) < Math.abs(geometry.x(best) - x) ? index : best,
          0,
        );
        onInspect(nearest);
      }}
      role="slider"
      tabIndex={0}
    >
      <div className="weather-chart__canvas">
        <div
          className={`weather-chart__markers weather-chart__markers--${mode}`}
          aria-hidden="true"
        >
          {hours.map((hour, index) =>
            Number(hour.time.slice(11, 13)) % geometry.markerStep === 0 ? (
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
        <svg
          aria-hidden="true"
          className="weather-chart__plot"
          ref={plotRef}
          viewBox={`0 0 ${size.width} ${size.height}`}
        >
          <defs>
            <linearGradient id={`weather-area-${mode}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="var(--eucalyptus)" stopOpacity="0.32" />
              <stop offset="1" stopColor="var(--eucalyptus)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {geometry.ticks.map((tick) => (
            <g className="weather-chart__grid" key={tick.value}>
              <line x1={geometry.left} x2={geometry.right} y1={tick.y} y2={tick.y} />
              <text x={geometry.left - 10} y={tick.y + 5} textAnchor="end">
                {tick.label}
              </text>
            </g>
          ))}
          {mode === 'rain' ? (
            <>
              <text
                className="weather-chart__lane-label weather-chart__lane-label--chance"
                x={geometry.left}
                y={14}
              >
                Rain chance (%)
              </text>
              <text
                className="weather-chart__lane-label weather-chart__lane-label--amount"
                x={geometry.left}
                y={geometry.rainTop - 12}
              >
                Expected rain (mm per hour)
              </text>
              {geometry.rainTicks.map((tick) => (
                <g className="weather-chart__grid weather-chart__rain-grid" key={tick.value}>
                  <line x1={geometry.left} x2={geometry.right} y1={tick.y} y2={tick.y} />
                  <text x={geometry.left - 10} y={tick.y + 5} textAnchor="end">
                    {tick.label}
                  </text>
                </g>
              ))}
              <path className="weather-chart__rain-area" d={geometry.areaPath} />
              <RainfallBars hours={hours} geometry={geometry} />
              <path className="weather-chart__rain-chance" d={geometry.primaryPath} />
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
          {inspecting ? (
            <line
              className="weather-chart__selected-line"
              x1={selectedX}
              x2={selectedX}
              y1={geometry.top}
              y2={geometry.baseline}
            />
          ) : null}
          {inspecting ? (
            <circle
              className="weather-chart__selected-point"
              cx={selectedX}
              cy={geometry.primaryY(selectedIndex)}
              r="7"
            />
          ) : null}
          {nowPoint === null ? null : (
            <g className="weather-chart__now" data-minute={nowMinute}>
              <line x1={nowPoint[0]} x2={nowPoint[0]} y1={geometry.top} y2={geometry.baseline} />
              <circle cx={nowPoint[0]} cy={nowPoint[1]} r="6" />
            </g>
          )}
          {geometry.hourTicks.map((minute) => (
            <text
              className="weather-chart__hour"
              key={minute}
              textAnchor="middle"
              x={geometry.xMinute(minute)}
              y={geometry.hourY}
            >
              {hourLabel(`2000-01-01T${String((minute / 60) % 24).padStart(2, '0')}:00`)}
            </text>
          ))}
        </svg>
      </div>
      <p className="sr-only">{chartTextSummary(hours, mode)}</p>
    </div>
  );
}

function RainfallBars({
  hours,
  geometry,
}: {
  hours: readonly HourlyWeatherForecast[];
  geometry: ReturnType<typeof chartGeometry>;
}) {
  return (
    <g className="weather-chart__rain-bars">
      {hours.map((hour, index) => {
        const y = geometry.rainY(hour.precipitationMillimetres);
        return (
          <rect
            height={geometry.baseline - y}
            key={hour.time}
            rx="2"
            width={geometry.barWidth}
            x={geometry.x(index) - geometry.barWidth / 2}
            y={y}
            data-millimetres={hour.precipitationMillimetres}
          />
        );
      })}
    </g>
  );
}

function ChartLegend({ mode }: { mode: WeatherMode }) {
  const labels =
    mode === 'temperature'
      ? (['Temperature (°C)', 'Feels like'] as const)
      : mode === 'wind'
        ? (['Wind (km/h)', 'Gusts'] as const)
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
      <div className="weather-week__header">
        <h2 id="weather-week-title">Seven days</h2>
        <div className="weather-week__columns" aria-hidden="true">
          <span>Rain chance</span>
          <span>Maximum wind</span>
          <span>Low–high temperature</span>
        </div>
      </div>
      <div className="weather-week__rows">
        {days.slice(0, 7).map((day, index) => {
          const rangeStart = rangePercent(day.lowTemperatureCelsius, domain);
          const rangeEnd = rangePercent(day.highTemperatureCelsius, domain);
          const current = rangePercent(currentTemperature, domain);
          return (
            <article
              className={`weather-day weather-day--${day.condition}${index === 0 ? ' weather-day--today' : ''}`}
              key={day.localDate}
            >
              <strong>{index === 0 ? 'Today' : weekday(day.localDate)}</strong>
              <Icon name={conditionIcon(day.condition)} />
              <span className="weather-day__condition">{day.label}</span>
              <span className="weather-day__rain">
                <Icon name="droplet" /> {day.precipitationProbabilityPercent}%
              </span>
              <span className="weather-day__wind" title="Daily maximum wind · prevailing direction">
                <Icon name="wind" />
                <span>{dailyWindLabel(day)}</span>
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

function dailyWindLabel(day: WeatherForecastDay): string {
  if (day.maxWindSpeedKph == null) return 'Wind unavailable';
  if (day.maxWindSpeedKph === 0) return 'Calm';
  const direction =
    day.dominantWindDirectionDegrees == null
      ? ''
      : ` ${compassDirection(day.dominantWindDirectionDegrees)}`;
  return `Up to ${day.maxWindSpeedKph} km/h${direction}`;
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

function selectedPrimaryValue(hour: HourlyWeatherForecast, mode: WeatherMode): string {
  if (mode === 'temperature') return `${hour.temperatureCelsius}°`;
  if (mode === 'rain') return `${hour.precipitationProbabilityPercent}% chance`;
  return `${hour.windSpeedKph} km/h ${compassDirection(hour.windDirectionDegrees)}`;
}

function selectedSecondaryValue(hour: HourlyWeatherForecast, mode: WeatherMode): string {
  if (mode === 'temperature') return `Feels ${hour.apparentTemperatureCelsius}°`;
  if (mode === 'rain') return `${hour.precipitationMillimetres.toFixed(1)} mm expected`;
  return `Gusts ${hour.windGustKph} km/h`;
}

function chartTextSummary(hours: readonly HourlyWeatherForecast[], mode: WeatherMode): string {
  if (mode === 'temperature') {
    return `Temperature ranges from ${Math.min(...hours.map((hour) => hour.temperatureCelsius))}° to ${Math.max(...hours.map((hour) => hour.temperatureCelsius))}° across this day. The right-hand midnight starts the following day.`;
  }
  if (mode === 'rain') {
    return `The highest rain chance is ${Math.max(...hours.map((hour) => hour.precipitationProbabilityPercent))}%. The purple line shows probability on a fixed 0 to 100 percent scale. Blue bars show expected rain in millimetres per hour on a separate zero-based scale. The highest hourly amount is ${Math.max(...hours.map((hour) => hour.precipitationMillimetres)).toFixed(1)} mm.`;
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
