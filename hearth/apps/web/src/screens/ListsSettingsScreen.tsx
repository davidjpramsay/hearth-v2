import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Archive, ArrowDown, ArrowUp, RotateCcw, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import type { HouseholdList, HouseholdListType, ListItem } from '@hearth/shared';

import { createRequestId } from '../api/core';
import { listsApi as hearthApi } from '../api/lists';
import { queryKeys } from '../api/queryKeys';
import { AdminError, AdminLoading, AdminPage } from '../components/AdminPage';
import { Icon } from '../components/Icon';
import { useListSettingsQuery } from '../hooks/useListQueries';

const listColours = [
  '#3f7251',
  '#1668b7',
  '#c97900',
  '#a14f72',
  '#6d5b8f',
  '#b35d3f',
  '#327878',
  '#765641',
] as const;

interface ListFields {
  name: string;
  type: HouseholdListType;
  color: string;
}

type ManagementAction = { requestId: string } & (
  | { kind: 'create-list'; fields: ListFields }
  | { kind: 'update-list'; listId: string; fields: ListFields }
  | { kind: 'archive-list'; listId: string; name: string }
  | { kind: 'restore-list'; listId: string; name: string }
  | { kind: 'reorder-lists'; orderedIds: string[]; name: string }
  | { kind: 'add-item'; listId: string; text: string; quantity: string | null }
  | { kind: 'update-item'; itemId: string; text: string; quantity: string | null }
  | { kind: 'archive-item'; itemId: string; text: string }
  | { kind: 'reorder-items'; listId: string; orderedIds: string[]; text: string }
  | { kind: 'clear-checked'; listId: string; name: string }
);

