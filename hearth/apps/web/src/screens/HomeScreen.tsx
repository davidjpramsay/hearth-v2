import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import type { DemoScenario, HomeAction, HomeActionId } from '@hearth/shared';

import { createRequestId } from '../api/core';
import { homeApi as hearthApi } from '../api/home';
import { queryKeys } from '../api/queryKeys';
import { Icon, type IconName } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';
import { FailureState, LoadingState, StatusBanner } from '../components/Status';
import { focusById } from '../focus/focusGraph';
import { useHomeQuery } from '../hooks/useHomeQueries';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export function HomeScreen({
  scenario,
  preparing,
}: {
  scenario: DemoScenario | 'offline';
  preparing: boolean;
}) {
  const query = useHomeQuery(!preparing);
  const queryClient = useQueryClient();
  const online = useOnlineStatus(scenario === 'offline');
  const [confirming, setConfirming] = useState<HomeAction | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [error, setError] = useState<{ actionId: HomeActionId; message: string } | null>(null);
  const mutation = useMutation({
    mutationFn: ({ action, confirmed }: { action: HomeAction; confirmed: boolean }) =>
      hearthApi.executeHomeAction(
        action.id,
        createRequestId(`home_${action.id.replaceAll('-', '_')}`),
        confirmed,
      ),
    onMutate: ({ action }) => {
      setError(null);
      setAnnouncement(`${action.label} is starting.`);
    },
    onSuccess: async (result) => {
      setConfirming(null);
      setAnnouncement(result.message);
      await queryClient.invalidateQueries({ queryKey: queryKeys.home });
      requestAnimationFrame(() => focusById(`home-action-${result.actionId}`));
    },
    onError: (failure, variables) => {
      setConfirming(null);
      setError({ actionId: variables.action.id, message: failure.message });
      setAnnouncement(failure.message);
      requestAnimationFrame(() => focusById(`home-action-${variables.action.id}`));
    },
  });

  useEffect(() => {
    if (confirming !== null) {
      requestAnimationFrame(() => focusById('home-confirm-goodnight'));
    }
  }, [confirming]);

  if (preparing || query.isPending) return <LoadingState />;
  if (query.data === undefined) return <FailureState onRetry={() => void query.refetch()} />;
  const home = query.data;

  function runAction(action: HomeAction, confirmed = false) {
    if (!action.enabled || mutation.isPending) return;
    if (action.confirmation === 'explicit' && !confirmed) {
      setConfirming(action);
      return;
    }
    mutation.mutate({ action, confirmed });
  }

  return (
    <div className="screen home-screen">
      <ScreenHeader title="Home" meta={home.roomLabel} />
      {!online ? (
        <StatusBanner kind="offline">
          You’re offline · Showing the last known room state.
        </StatusBanner>
      ) : null}
      {home.freshness === 'stale' && online ? (
        <StatusBanner kind="unavailable">{home.statusMessage}</StatusBanner>
      ) : null}

      <div className="home-layout">
        <div className="home-overview">
          <section className="home-status-band" aria-label="Living room status">
            <HomeStatusItem
              icon="users"
              label={
                home.occupancy === 'occupied'
                  ? 'Someone is home'
                  : home.occupancy === 'clear'
                    ? 'Room is clear'
                    : 'Presence unknown'
              }
              tone={home.occupancy === 'unknown' ? 'muted' : 'green'}
            />
            <HomeStatusItem
              icon="television"
              label={
                home.televisionPower === 'on'
                  ? 'Television on'
                  : home.televisionPower === 'standby'
                    ? 'Television in standby'
                    : 'Television state unknown'
              }
              tone={home.televisionPower === 'unknown' ? 'muted' : 'green'}
            />
            <HomeStatusItem
              icon="shield"
              label={home.powerProtectionLabel}
              tone={home.protectedMediaActive ? 'ochre' : 'green'}
            />
          </section>
          <div className="home-connection-line" role="status">
            <Icon name="home" />
            Home Assistant ·{' '}
            {home.integration.status === 'healthy' ? 'Connected locally' : 'Last known state'}
          </div>
        </div>

        <section className="home-actions" aria-labelledby="home-actions-heading">
          <h2 id="home-actions-heading">Room actions</h2>
          <div className="home-action-list">
            {home.actions.map((action, index, actions) => {
              const pending = mutation.isPending && mutation.variables.action.id === action.id;
              const actionError = error?.actionId === action.id ? error.message : null;
              return (
                <div className="home-action-wrap" key={action.id}>
                  <button
                    aria-disabled={!action.enabled || mutation.isPending}
                    aria-label={`${action.label}. ${action.description}`}
                    className="home-action focusable"
                    data-focus-entry={index === 0 ? 'true' : undefined}
                    data-focus-down={`home-action-${actions[Math.min(index + 1, actions.length - 1)]?.id ?? action.id}`}
                    data-focus-id={`home-action-${action.id}`}
                    data-focus-left="nav-home"
                    data-focus-up={`home-action-${actions[Math.max(index - 1, 0)]?.id ?? action.id}`}
                    onClick={() => runAction(action)}
                    type="button"
                  >
                    <span className={`home-action__icon home-action__icon--${action.icon}`}>
                      <Icon name={action.icon} />
                    </span>
                    <span className="home-action__copy">
                      <strong>{action.label}</strong>
                      <small>{action.unavailableReason ?? action.description}</small>
                    </span>
                    <span className="home-action__state">
                      {pending ? 'Running…' : action.enabled ? '' : 'Unavailable'}
                    </span>
                    <Icon name="chevron-right" />
                  </button>
                  {actionError === null ? null : (
                    <div className="inline-error" role="alert">
                      <span>{actionError}</span>
                      <button
                        className="text-action"
                        onClick={() => runAction(action)}
                        type="button"
                      >
                        Try again
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {confirming === null ? null : (
        <div
          aria-labelledby="home-confirm-title"
          aria-modal="true"
          className="home-dialog"
          role="dialog"
        >
          <div className="home-dialog__panel">
            <span className="home-dialog__icon">
              <Icon name="moon" />
            </span>
            <h2 id="home-confirm-title">Settle the house for bedtime?</h2>
            <p>Goodnight runs the configured Home Assistant script for this household.</p>
            <div>
              <button
                className="secondary-action focusable"
                data-back-dismiss="true"
                data-focus-id="home-cancel-goodnight"
                data-focus-right="home-confirm-goodnight"
                onClick={() => {
                  setConfirming(null);
                  requestAnimationFrame(() => focusById('home-action-goodnight'));
                }}
                type="button"
              >
                Cancel
              </button>
              <button
                className="primary-action focusable"
                data-focus-id="home-confirm-goodnight"
                data-focus-left="home-cancel-goodnight"
                onClick={() => runAction(confirming, true)}
                type="button"
              >
                Confirm Goodnight
              </button>
            </div>
          </div>
        </div>
      )}

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}

function HomeStatusItem({
  icon,
  label,
  tone,
}: {
  icon: IconName;
  label: string;
  tone: 'green' | 'blue' | 'ochre' | 'muted';
}) {
  return (
    <div className={`home-status-item home-status-item--${tone}`}>
      <span>
        <Icon name={icon} />
      </span>
      <strong>{label}</strong>
    </div>
  );
}
