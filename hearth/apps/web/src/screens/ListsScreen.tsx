import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';

import type { DemoScenario, ListItem } from '@hearth/shared';

import { createRequestId, hearthApi, queryKeys } from '../api/client';
import { Icon } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';
import { EmptyState, FailureState, LoadingState, StatusBanner } from '../components/Status';
import { useListMutation } from '../hooks/useListMutation';
import { useListsQuery } from '../hooks/useHearthQueries';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export function ListsScreen({
  scenario,
  preparing,
}: {
  scenario: DemoScenario | 'offline';
  preparing: boolean;
}) {
  const query = useListsQuery(!preparing);
  const queryClient = useQueryClient();
  const itemMutation = useListMutation();
  const [selectedListId, setSelectedListId] = useState('list_groceries');
  const [announcement, setAnnouncement] = useState('');
  const online = useOnlineStatus(scenario === 'offline');
  const add = useMutation({
    mutationFn: ({ listId, text }: { listId: string; text: string }) =>
      hearthApi.addListItem(
        listId,
        { requestId: createRequestId('list_add_companion'), text, quantity: null },
        'companion',
      ),
    onSuccess: (result) => {
      queryClient.setQueryData(queryKeys.lists, (current: typeof query.data) =>
        current === undefined
          ? current
          : {
              ...current,
              lists: current.lists.map((list) => (list.id === result.list.id ? result.list : list)),
            },
      );
      setAnnouncement(`${result.item.text} added to ${result.list.name}.`);
      void queryClient.invalidateQueries({ queryKey: queryKeys.today });
    },
  });

  if (preparing || query.isPending) return <LoadingState />;
  if (query.data === undefined) return <FailureState onRetry={() => void query.refetch()} />;
  if (query.data.lists.length === 0) return <EmptyState onBootstrap={() => void query.refetch()} />;
  const selected =
    query.data.lists.find((list) => list.id === selectedListId) ?? query.data.lists[0];
  if (selected === undefined) return <EmptyState onBootstrap={() => void query.refetch()} />;
  const selectedListIdForCommand = selected.id;
  const orderedItems = [
    ...selected.items.filter((item) => !item.checked),
    ...selected.items.filter((item) => item.checked),
  ];

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const text = String(new FormData(form).get('item') ?? '').trim();
    if (text.length === 0) return;
    add.mutate({ listId: selectedListIdForCommand, text });
    form.reset();
  }

  return (
    <div className="screen lists-screen">
      <ScreenHeader
        eyebrow="Local household lists"
        title="Lists"
        meta={`${selected.remainingCount} remaining in ${selected.name}`}
      />
      {!online ? (
        <StatusBanner kind="offline">You’re offline · Saved lists remain available.</StatusBanner>
      ) : null}
      <div className="lists-layout">
        <nav className="list-chooser" aria-label="Household lists">
          {query.data.lists.map((list, index, lists) => (
            <button
              aria-current={list.id === selected.id ? 'page' : undefined}
              className={`list-choice focusable${list.id === selected.id ? ' list-choice--selected' : ''}`}
              data-focus-down={`list-choice-${lists[Math.min(index + 1, lists.length - 1)]?.id ?? list.id}`}
              data-focus-id={`list-choice-${list.id}`}
              data-focus-left="nav-lists"
              data-focus-right={`list-item-${list.items.find((item) => !item.checked)?.id ?? list.items[0]?.id ?? 'none'}`}
              data-focus-up={`list-choice-${lists[Math.max(index - 1, 0)]?.id ?? list.id}`}
              key={list.id}
              onClick={() => setSelectedListId(list.id)}
              type="button"
            >
              <Icon
                name={list.type === 'grocery' ? 'list' : list.type === 'packing' ? 'image' : 'home'}
              />
              <span>
                <strong>{list.name}</strong>
                <small>{list.remainingCount} waiting</small>
              </span>
            </button>
          ))}
        </nav>
        <section className="active-list" aria-labelledby="active-list-heading">
          <div className="active-list__heading">
            <div>
              <h2 id="active-list-heading">{selected.name}</h2>
              <p>{selected.remainingCount} remaining</p>
            </div>
            <Icon name="list" />
          </div>
          <div className="list-items">
            {orderedItems.map((item, index) => (
              <ListItemRow
                failed={itemMutation.failedItemId === item.id}
                focusDown={`list-item-${orderedItems[Math.min(index + 1, orderedItems.length - 1)]?.id ?? item.id}`}
                focusUp={`list-item-${orderedItems[Math.max(index - 1, 0)]?.id ?? item.id}`}
                item={item}
                key={item.id}
                message={itemMutation.errorMessage}
                onActivate={() => itemMutation.mutate({ item })}
                onRetry={() => {
                  itemMutation.clearError();
                  itemMutation.mutate({ item });
                }}
                pending={itemMutation.pendingItemId === item.id}
                primary={index === 0}
                selectedListId={selected.id}
              />
            ))}
          </div>
          <form className="phone-list-add" onSubmit={submit}>
            <label className="sr-only" htmlFor="new-list-item">
              Add an item
            </label>
            <input id="new-list-item" maxLength={160} name="item" placeholder="Add an item" />
            <button disabled={add.isPending} type="submit">
              {add.isPending ? 'Adding…' : 'Add'}
            </button>
          </form>
          <p className="assist-availability-note">
            Home Assistant Assist can add items through the same validated household command.
          </p>
          {add.isError ? (
            <p className="list-command-error" role="alert">
              {add.error.message}
            </p>
          ) : null}
        </section>
      </div>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}

function ListItemRow({
  item,
  selectedListId,
  focusUp,
  focusDown,
  pending,
  primary,
  failed,
  message,
  onActivate,
  onRetry,
}: {
  item: ListItem;
  selectedListId: string;
  focusUp: string;
  focusDown: string;
  pending: boolean;
  primary: boolean;
  failed: boolean;
  message: string | null;
  onActivate: () => void;
  onRetry: () => void;
}) {
  return (
    <div className={`list-item-wrap${failed ? ' list-item-wrap--failed' : ''}`}>
      <button
        aria-label={item.checked ? `${item.text}, checked. Undo` : `Check ${item.text}`}
        className={`list-item-row focusable${item.checked ? ' list-item-row--checked' : ''}`}
        data-focus-entry={primary ? 'true' : undefined}
        data-focus-down={focusDown}
        data-focus-id={`list-item-${item.id}`}
        data-focus-left={`list-choice-${selectedListId}`}
        data-focus-up={focusUp}
        onClick={onActivate}
        type="button"
      >
        <span className="list-item-check">
          <Icon name="check" />
        </span>
        <strong>{item.text}</strong>
        <span className="list-item-state">
          {pending ? 'Saving…' : item.checked ? 'Checked · Undo' : 'Check item'}
        </span>
        <Icon name="chevron-right" />
      </button>
      {failed ? (
        <div className="inline-error" role="alert">
          <span>{message}</span>
          <button className="text-action" onClick={onRetry} type="button">
            Try again
          </button>
        </div>
      ) : null}
    </div>
  );
}