export function ListsSettingsScreen() {
  const settings = useListSettingsQuery();
  const queryClient = useQueryClient();
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [archiveConfirmation, setArchiveConfirmation] = useState<string | null>(null);
  const [removeConfirmation, setRemoveConfirmation] = useState<string | null>(null);
  const [clearConfirmation, setClearConfirmation] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const management = useMutation({
    mutationFn: runManagementAction,
    onSuccess: async ({ result, message }, action) => {
      queryClient.setQueryData(queryKeys.listSettings, result.settings);
      queryClient.setQueryData(queryKeys.lists, {
        householdId: result.settings.householdId,
        lists: result.settings.activeLists,
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.today });
      if (action.kind === 'create-list') {
        setSelectedListId(result.audit.targetId);
        setShowCreate(false);
      }
      if (action.kind === 'archive-list')
        setSelectedListId(result.settings.activeLists[0]?.id ?? null);
      setArchiveConfirmation(null);
      setRemoveConfirmation(null);
      setClearConfirmation(false);
      setConfirmation(message);
    },
  });

  if (settings.isPending) return <AdminLoading />;
  if (settings.isError) return <AdminError message={settings.error.message} />;

  const selected =
    settings.data.activeLists.find((list) => list.id === selectedListId) ??
    settings.data.activeLists[0];

  function createList(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    management.mutate({
      kind: 'create-list',
      requestId: createRequestId('list_create'),
      fields: listFields(new FormData(event.currentTarget)),
    });
  }

  return (
    <AdminPage backLabel="Back to Family planning" backTo="/admin/planning" title="Household lists">
      {confirmation === null ? null : (
        <p className="save-confirmation" role="status">
          {confirmation}
        </p>
      )}
      {management.isError ? (
        <div className="list-settings-error">
          <AdminError message={management.error.message} />
          {management.variables === undefined ? null : (
            <button
              className="admin-secondary"
              onClick={() => management.mutate(management.variables)}
              type="button"
            >
              Try again
            </button>
          )}
        </div>
      ) : null}

      <section className="list-settings-overview" aria-labelledby="active-lists-heading">
        <header>
          <div>
            <h2 id="active-lists-heading">Active lists</h2>
            <p>The top list appears first.</p>
          </div>
          <button
            className="admin-secondary list-settings-new"
            data-focus-entry="true"
            onClick={() => setShowCreate((visible) => !visible)}
            type="button"
          >
            <Icon name="plus" /> {showCreate ? 'Cancel' : 'New list'}
          </button>
        </header>

        {showCreate ? (
          <form className="list-settings-create admin-form" onSubmit={createList}>
            <h3>Create a list</h3>
            <ListFields defaultColor={listColours[3]} />
            <button className="admin-submit" disabled={management.isPending} type="submit">
              {management.isPending ? 'Creating…' : 'Create list'}
            </button>
          </form>
        ) : null}

        <div className="list-settings-cards">
          {settings.data.activeLists.map((list, index, lists) => (
            <article
              className={`list-settings-card${selected?.id === list.id ? ' list-settings-card--selected' : ''}`}
              key={list.id}
            >
              <button
                aria-current={selected?.id === list.id ? 'true' : undefined}
                className="list-settings-card__select"
                onClick={() => {
                  setSelectedListId(list.id);
                  setClearConfirmation(false);
                }}
                type="button"
              >
                <span className="list-settings-card__swatch" style={{ background: list.color }} />
                <span>
                  <strong>{list.name}</strong>
                  <small>
                    {list.remainingCount} left · {list.totalCount} total
                  </small>
                </span>
                <Icon name="chevron-right" />
              </button>
              <div className="list-settings-order" aria-label={`Order ${list.name}`}>
                <button
                  aria-label={`Move ${list.name} up`}
                  disabled={index === 0 || management.isPending}
                  onClick={() =>
                    management.mutate({
                      kind: 'reorder-lists',
                      requestId: createRequestId('list_reorder'),
                      orderedIds: moveIds(lists, index, index - 1),
                      name: list.name,
                    })
                  }
                  type="button"
                >
                  <ArrowUp aria-hidden="true" />
                </button>
                <button
                  aria-label={`Move ${list.name} down`}
                  disabled={index === lists.length - 1 || management.isPending}
                  onClick={() =>
                    management.mutate({
                      kind: 'reorder-lists',
                      requestId: createRequestId('list_reorder'),
                      orderedIds: moveIds(lists, index, index + 1),
                      name: list.name,
                    })
                  }
                  type="button"
                >
                  <ArrowDown aria-hidden="true" />
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      {selected === undefined ? null : (
        <ListEditor
          archiveConfirmation={archiveConfirmation === selected.id}
          clearConfirmation={clearConfirmation}
          list={selected}
          managementPending={management.isPending}
          onArchive={() => {
            if (archiveConfirmation === selected.id) {
              management.mutate({
                kind: 'archive-list',
                requestId: createRequestId('list_archive'),
                listId: selected.id,
                name: selected.name,
              });
            } else {
              setArchiveConfirmation(selected.id);
            }
          }}
          onCancelArchive={() => setArchiveConfirmation(null)}
          onCancelClear={() => setClearConfirmation(false)}
          onCancelRemove={() => setRemoveConfirmation(null)}
          onClearChecked={() => {
            if (clearConfirmation) {
              management.mutate({
                kind: 'clear-checked',
                requestId: createRequestId('list_clear_checked'),
                listId: selected.id,
                name: selected.name,
              });
            } else {
              setClearConfirmation(true);
            }
          }}
          onMoveItem={(index, destination) =>
            management.mutate({
              kind: 'reorder-items',
              requestId: createRequestId('list_item_reorder'),
              listId: selected.id,
              orderedIds: moveIds(selected.items, index, destination),
              text: selected.items[index]?.text ?? 'Item',
            })
          }
          onAddItem={(text, quantity) =>
            management.mutate({
              kind: 'add-item',
              requestId: createRequestId('list_item_add_admin'),
              listId: selected.id,
              text,
              quantity,
            })
          }
          onRemoveItem={(item) => {
            if (removeConfirmation === item.id) {
              management.mutate({
                kind: 'archive-item',
                requestId: createRequestId('list_item_archive'),
                itemId: item.id,
                text: item.text,
              });
            } else {
              setRemoveConfirmation(item.id);
            }
          }}
          onSaveItem={(itemId, text, quantity) =>
            management.mutate({
              kind: 'update-item',
              requestId: createRequestId('list_item_update'),
              itemId,
              text,
              quantity,
            })
          }
          onSaveList={(fields) =>
            management.mutate({
              kind: 'update-list',
              requestId: createRequestId('list_update'),
              listId: selected.id,
              fields,
            })
          }
          removeConfirmation={removeConfirmation}
        />
      )}

      {settings.data.archivedLists.length === 0 ? null : (
        <section className="archived-list-settings" aria-labelledby="archived-lists-heading">
          <h2 id="archived-lists-heading">Archived lists</h2>
          {settings.data.archivedLists.map((list) => (
            <article key={list.id}>
              <span className="list-settings-card__swatch" style={{ background: list.color }} />
              <div>
                <strong>{list.name}</strong>
                <small>Archived</small>
              </div>
              <button
                className="admin-secondary"
                disabled={management.isPending}
                onClick={() =>
                  management.mutate({
                    kind: 'restore-list',
                    requestId: createRequestId('list_restore'),
                    listId: list.id,
                    name: list.name,
                  })
                }
                type="button"
              >
                <RotateCcw aria-hidden="true" /> Restore
              </button>
            </article>
          ))}
        </section>
      )}
    </AdminPage>
  );
}

function ListEditor({
  list,
  managementPending,
  archiveConfirmation,
  clearConfirmation,
  removeConfirmation,
  onSaveList,
  onAddItem,
  onArchive,
  onCancelArchive,
  onSaveItem,
  onRemoveItem,
  onCancelRemove,
  onMoveItem,
  onClearChecked,
  onCancelClear,
}: {
  list: HouseholdList;
  managementPending: boolean;
  archiveConfirmation: boolean;
  clearConfirmation: boolean;
  removeConfirmation: string | null;
  onSaveList: (fields: ListFields) => void;
  onAddItem: (text: string, quantity: string | null) => void;
  onArchive: () => void;
  onCancelArchive: () => void;
  onSaveItem: (itemId: string, text: string, quantity: string | null) => void;
  onRemoveItem: (item: ListItem) => void;
  onCancelRemove: () => void;
  onMoveItem: (index: number, destination: number) => void;
  onClearChecked: () => void;
  onCancelClear: () => void;
}) {
  function saveList(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSaveList(listFields(new FormData(event.currentTarget)));
  }

  const checkedCount = list.items.filter((item) => item.checked).length;
  return (
    <section className="list-settings-editor" aria-labelledby="list-editor-heading">
      <header>
        <div>
          <span className="list-settings-card__swatch" style={{ background: list.color }} />
          <div>
            <h2 id="list-editor-heading">Edit {list.name}</h2>
          </div>
        </div>
      </header>

      <form className="admin-form list-settings-details" onSubmit={saveList}>
        <ListFields list={list} />
        <div className="list-settings-details__actions">
          <button className="admin-secondary" disabled={managementPending} type="submit">
            {managementPending ? 'Saving…' : 'Save list details'}
          </button>
          <button
            className="admin-danger"
            disabled={managementPending}
            onClick={onArchive}
            type="button"
          >
            <Archive aria-hidden="true" />
            {archiveConfirmation ? `Archive ${list.name}?` : 'Archive list'}
          </button>
          {archiveConfirmation ? (
            <button className="admin-secondary" onClick={onCancelArchive} type="button">
              Cancel
            </button>
          ) : null}
        </div>
      </form>

      <div className="list-settings-items">
        <div className="list-settings-items__heading">
          <h3>Items</h3>
          {checkedCount === 0 ? null : (
            <div className="clear-checked-actions">
              <button
                className={clearConfirmation ? 'admin-danger' : 'admin-secondary'}
                disabled={managementPending}
                onClick={onClearChecked}
                type="button"
              >
                <Trash2 aria-hidden="true" />
                {clearConfirmation
                  ? `Clear ${checkedCount} checked item${checkedCount === 1 ? '' : 's'}?`
                  : 'Clear checked'}
              </button>
              {clearConfirmation ? (
                <button className="admin-secondary" onClick={onCancelClear} type="button">
                  Cancel
                </button>
              ) : null}
            </div>
          )}
        </div>

        <form
          className="list-settings-add-item"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const data = new FormData(form);
            const text = String(data.get('newItem') ?? '').trim();
            const quantityValue = String(data.get('newQuantity') ?? '').trim();
            if (text === '') return;
            onAddItem(text, quantityValue === '' ? null : quantityValue);
            form.reset();
          }}
        >
          <label>
            <span className="sr-only">New item</span>
            <input maxLength={160} name="newItem" placeholder="Add an item" required />
          </label>
          <label>
            <span className="sr-only">New item quantity</span>
            <input maxLength={40} name="newQuantity" placeholder="Qty" />
          </label>
          <button className="admin-secondary" disabled={managementPending} type="submit">
            <Icon name="plus" /> Add item
          </button>
        </form>

        {list.items.length === 0 ? (
          <p className="list-settings-empty">No items.</p>
        ) : (
          <div className="list-settings-item-list">
            {list.items.map((item, index, items) => (
              <ItemEditor
                item={item}
                key={item.id}
                moveDown={() => onMoveItem(index, index + 1)}
                moveDownDisabled={
                  index === items.length - 1 ||
                  managementPending ||
                  items[index + 1]?.checked !== item.checked
                }
                moveUp={() => onMoveItem(index, index - 1)}
                moveUpDisabled={
                  index === 0 || managementPending || items[index - 1]?.checked !== item.checked
                }
                onCancelRemove={onCancelRemove}
                onRemove={() => onRemoveItem(item)}
                onSave={onSaveItem}
                pending={managementPending}
                removeConfirmation={removeConfirmation === item.id}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function ItemEditor({
  item,
  pending,
  removeConfirmation,
  moveUpDisabled,
  moveDownDisabled,
  moveUp,
  moveDown,
  onSave,
  onRemove,
  onCancelRemove,
}: {
  item: ListItem;
  pending: boolean;
  removeConfirmation: boolean;
  moveUpDisabled: boolean;
  moveDownDisabled: boolean;
  moveUp: () => void;
  moveDown: () => void;
  onSave: (itemId: string, text: string, quantity: string | null) => void;
  onRemove: () => void;
  onCancelRemove: () => void;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const text = String(data.get('text') ?? '').trim();
    const quantityValue = String(data.get('quantity') ?? '').trim();
    onSave(item.id, text, quantityValue === '' ? null : quantityValue);
  }

  return (
    <form
      className={`list-settings-item${item.checked ? ' list-settings-item--checked' : ''}`}
      onSubmit={submit}
    >
      <span className="list-settings-item__state">
        {item.checked ? <Icon name="check" /> : null}
      </span>
      <label>
        <span className="sr-only">Item</span>
        <input
          aria-label={`Item name for ${item.text}`}
          defaultValue={item.text}
          name="text"
          required
        />
      </label>
      <label>
        <span className="sr-only">Quantity</span>
        <input
          aria-label={`Quantity for ${item.text}`}
          defaultValue={item.quantity ?? ''}
          maxLength={40}
          name="quantity"
          placeholder="Qty"
        />
      </label>
      <button className="admin-secondary" disabled={pending} type="submit">
        Save
      </button>
      <div className="list-settings-item__order">
        <button
          aria-label={`Move ${item.text} up`}
          disabled={moveUpDisabled}
          onClick={moveUp}
          type="button"
        >
          <ArrowUp aria-hidden="true" />
        </button>
        <button
          aria-label={`Move ${item.text} down`}
          disabled={moveDownDisabled}
          onClick={moveDown}
          type="button"
        >
          <ArrowDown aria-hidden="true" />
        </button>
      </div>
      <button className="admin-danger" disabled={pending} onClick={onRemove} type="button">
        <Trash2 aria-hidden="true" /> {removeConfirmation ? `Remove ${item.text}?` : 'Remove'}
      </button>
      {removeConfirmation ? (
        <button className="admin-secondary" onClick={onCancelRemove} type="button">
          Cancel
        </button>
      ) : null}
    </form>
  );
}

function ListFields({
  list,
  defaultColor = listColours[0],
}: {
  list?: HouseholdList;
  defaultColor?: string;
}) {
  return (
    <>
      <div className="admin-form__split">
        <label>
          List name
          <input defaultValue={list?.name ?? ''} maxLength={100} name="name" required />
        </label>
        <label>
          List type
          <select defaultValue={list?.type ?? 'custom'} name="type">
            <option value="grocery">Groceries</option>
            <option value="packing">Packing</option>
            <option value="shopping">Shopping</option>
            <option value="wish">Wish list</option>
            <option value="custom">General</option>
          </select>
        </label>
      </div>
      <fieldset className="list-colour-picker">
        <legend>Colour</legend>
        <div>
          {listColours.map((color) => (
            <label key={color}>
              <input
                aria-label={`Use list colour ${color}`}
                defaultChecked={(list?.color ?? defaultColor) === color}
                name="color"
                type="radio"
                value={color}
              />
              <span style={{ background: color }} />
            </label>
          ))}
        </div>
      </fieldset>
    </>
  );
}

async function runManagementAction(action: ManagementAction) {
  switch (action.kind) {
    case 'create-list':
      return {
        result: await hearthApi.createList({
          requestId: action.requestId,
          ...action.fields,
        }),
        message: `${action.fields.name} was created.`,
      };
    case 'update-list':
      return {
        result: await hearthApi.updateList(action.listId, {
          requestId: action.requestId,
          ...action.fields,
        }),
        message: `${action.fields.name} was updated.`,
      };
    case 'archive-list':
      return {
        result: await hearthApi.archiveList(action.listId, action.requestId),
        message: `${action.name} was archived and can be restored.`,
      };
    case 'restore-list':
      return {
        result: await hearthApi.restoreList(action.listId, action.requestId),
        message: `${action.name} is active again.`,
      };
    case 'reorder-lists':
      return {
        result: await hearthApi.reorderLists(action.orderedIds, action.requestId),
        message: `${action.name} was moved.`,
      };
    case 'add-item': {
      const added = await hearthApi.addListItem(
        action.listId,
        {
          requestId: action.requestId,
          text: action.text,
          quantity: action.quantity,
        },
        'companion',
      );
      const settings = await hearthApi.getListSettings();
      return {
        result: { settings, audit: added.audit, replayed: added.replayed },
        message: `${action.text} was added.`,
      };
    }
    case 'update-item':
      return {
        result: await hearthApi.updateListItem(action.itemId, {
          requestId: action.requestId,
          text: action.text,
          quantity: action.quantity,
        }),
        message: `${action.text} was updated.`,
      };
    case 'archive-item':
      return {
        result: await hearthApi.archiveListItem(action.itemId, action.requestId),
        message: `${action.text} was removed.`,
      };
    case 'reorder-items':
      return {
        result: await hearthApi.reorderListItems(
          action.listId,
          action.orderedIds,
          action.requestId,
        ),
        message: `${action.text} was moved.`,
      };
    case 'clear-checked':
      return {
        result: await hearthApi.clearCheckedListItems(action.listId, action.requestId),
        message: `Checked items were cleared from ${action.name}.`,
      };
  }
}

function listFields(data: FormData): ListFields {
  return {
    name: String(data.get('name') ?? '').trim(),
    type: String(data.get('type') ?? 'custom') as HouseholdListType,
    color: String(data.get('color') ?? listColours[0]),
  };
}

function moveIds(items: readonly { id: string }[], from: number, to: number): string[] {
  const ids = items.map((item) => item.id);
  const [moved] = ids.splice(from, 1);
  if (moved !== undefined) ids.splice(to, 0, moved);
  return ids;
}
