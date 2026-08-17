export function WeatherAttribution({ source }: { source: 'demo' | 'open-meteo' }) {
  if (source !== 'open-meteo') return null;
  return (
    <>
      {' · '}
      <a
        className="weather-attribution"
        href="https://open-meteo.com/"
        rel="noreferrer"
        target="_blank"
      >
        Open-Meteo
      </a>
    </>
  );
}
