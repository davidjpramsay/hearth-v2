import { useState } from 'react';
import { NBA_TEAMS } from '@hearth/shared';
import { nbaApi } from '../api/nba';

/** Decorative artwork only: the full team/player label always remains visible beside it. */
function Artwork({
  src,
  fallback,
  className,
}: {
  src: string | null;
  fallback: string;
  className: string;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <span
      aria-hidden="true"
      className={`nba-art ${className}`}
      data-fallback={failed || src === null}
    >
      <span className="nba-art-fallback">{fallback}</span>
      {src !== null && !failed ? (
        <img
          alt=""
          src={src}
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailed(true)}
        />
      ) : null}
    </span>
  );
}
export function NbaTeamMark({ teamId }: { teamId: string }) {
  const src = nbaApi.media('teams', teamId);
  const abbreviation = NBA_TEAMS.find(([id]) => id === teamId)?.[2] ?? 'NBA';
  return <Artwork key={src} src={src} fallback={abbreviation} className="nba-team-mark" />;
}
export function NbaPlayerPortrait({ playerId, name }: { playerId: string | null; name: string }) {
  const src = playerId === null ? null : nbaApi.media('players', playerId);
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join('');
  return (
    <Artwork key={`${src}:${name}`} src={src} fallback={initials} className="nba-player-portrait" />
  );
}
