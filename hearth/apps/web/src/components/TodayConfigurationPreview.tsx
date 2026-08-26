import { useState } from 'react';
import type { CSSProperties } from 'react';

import type { TodaySectionVisibility } from '@hearth/shared';

import { getTodayRailCapacity } from '../layout/todayRailCapacity';
import { Icon, type IconName } from './Icon';
import type { PreviewPerson, TodayPreviewData } from './todayPreviewData';
import './TodayConfigurationPreview.css';

type PreviewMode = 'television' | 'phone';
type PreviewStatus = 'loading' | 'ready' | 'unavailable';

export function TodayConfigurationPreview({
  data,
  sections,
  status = 'ready',
}: {
  data: TodayPreviewData;
  sections: TodaySectionVisibility;
  status?: PreviewStatus;
}) {
  const [mode, setMode] = useState<PreviewMode>('television');
  const summaryBands = previewSummaryBands(data, sections);
  const showPhoto = sections.photo;
  const photoOrientation = showPhoto ? (data.photo?.orientation ?? 'landscape') : 'none';
  const railCapacity = getTodayRailCapacity({
    photoOrientation,
    viewportClass: mode === 'television' ? 'full-tv' : 'companion',
  });
  const enabledNames = [
    sections.dinner ? 'Dinner' : null,
    sections.listSummary ? 'List summary' : null,
    sections.notice ? 'Notice' : null,
    sections.dailyVerse ? 'Daily Bible verse' : null,
    sections.reminders ? 'Reminders' : null,
    sections.photo ? 'Family photo' : null,
  ].filter((name): name is string => name !== null);
  const modeLabel = mode === 'television' ? 'TV' : 'phone';
  const previewLabel =
    status === 'loading'
      ? `${modeLabel} Today preview is loading.`
      : status === 'unavailable'
        ? `${modeLabel} Today preview is temporarily unavailable.`
        : `${modeLabel} Today preview. ${
            enabledNames.length === 0
              ? 'Only plans and chores are shown.'
              : `Optional sections shown: ${enabledNames.join(', ')}.`
          }`;

  return (
    <div className="today-preview-block">
      <div className="today-preview-block__heading">
        <div>
          <h3>Preview</h3>
          <p>See how these choices rebalance Today</p>
        </div>
        <div aria-label="Preview size" className="today-preview-modes" role="group">
          <button
            aria-pressed={mode === 'television'}
            className="focusable"
            data-focus-id="today-preview-television"
            data-focus-right="today-preview-phone"
            onClick={() => setMode('television')}
            type="button"
          >
            TV
          </button>
          <button
            aria-pressed={mode === 'phone'}
            className="focusable"
            data-focus-id="today-preview-phone"
            data-focus-left="today-preview-television"
            onClick={() => setMode('phone')}
            type="button"
          >
            Phone
          </button>
        </div>
      </div>
      <div
        aria-busy={status === 'loading'}
        aria-label={previewLabel}
        className={`today-configuration-preview today-configuration-preview--${mode}`}
        role="img"
      >
        {status === 'ready' ? (
          <>
            <div aria-hidden="true" className="today-configuration-preview__phone-topbar">
              <strong>{data.displayTime}</strong>
              <span>{data.displayDate}</span>
            </div>
            <div
              aria-hidden="true"
              className={`today-configuration-preview__canvas today-configuration-preview__canvas--photo-${photoOrientation}`}
              data-rail-capacity={railCapacity}
              data-summary-count={summaryBands.length}
            >
              <PreviewHeader data={data} />
              <div className="today-configuration-preview__core">
                <PreviewEvents events={data.events.slice(0, railCapacity)} />
                <PreviewChores chores={data.chores.slice(0, railCapacity)} />
              </div>
              {summaryBands.length === 0 && !showPhoto ? null : (
                <div
                  className={`today-configuration-preview__summary today-configuration-preview__summary--count-${summaryBands.length}${showPhoto ? '' : ' today-configuration-preview__summary--without-photo'}${summaryBands.length === 0 ? ' today-configuration-preview__summary--photo-only' : ''}`}
                >
                  {summaryBands.length === 0 ? null : (
                    <div
                      className={`today-configuration-preview__bands today-configuration-preview__bands--count-${summaryBands.length}`}
                    >
                      {summaryBands.map((band) => (
                        <div
                          className={`today-configuration-preview__band today-configuration-preview__band--${band.key}`}
                          key={band.key}
                        >
                          <Icon name={band.icon} />
                          <span>
                            <strong>{band.label}</strong>
                            <small>{band.value}</small>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {showPhoto ? <PreviewPhoto photo={data.photo} /> : null}
                </div>
              )}
            </div>
            <div aria-hidden="true" className="today-configuration-preview__phone-tabs">
              <Icon name="today" />
              <Icon name="calendar" />
              <Icon name="chores" />
              <Icon name="more" />
            </div>
          </>
        ) : (
          <div aria-hidden="true" className="today-configuration-preview__state">
            <Icon name={status === 'loading' ? 'refresh' : 'warning'} />
            <strong>{status === 'loading' ? 'Loading preview…' : 'Preview unavailable'}</strong>
            <span>
              {status === 'loading'
                ? 'Getting the latest household overview'
                : 'Your visibility choices can still be saved'}
            </span>
          </div>
        )}
      </div>
      <p aria-live="polite" className="sr-only">
        {previewLabel}
      </p>
    </div>
  );
}

function PreviewHeader({ data }: { data: TodayPreviewData }) {
  return (
    <header className="today-configuration-preview__header">
      <span className="today-configuration-preview__title">
        <small>{data.eyebrow}</small>
        <strong>Today</strong>
      </span>
      <span className="today-configuration-preview__weather">
        <Icon name={data.weather === null ? 'cloud' : 'sun'} />
        <strong>{data.weather?.temperature ?? '—'}</strong>
        <span>{data.weather?.condition ?? 'Forecast'}</span>
      </span>
    </header>
  );
}

function PreviewEvents({ events }: { events: TodayPreviewData['events'] }) {
  return (
    <section className="today-configuration-preview__section">
      <h4>Upcoming</h4>
      <div className="today-configuration-preview__rows">
        {events.length === 0 ? (
          <PreviewEmptyRow label="No plans yet" />
        ) : (
          events.map((event) => (
            <div className="today-configuration-preview__event" key={event.id}>
              <time>{event.time}</time>
              <i style={{ background: event.color }} />
              <strong>{event.title}</strong>
              <PreviewPerson person={event.person} />
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function PreviewChores({ chores }: { chores: TodayPreviewData['chores'] }) {
  return (
    <section className="today-configuration-preview__section">
      <h4>Due now &amp; today</h4>
      <div className="today-configuration-preview__rows">
        {chores.length === 0 ? (
          <PreviewEmptyRow label="No chores due" />
        ) : (
          chores.map((chore) => (
            <div className="today-configuration-preview__chore" key={chore.id}>
              <PreviewPerson person={chore.person} />
              <strong>{chore.title}</strong>
              <span className="today-configuration-preview__check" />
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function PreviewEmptyRow({ label }: { label: string }) {
  return <div className="today-configuration-preview__empty">{label}</div>;
}

function PreviewPerson({ person }: { person: PreviewPerson }) {
  return person.avatarUrl.length === 0 ? (
    <span className="today-configuration-preview__person">{person.initial}</span>
  ) : (
    <img
      alt=""
      className="today-configuration-preview__person"
      loading="lazy"
      src={person.avatarUrl}
    />
  );
}

function PreviewPhoto({ photo }: { photo: TodayPreviewData['photo'] }) {
  const ratio =
    photo === null
      ? null
      : photo.width === undefined || photo.height === undefined
        ? { landscape: 3 / 2, portrait: 2 / 3, square: 1 }[photo.orientation]
        : photo.width / photo.height;
  return photo === null ? (
    <div className="today-configuration-preview__photo today-configuration-preview__photo--empty">
      <Icon name="image" />
      <span>Family photo</span>
    </div>
  ) : (
    <img
      alt=""
      className={`today-configuration-preview__photo today-configuration-preview__photo--${photo.orientation}`}
      data-photo-ratio={ratio?.toFixed(4)}
      loading="lazy"
      src={photo.url}
      style={{ '--today-preview-photo-ratio': ratio } as CSSProperties}
    />
  );
}

function previewSummaryBands(data: TodayPreviewData, sections: TodaySectionVisibility) {
  const bands: Array<{
    key: 'dinner' | 'list' | 'notice' | 'daily-verse' | 'reminders';
    icon: IconName;
    label: string;
    value: string;
  }> = [];
  if (sections.dinner)
    bands.push({
      key: 'dinner',
      icon: 'meal',
      label: 'Dinner',
      value: data.dinner ?? 'Not planned',
    });
  if (sections.listSummary)
    bands.push({
      key: 'list',
      icon: 'list',
      label: 'List summary',
      value: data.listSummary ?? 'No active list',
    });
  if (sections.notice)
    bands.push({
      key: 'notice',
      icon: 'home',
      label: 'Notice',
      value: data.notice ?? 'No active notice',
    });
  if (sections.dailyVerse)
    bands.push({
      key: 'daily-verse',
      icon: 'book-open',
      label: 'Daily verse',
      value: data.dailyVerse?.reference ?? 'ESV key needed',
    });
  if (sections.reminders)
    bands.push({
      key: 'reminders',
      icon: 'bell',
      label: 'Reminders',
      value:
        data.reminderSummary === null
          ? 'Connect the iPhone bridge'
          : data.reminderSummary.dueTodayCount === 0
            ? 'Nothing due today'
            : `${data.reminderSummary.dueTodayCount} due today`,
    });
  return bands;
}
