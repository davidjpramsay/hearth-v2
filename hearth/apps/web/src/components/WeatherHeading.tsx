import { Link, useSearchParams } from 'react-router-dom';
import type { KeyboardEvent } from 'react';
import { focusById, nextFocusId } from '../focus/focusGraph';
function handleViewKeys(event: KeyboardEvent<HTMLElement>) {
  const direction = ({ ArrowLeft: 'left', ArrowRight: 'right', ArrowDown: 'down' } as const)[
    event.key as 'ArrowLeft' | 'ArrowRight' | 'ArrowDown'
  ];
  if (direction && focusById(nextFocusId(event.currentTarget, direction))) event.preventDefault();
}
export function WeatherHeading() {
  const [params] = useSearchParams();
  const indoors = params.get('view') === 'indoors';
  const href = (view: string) => {
    const next = new URLSearchParams(params);
    next.set('view', view);
    return `/weather?${next}`;
  };
  return (
    <div className="weather-heading">
      <h1>Weather</h1>
      <nav aria-label="Weather views">
        <Link
          className="focusable"
          aria-current={indoors ? undefined : 'page'}
          to={href('outdoors')}
          data-focus-id="weather-view-outdoors"
          data-focus-left="nav-weather"
          data-focus-right="weather-view-indoors"
          data-focus-down={indoors ? 'indoor-period-day' : 'weather-mode-temperature'}
          onKeyDown={handleViewKeys}
        >
          Outdoors
        </Link>
        <Link
          className="focusable"
          aria-current={indoors ? 'page' : undefined}
          to={href('indoors')}
          data-focus-id="weather-view-indoors"
          data-focus-left="weather-view-outdoors"
          data-focus-down={indoors ? 'indoor-period-day' : 'weather-mode-temperature'}
          onKeyDown={handleViewKeys}
        >
          Indoors
        </Link>
      </nav>
    </div>
  );
}
