import { useQuery } from '@tanstack/react-query';
import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { focusById } from '../focus/focusGraph';
import { Link, useSearchParams } from 'react-router-dom';
import {
  IndoorPeriodSchema,
  type IndoorClimate,
  type IndoorMetric,
  type IndoorReading,
} from '@hearth/shared';
import { indoorApi } from '../api/indoorClimate';
import { queryKeys } from '../api/queryKeys';
import { WeatherHeading } from '../components/WeatherHeading';
import { EmptyState, FailureState, LoadingState } from '../components/Status';
import { useSharedScreen } from '../runtime/sharedScreen';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { indoorGeometry, indoorSummary } from './indoorChartGeometry';
import './IndoorWeatherScreen.css';

const PERIODS = [
  ['day', 'Day'],
  ['week', 'Week'],
  ['month', 'Month'],
  ['year', 'Year'],
] as const;
function toWeatherTabs(event: KeyboardEvent<HTMLElement>) {
  if (event.key === 'ArrowUp' && focusById('weather-view-indoors')) event.preventDefault();
}
export function IndoorWeatherScreen({ preparing }: { preparing: boolean }) {
  const [params, setParams] = useSearchParams();
  const period = IndoorPeriodSchema.catch('day').parse(params.get('period') ?? 'day');
  const shared = useSharedScreen();
  const online = useOnlineStatus();
  const query = useQuery({
    queryKey: [...queryKeys.indoorClimate, period],
    queryFn: ({ signal }) => indoorApi.read(period, signal),
    enabled: !preparing,
    staleTime: 55_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    retry: false,
    placeholderData: (previous) => previous,
  });
  const choose = (key: string, value: string) =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.set(key, value);
      return next;
    });
  const data = query.data;
  const room = data?.rooms.find((item) => item.id === params.get('room')) ?? data?.rooms[0];
  return (
    <div
      className="screen indoor-screen"
      data-focus-loading={preparing || query.isPending ? 'true' : undefined}
    >
      <header className="indoor-header">
        <WeatherHeading />
        {shared ? null : (
          <Link className="focusable indoor-manage" to="/admin/connections/indoor-sensors">
            Indoor sensors
          </Link>
        )}
      </header>
      {preparing || query.isPending ? (
        <LoadingState />
      ) : !data ? (
        <FailureState onRetry={() => void query.refetch()} />
      ) : data.status === 'not-configured' || data.status === 'empty' ? (
        <EmptyState
          title={
            data.status === 'empty' ? 'No indoor sensors selected' : 'Connect your indoor sensors'
          }
          description={
            shared
              ? 'Ask an adult to choose sensors from their phone.'
              : 'Choose your Home Assistant temperature and humidity sensors in Indoor sensors.'
          }
        />
      ) : !room ? (
        <FailureState onRetry={() => void query.refetch()} />
      ) : (
        <>
          <div className="indoor-controls">
            <div className="indoor-room-controls" role="group" aria-label="Indoor room">
              <span>
                {data.rooms.length === 1
                  ? 'Indoor climate'
                  : `Room ${data.rooms.indexOf(room) + 1} of ${data.rooms.length}`}
              </span>
              {data.rooms.length > 1 ? (
                <>
                  {([-1, 1] as const).map((direction) => (
                    <button
                      className="focusable"
                      key={direction}
                      type="button"
                      aria-label={direction === -1 ? 'Previous room' : 'Next room'}
                      data-focus-entry={direction === -1 ? 'true' : undefined}
                      data-focus-up="weather-view-indoors"
                      onKeyDown={toWeatherTabs}
                      onClick={() =>
                        choose(
                          'room',
                          data.rooms[
                            (data.rooms.indexOf(room) + direction + data.rooms.length) %
                              data.rooms.length
                          ]!.id,
                        )
                      }
                    >
                      {direction === -1 ? '‹' : '›'}
                    </button>
                  ))}
                </>
              ) : null}
            </div>
            <div className="indoor-periods" role="group" aria-label="Indoor history period">
              {PERIODS.map(([value, label]) => (
                <button
                  className="focusable"
                  key={value}
                  aria-pressed={period === value}
                  data-focus-id={`indoor-period-${value}`}
                  data-focus-entry={data.rooms.length === 1 && value === 'day' ? 'true' : undefined}
                  data-focus-up="weather-view-indoors"
                  onKeyDown={toWeatherTabs}
                  onClick={() => choose('period', value)}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="indoor-context">
            <h2>{room.label}</h2>
            <p>
              {data.period === 'day'
                ? 'Past 24 hours · 5-minute averages'
                : data.period === 'week'
                  ? 'Past 7 days · Hourly averages'
                  : data.period === 'month'
                    ? 'Past 30 days · Daily averages'
                    : 'Past 365 days · Daily averages'}
              {query.isPlaceholderData ? (
                <span role="status"> · Loading {period} history…</span>
              ) : null}
            </p>
          </div>
          {!online || query.isError || data.status === 'stale' || data.status === 'unavailable' ? (
            <p className="indoor-notice" role="status">
              {!online ? 'Offline. ' : ''}
              {data.status === 'unavailable'
                ? 'Indoor readings are unavailable.'
                : 'Showing the last available readings.'}{' '}
              <button className="focusable" onClick={() => void query.refetch()} type="button">
                Try again
              </button>
            </p>
          ) : data.status === 'partial' ? (
            <p className="indoor-notice" role="status">
              Some readings or history are unavailable. Available readings are shown.
            </p>
          ) : null}
          <div className="indoor-charts" aria-busy={query.isFetching}>
            {(['temperature', 'humidity'] as const).map((metric) => (
              <IndoorChart key={metric} reading={room[metric]} metric={metric} data={data} />
            ))}
          </div>
          <p className="indoor-source">
            {data.source === 'demo' ? 'Demo sensor data' : 'Recorded by Home Assistant'} ·{' '}
            {data.fetchedAt
              ? `Checked ${formatTime(data.fetchedAt, data.timezone)}`
              : 'Awaiting readings'}
            . History starts when your sensor was connected.
          </p>
        </>
      )}
    </div>
  );
}
function formatTime(at: string, timezone: string) {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(at));
}
function valueLabel(value: number | null, metric: IndoorMetric) {
  return value === null
    ? 'Unavailable'
    : `${new Intl.NumberFormat('en-AU', { maximumFractionDigits: 1 }).format(value)}${metric === 'temperature' ? '°C' : '%'}`;
}
function IndoorChart({
  reading,
  metric,
  data,
}: {
  reading: IndoorReading | null;
  metric: IndoorMetric;
  data: IndoorClimate;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 500, height: 220, fontSize: 14 });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      setSize({
        width: Math.max(100, element.clientWidth),
        height: Math.max(100, element.clientHeight),
        fontSize: Number.parseFloat(getComputedStyle(element).fontSize),
      });
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const title = metric === 'temperature' ? 'Temperature' : 'Humidity';
  const samples = reading?.samples ?? [];
  const stats = indoorSummary(samples);
  const geometry = indoorGeometry(samples, size, data, metric);
  const reported = reading?.reportedAt;
  return (
    <section className={`indoor-chart indoor-chart--${metric}`} aria-label={title}>
      <header>
        <div>
          <h3>{title}</h3>
          <p>
            {reading === null
              ? 'No sensor selected'
              : reported
                ? `Reported ${new Intl.DateTimeFormat('en-AU', { timeZone: data.timezone, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(reported))}`
                : 'Sensor unavailable'}
            {reading?.status === 'stale' ? ' · Old reading' : ''}
          </p>
        </div>
        <strong>{valueLabel(reading?.value ?? null, metric)}</strong>
      </header>
      <div className="indoor-plot" ref={ref}>
        {samples.length === 0 ? (
          <p className="indoor-plot-empty">
            {reading === null
              ? 'Choose a sensor to show this measurement.'
              : reading.historyStatus === 'unavailable'
                ? 'History is unavailable. Your live reading is shown above.'
                : 'No recorded history for this period yet.'}
          </p>
        ) : (
          <svg
            viewBox={`0 0 ${size.width} ${size.height}`}
            role="img"
            aria-label={`${title} history. Average ${valueLabel(stats.mean, metric)}, minimum ${valueLabel(stats.min, metric)}, maximum ${valueLabel(stats.max, metric)}. Gaps mean no recorded readings.`}
          >
            {geometry.ticks.map((tick) => (
              <g key={tick.value}>
                <line
                  x1={44}
                  x2={size.width - 12}
                  y1={tick.y}
                  y2={tick.y}
                  className="indoor-grid"
                />
                <text className="indoor-y-label" x={36} y={tick.y + 4} textAnchor="end">
                  {tick.value}
                </text>
              </g>
            ))}
            {geometry.ranges.map((range, index) => (
              <rect
                key={index}
                x={range.x}
                y={range.y}
                width={range.width}
                height={range.height}
                className="indoor-range"
              />
            ))}
            {geometry.paths.map((path, index) => (
              <path key={index} d={path} className="indoor-line" />
            ))}
            {geometry.dots.map((point, index) => (
              <circle key={index} cx={point.x} cy={point.y} r={2.5} className="indoor-dot" />
            ))}
            {geometry.labels.map((label) => (
              <g key={label.at} className="indoor-x-tick">
                <line
                  x1={label.x}
                  x2={label.x}
                  y1={geometry.baseline}
                  y2={geometry.baseline + 5}
                  className="indoor-grid"
                />
                <text x={label.x} y={geometry.labelY} textAnchor={label.anchor}>
                  {label.text}
                </text>
              </g>
            ))}
          </svg>
        )}
      </div>
      <dl className="indoor-summary">
        {(
          [
            ['min', 'Low'],
            ['mean', 'Average'],
            ['max', 'High'],
          ] as const
        ).map(([key, label]) => (
          <div key={key}>
            <dt>{label}</dt>
            <dd>{valueLabel(stats[key], metric)}</dd>
          </div>
        ))}
      </dl>
      {samples.length > 0 ? (
        <p className="indoor-chart-key">
          Line: average · Shading: recorded low–high
          {reading?.historyStatus === 'unavailable' ? ' · Saved history' : ''}
        </p>
      ) : null}
    </section>
  );
}
