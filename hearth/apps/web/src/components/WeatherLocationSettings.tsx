import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';

import type {
  WeatherLocationSearchResult,
  WeatherLocationTestRequest,
  WeatherLocationTestResult,
} from '@hearth/shared';

import { queryKeys } from '../api/queryKeys';
import { createRequestId } from '../api/core';
import { weatherApi } from '../api/weather';
import { useWeatherLocationQuery } from '../hooks/useWeatherLocationQuery';
import { getPhoneCoordinates } from '../utils/browserLocation';
import { AdminError } from './AdminPage';
import { Icon } from './Icon';

export function WeatherLocationSettings() {
  const queryClient = useQueryClient();
  const saved = useWeatherLocationQuery();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<WeatherLocationSearchResult[]>([]);
  const [candidate, setCandidate] = useState<WeatherLocationTestRequest | null>(null);
  const [tested, setTested] = useState<WeatherLocationTestResult | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const search = useMutation({
    mutationFn: weatherApi.search,
    onSuccess: (response) => {
      setResults(response.results);
      setCandidate(null);
      setTested(null);
    },
  });
  const test = useMutation({
    mutationFn: weatherApi.test,
    onSuccess: (result) => setTested(result),
  });
  const save = useMutation({
    mutationFn: weatherApi.save,
    onSuccess: async (result) => {
      queryClient.setQueryData(queryKeys.weatherLocation, result.location);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.today }),
        queryClient.invalidateQueries({ queryKey: queryKeys.weekRoot }),
      ]);
      setCandidate(null);
      setTested(null);
      setResults([]);
      setQuery('');
      search.reset();
      test.reset();
    },
  });

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (query.trim().length < 2) return;
    setPhoneError(null);
    search.mutate(query.trim());
  }

  function chooseSearchResult(result: WeatherLocationSearchResult) {
    setCandidate({
      label: result.label,
      latitude: result.latitude,
      longitude: result.longitude,
      source: 'search',
    });
    setTested(null);
  }

  async function requestPhoneLocation() {
    setPhoneError(null);
    setLocating(true);
    try {
      const coordinates = await getPhoneCoordinates();
      setCandidate({ label: null, ...coordinates, source: 'device' });
      setTested(null);
      setResults([]);
    } catch (error) {
      setPhoneError(
        error instanceof Error ? error.message : 'This phone could not provide its location.',
      );
    } finally {
      setLocating(false);
    }
  }

  const error = search.error ?? test.error ?? save.error;

  return (
    <section
      className="admin-form weather-location-settings"
      aria-labelledby="weather-location-title"
    >
      <header className="weather-location-settings__header">
        <span className="admin-setting-row__icon">
          <Icon name="cloud-sun" />
        </span>
        <div>
          <h2 id="weather-location-title">Weather location</h2>
          <p>Choose where Hearth gets the forecast. This is separate from the home timezone.</p>
        </div>
      </header>

      {saved.isPending ? <p className="field-help">Checking the saved weather location…</p> : null}
      {saved.isError ? <AdminError message={saved.error.message} /> : null}
      {saved.data === null || saved.data === undefined ? null : (
        <div className="weather-saved-location">
          <span className="weather-saved-location__icon">
            <Icon name="check" />
          </span>
          <div>
            <span>Current weather location</span>
            <strong>{saved.data.label}</strong>
            {saved.data.source === 'environment' ? (
              <small>Using the server fallback until you save a location here.</small>
            ) : null}
            <CoordinateDisclosure latitude={saved.data.latitude} longitude={saved.data.longitude} />
          </div>
        </div>
      )}

      <form className="weather-search" onSubmit={submitSearch}>
        <label htmlFor="weather-location-search">Search suburb or postcode</label>
        <div>
          <input
            autoComplete="postal-code"
            id="weather-location-search"
            maxLength={100}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Baldivis or 6171"
            type="search"
            value={query}
          />
          <button
            className="admin-secondary"
            disabled={query.trim().length < 2 || search.isPending}
            type="submit"
          >
            {search.isPending ? 'Searching…' : 'Search'}
          </button>
        </div>
      </form>

      {search.isSuccess && results.length === 0 ? (
        <p className="weather-location-note">No matching places found. Try a nearby suburb.</p>
      ) : null}
      {results.length === 0 ? null : (
        <div className="weather-search-results" aria-label="Matching places">
          {results.map((result) => (
            <button
              aria-pressed={
                candidate?.latitude === result.latitude && candidate.longitude === result.longitude
              }
              className="weather-search-result"
              key={result.id}
              onClick={() => chooseSearchResult(result)}
              type="button"
            >
              <span>{result.label}</span>
              <small>
                {result.latitude.toFixed(4)}, {result.longitude.toFixed(4)}
              </small>
              <Icon name="chevron-right" />
            </button>
          ))}
        </div>
      )}

      <div className="weather-location-divider">
        <span>or</span>
      </div>
      <button
        className="admin-secondary weather-phone-location"
        disabled={locating}
        onClick={() => void requestPhoneLocation()}
        type="button"
      >
        <Icon name="home" />
        {locating ? 'Getting this phone’s location…' : 'Use this phone’s location'}
      </button>
      <p className="field-help">
        Your browser asks once for permission. Hearth saves only the resulting coordinates on your
        home server.
      </p>
      {phoneError === null ? null : <p className="admin-inline-error">{phoneError}</p>}

      {candidate === null ? null : (
        <div className="weather-location-candidate">
          <div>
            <span>Location to test</span>
            <strong>{candidate.label ?? 'This phone’s current location'}</strong>
            <CoordinateDisclosure latitude={candidate.latitude} longitude={candidate.longitude} />
          </div>
          <button
            className="admin-secondary"
            disabled={test.isPending}
            onClick={() => test.mutate(candidate)}
            type="button"
          >
            {test.isPending ? 'Testing weather…' : 'Test weather'}
          </button>
        </div>
      )}

      {tested === null ? null : (
        <div className="weather-test-success" role="status">
          <Icon name="sun" />
          <div>
            <span>Weather is working for</span>
            <strong>{tested.location.label}</strong>
            <small>
              {tested.current.temperatureCelsius}° · {tested.current.condition}
            </small>
          </div>
          <button
            className="admin-submit"
            disabled={save.isPending}
            onClick={() =>
              save.mutate({
                requestId: createRequestId('weather_location'),
                testId: tested.testId,
              })
            }
            type="button"
          >
            {save.isPending ? 'Saving…' : 'Save weather location'}
          </button>
        </div>
      )}

      {error === null ? null : <AdminError message={error.message} />}
      {save.isSuccess ? (
        <p className="save-confirmation" role="status">
          Weather location saved. Today and Calendar will refresh automatically.
        </p>
      ) : null}
      <p className="weather-location-attribution">
        Place search by{' '}
        <a href="https://open-meteo.com/" rel="noreferrer" target="_blank">
          Open-Meteo
        </a>{' '}
        and GeoNames. Phone location names ©{' '}
        <a href="https://www.openstreetmap.org/copyright" rel="noreferrer" target="_blank">
          OpenStreetMap contributors
        </a>
        .
      </p>
    </section>
  );
}

function CoordinateDisclosure({ latitude, longitude }: { latitude: number; longitude: number }) {
  return (
    <details className="weather-coordinate-disclosure">
      <summary>Advanced</summary>
      <span>
        Latitude {latitude.toFixed(5)} · Longitude {longitude.toFixed(5)}
      </span>
    </details>
  );
}
