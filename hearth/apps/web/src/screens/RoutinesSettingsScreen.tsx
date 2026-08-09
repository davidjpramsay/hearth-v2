import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';

import type { ChoreTemplate } from '@hearth/shared';

import {
  createRequestId,
  hearthApi,
  queryKeys,
  type ChoreTemplateInput,
  type HearthMember,
} from '../api/client';
import { AdminError, AdminLoading, AdminPage } from '../components/AdminPage';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { useAdminQuery, useChoreTemplatesQuery } from '../hooks/useHearthQueries';
import { useHearthRuntime } from '../runtime/context';
import { formatChoreTiming } from '../utils/choreTiming';

const weekdayValues = ['MO', 'TU', 'WE', 'TH', 'FR'] as const;
const everyDayValues = [...weekdayValues, 'SA', 'SU'] as const;

export function RoutinesSettingsScreen() {
  const runtime = useHearthRuntime();
  const admin = useAdminQuery();
  const templates = useChoreTemplatesQuery();
  const queryClient = useQueryClient();
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [archiveConfirmation, setArchiveConfirmation] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.choreTemplates }),
      queryClient.invalidateQueries({ queryKey: queryKeys.chores }),
      queryClient.invalidateQueries({ queryKey: queryKeys.today }),
      queryClient.invalidateQueries({ queryKey: queryKeys.pocketMoneyRoot }),
    ]);
  };
  const create = useMutation({
    mutationFn: hearthApi.createChoreTemplate,
    onSuccess: async (result) => {
      await refresh();
      setShowCreate(false);
      setConfirmation(`${result.template.title} was scheduled.`);
    },
  });
  const update = useMutation({
    mutationFn: ({
      templateId,
      fields,
      requestId,
    }: {
      templateId: string;
      fields: ChoreTemplateInput;
      requestId: string;
    }) =>
      hearthApi.updateChoreTemplate(templateId, {
        requestId,
        ...fields,
      }),
    onSuccess: async (result) => {
      await refresh();
      setConfirmation(`${result.template.title} was updated from today forward.`);
    },
  });
  const reorder = useMutation({
    mutationFn: ({
      orderedTemplateIds,
      requestId,
    }: {
      orderedTemplateIds: string[];
      requestId: string;
    }) => hearthApi.reorderChoreTemplates(orderedTemplateIds, requestId),
    onSuccess: async () => {
      await refresh();
      setConfirmation('Chore order was updated on every Hearth screen.');
    },
  });
  const archive = useMutation({
    mutationFn: ({ templateId, requestId }: { templateId: string; requestId: string }) =>
      hearthApi.archiveChoreTemplate(templateId, requestId),
    onSuccess: async (result) => {
      await refresh();
      setArchiveConfirmation(null);
      setConfirmation(`${result.template.title} was archived. Past chore history is unchanged.`);
    },
  });
  const restore = useMutation({
    mutationFn: ({ templateId, requestId }: { templateId: string; requestId: string }) =>
      hearthApi.restoreChoreTemplate(templateId, requestId, runtime.localDate),
    onSuccess: async (result) => {
      await refresh();
      setConfirmation(`${result.template.title} is active again from today.`);
    },
  });

  if (admin.isPending || templates.isPending) return <AdminLoading />;
  if (admin.isError) return <AdminError message={admin.error.message} />;
  if (templates.isError) return <AdminError message={templates.error.message} />;

  function addRoutine(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    create.mutate({
      requestId: createRequestId('routine_create'),
      ...templateFields(new FormData(event.currentTarget), runtime.localDate),
    });
  }

  const activeMembers = admin.data.household.members;
  function retryFailedMutation() {
    if (create.isError && create.variables !== undefined) {
      create.mutate(create.variables);
      return;
    }
    if (update.isError && update.variables !== undefined) {
      update.mutate(update.variables);
      return;
    }
    if (archive.isError && archive.variables !== undefined) {
      archive.mutate(archive.variables);
      return;
    }
    if (reorder.isError && reorder.variables !== undefined) {
      reorder.mutate(reorder.variables);
      return;
    }
    if (restore.isError && restore.variables !== undefined) restore.mutate(restore.variables);
  }
  const activeTemplates = templates.data.templates.filter((template) => !template.archived);
  function moveTemplate(templateId: string, offset: -1 | 1) {
    const currentIndex = activeTemplates.findIndex((template) => template.id === templateId);
    const targetIndex = currentIndex + offset;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= activeTemplates.length) return;
    const orderedTemplateIds = activeTemplates.map((template) => template.id);
    const currentId = orderedTemplateIds[currentIndex];
    const targetId = orderedTemplateIds[targetIndex];
    if (currentId === undefined || targetId === undefined) return;
    orderedTemplateIds[currentIndex] = targetId;
    orderedTemplateIds[targetIndex] = currentId;
    reorder.mutate({
      orderedTemplateIds,
      requestId: createRequestId('routine_reorder'),
    });
  }
  return (
    <AdminPage
      backLabel="Back to Family planning"
      backTo="/admin/planning"
      title="Routines and chores"
      subtitle="Who does what and when"
    >
      <div className="history-safe-note">
        <Icon name="refresh" />
        <p>Changes apply from today forward. Past chore completions stay intact.</p>
      </div>
      {confirmation === null ? null : (
        <p className="save-confirmation" role="status">
          {confirmation}
        </p>
      )}
      {create.isError || update.isError || archive.isError || restore.isError || reorder.isError ? (
        <div className="routine-settings-error">
          <AdminError
            message={
              (create.error ?? update.error ?? archive.error ?? restore.error ?? reorder.error)
                ?.message ?? 'That chore could not be saved.'
            }
          />
          <button className="admin-secondary" onClick={retryFailedMutation} type="button">
            Try again
          </button>
        </div>
      ) : null}
      <div className="routine-settings-toolbar">
        <span>
          <strong>Active chores</strong>
          <small>{activeTemplates.length} schedules · top to bottom on Chores</small>
        </span>
        <button
          className="admin-secondary"
          onClick={() => setShowCreate((visible) => !visible)}
          type="button"
        >
          {showCreate ? 'Cancel' : 'New chore'}
        </button>
      </div>
      {showCreate ? (
        <form className="admin-form routine-add-form" onSubmit={addRoutine}>
          <h2>Add a chore</h2>
          <p>Choose one day for an extra job, or set a calm repeating schedule.</p>
          <RoutineFields members={activeMembers} today={runtime.localDate} />
          <button className="admin-submit" disabled={create.isPending} type="submit">
            {create.isPending ? 'Adding…' : 'Add chore'}
          </button>
        </form>
      ) : null}
      <div className="routine-editor-list">
        {activeTemplates.map((template, index) => (
          <RoutineEditor
            key={template.id}
            archiveConfirmation={archiveConfirmation === template.id}
            members={activeMembers}
            onArchive={() => {
              if (archiveConfirmation !== template.id) {
                setArchiveConfirmation(template.id);
                return;
              }
              archive.mutate({
                templateId: template.id,
                requestId: createRequestId('routine_archive'),
              });
            }}
            onCancelArchive={() => setArchiveConfirmation(null)}
            onMoveDown={() => moveTemplate(template.id, 1)}
            onMoveUp={() => moveTemplate(template.id, -1)}
            onSave={(fields) =>
              update.mutate({
                templateId: template.id,
                fields,
                requestId: createRequestId('routine_update'),
              })
            }
            canMoveDown={index < activeTemplates.length - 1}
            canMoveUp={index > 0}
            pending={update.isPending || archive.isPending || reorder.isPending}
            primary={index === 0}
            today={runtime.localDate}
            template={template}
          />
        ))}
      </div>
      {templates.data.templates.some((template) => template.archived) ? (
        <details className="archived-routines">
          <summary>
            Archived chores ·{' '}
            {templates.data.templates.filter((template) => template.archived).length}
          </summary>
          <p>Archived chores retain their past completions and no longer create new jobs.</p>
          {templates.data.templates
            .filter((template) => template.archived)
            .map((template) => (
              <div className="archived-routine" key={template.id}>
                <AssigneeAvatars members={template.assignees} />
                <span>
                  <strong>{template.title}</strong>
                  <small>
                    {assigneeNames(template)} · {repeatLabel(template)}
                  </small>
                </span>
                <button
                  className="admin-secondary"
                  disabled={restore.isPending}
                  onClick={() =>
                    restore.mutate({
                      templateId: template.id,
                      requestId: createRequestId('routine_restore'),
                    })
                  }
                  type="button"
                >
                  Restore
                </button>
              </div>
            ))}
        </details>
      ) : null}
    </AdminPage>
  );
}

function RoutineEditor({
  template,
  members,
  pending,
  primary,
  today,
  onSave,
  onArchive,
  onCancelArchive,
  onMoveDown,
  onMoveUp,
  archiveConfirmation,
  canMoveDown,
  canMoveUp,
}: {
  template: ChoreTemplate;
  members: HearthMember[];
  pending: boolean;
  primary: boolean;
  today: string;
  onSave: (fields: ChoreTemplateInput) => void;
  onArchive: () => void;
  onCancelArchive: () => void;
  onMoveDown: () => void;
  onMoveUp: () => void;
  archiveConfirmation: boolean;
  canMoveDown: boolean;
  canMoveUp: boolean;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave(templateFields(new FormData(event.currentTarget), today, template.repeatDays));
  }

  return (
    <div className="routine-editor-item">
      <div className="routine-order-controls" aria-label={`Order ${template.title}`}>
        <button
          aria-label={`Move ${template.title} earlier`}
          disabled={!canMoveUp || pending}
          onClick={onMoveUp}
          type="button"
        >
          <Icon name="chevron-up" />
        </button>
        <button
          aria-label={`Move ${template.title} later`}
          disabled={!canMoveDown || pending}
          onClick={onMoveDown}
          type="button"
        >
          <Icon name="chevron-down" />
        </button>
      </div>
      <details className="routine-editor">
        <summary
          data-focus-entry={primary ? 'true' : undefined}
          data-focus-id={`routine-template-${template.id}`}
        >
          <AssigneeAvatars members={template.assignees} />
          <span>
            <strong>{template.title}</strong>
            <small>
              {assigneeNames(template)} · {template.routineLabel} · {repeatLabel(template)}
            </small>
          </span>
          <Icon name="chevron-right" />
        </summary>
        <form onSubmit={submit}>
          <RoutineFields members={members} template={template} today={today} />
          <div className="routine-editor__actions">
            <button className="admin-secondary routine-save" disabled={pending} type="submit">
              {pending ? 'Saving…' : 'Save future schedule'}
            </button>
            <button
              className={archiveConfirmation ? 'admin-danger' : 'admin-secondary'}
              disabled={pending}
              onClick={onArchive}
              type="button"
            >
              {archiveConfirmation ? `Archive ${template.title}?` : 'Archive'}
            </button>
            {archiveConfirmation ? (
              <button className="admin-secondary" onClick={onCancelArchive} type="button">
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      </details>
    </div>
  );
}

function RoutineFields({
  members,
  template,
  today,
}: {
  members: HearthMember[];
  template?: ChoreTemplate;
  today: string;
}) {
  const activeDays: readonly string[] = template?.repeatDays ?? weekdayValues;
  const [repeat, setRepeat] = useState<ChoreTemplateInput['repeat']>(
    template?.repeat ?? 'weekdays',
  );
  const defaultAssigneeId = members.find((member) => member.role === 'child')?.id ?? members[0]?.id;
  const [selectedAssigneeIds, setSelectedAssigneeIds] = useState<string[]>(
    template?.assignees.map((member) => member.id) ??
      (defaultAssigneeId === undefined ? [] : [defaultAssigneeId]),
  );
  return (
    <div className="routine-fields">
      <label>
        Chore
        <input
          defaultValue={template?.title ?? ''}
          maxLength={140}
          name="title"
          placeholder="e.g. Pack school bag"
          required
        />
      </label>
      <label>
        Helpful note
        <input
          defaultValue={template?.description ?? ''}
          maxLength={320}
          name="description"
          placeholder="Optional"
        />
      </label>
      <fieldset className="routine-assignees">
        <legend>People</legend>
        <p id={`routine-assignees-help-${template?.id ?? 'new'}`}>
          Each selected person gets their own chore to complete.
        </p>
        <div className="routine-assignees__options">
          {members.map((member) => {
            const checked = selectedAssigneeIds.includes(member.id);
            return (
              <label key={member.id}>
                <input
                  aria-describedby={`routine-assignees-help-${template?.id ?? 'new'}`}
                  checked={checked}
                  name="assigneeIds"
                  onChange={(event) => {
                    const checkedNow = event.currentTarget.checked;
                    setSelectedAssigneeIds((current) => {
                      if (checkedNow) return [...current, member.id];
                      return current.length === 1
                        ? current
                        : current.filter((memberId) => memberId !== member.id);
                    });
                  }}
                  type="checkbox"
                  value={member.id}
                />
                <Avatar member={member} size="small" />
                <span>
                  <strong>{member.displayName}</strong>
                  <small>{member.role === 'child' ? 'Child' : 'Adult'}</small>
                </span>
                <Icon name="check" />
              </label>
            );
          })}
        </div>
      </fieldset>
      <div className="admin-form__split routine-fields__split">
        <label>
          Repeat
          <select
            name="repeat"
            onChange={(event) =>
              setRepeat(event.currentTarget.value as ChoreTemplateInput['repeat'])
            }
            value={repeat}
          >
            <option value="once">One day only</option>
            <option value="daily">Every day</option>
            <option value="weekdays">Weekdays</option>
            <option value="weekly">Selected days each week</option>
          </select>
        </label>
        <label>
          Routine group
          <input
            defaultValue={
              template?.routineLabel ?? (repeat === 'once' ? 'Extra jobs' : 'Morning routine')
            }
            maxLength={80}
            name="routineLabel"
            required
          />
        </label>
      </div>
      {repeat === 'weekly' ? (
        <fieldset className="routine-days">
          <legend>Repeat on</legend>
          {(
            [
              ['MO', 'Monday'],
              ['TU', 'Tuesday'],
              ['WE', 'Wednesday'],
              ['TH', 'Thursday'],
              ['FR', 'Friday'],
              ['SA', 'Saturday'],
              ['SU', 'Sunday'],
            ] as const
          ).map(([value, label]) => (
            <label key={value}>
              <input
                defaultChecked={activeDays.includes(value)}
                name="repeatDays"
                type="checkbox"
                value={value}
              />
              {label.slice(0, 2)}
              <span className="sr-only">{label}</span>
            </label>
          ))}
        </fieldset>
      ) : null}
      <label>
        {repeat === 'once' ? 'Due date' : 'Starts'}
        <input
          defaultValue={
            template === undefined || template.repeat !== 'once' ? today : template.activeFrom
          }
          min={today}
          name="activeFrom"
          required
          type="date"
        />
      </label>
      <fieldset className="routine-time-window">
        <legend>Time window</legend>
        <p>Optional · use either time or both. Hearth keeps the label compact on television.</p>
        <div className="admin-form__split routine-fields__split">
          <label>
            Available from
            <input
              defaultValue={template?.availableFromTime ?? ''}
              name="availableFromTime"
              type="time"
            />
          </label>
          <label>
            Due by
            <input defaultValue={template?.dueTime ?? ''} name="dueTime" type="time" />
          </label>
        </div>
      </fieldset>
    </div>
  );
}

function templateFields(
  data: FormData,
  today: string,
  existingDays?: ChoreTemplate['repeatDays'],
): ChoreTemplateInput {
  const repeat =
    data.get('repeat') === 'once'
      ? 'once'
      : data.get('repeat') === 'daily'
        ? 'daily'
        : data.get('repeat') === 'weekly'
          ? 'weekly'
          : 'weekdays';
  const selectedDays = data
    .getAll('repeatDays')
    .map(String)
    .filter((value): value is ChoreTemplateInput['repeatDays'][number] =>
      everyDayValues.includes(value as ChoreTemplateInput['repeatDays'][number]),
    );
  return {
    title: String(data.get('title') ?? '').trim(),
    description: String(data.get('description') ?? '').trim() || null,
    assigneeIds: data.getAll('assigneeIds').map(String),
    routineLabel: String(data.get('routineLabel') ?? '').trim(),
    availableFromTime: String(data.get('availableFromTime') ?? '').trim() || null,
    dueTime: String(data.get('dueTime') ?? '').trim() || null,
    repeat,
    repeatDays:
      repeat === 'once'
        ? []
        : repeat === 'daily'
          ? [...everyDayValues]
          : repeat === 'weekdays'
            ? [...weekdayValues]
            : selectedDays.length > 0
              ? selectedDays
              : [existingDays?.[0] ?? 'MO'],
    activeFrom: String(data.get('activeFrom') ?? today),
  };
}

function repeatLabel(template: ChoreTemplate): string {
  const repeat =
    template.repeat === 'once'
      ? `One-off · ${formatLocalDate(template.activeFrom)}`
      : template.repeat === 'daily'
        ? 'Every day'
        : template.repeat === 'weekdays'
          ? 'Weekdays'
          : `Every ${formatList(template.repeatDays.map((day) => dayLabels[day]))}`;
  const timing = formatChoreTiming(template.availableFromTime, template.dueTime);
  return timing === null ? repeat : `${repeat} · ${timing}`;
}

function assigneeNames(template: ChoreTemplate): string {
  return formatList(template.assignees.map((member) => member.displayName));
}

function AssigneeAvatars({ members }: { members: ChoreTemplate['assignees'] }) {
  const visible = members.slice(0, 3);
  return (
    <span
      aria-label={`Assigned to ${formatList(members.map((member) => member.displayName))}`}
      className="routine-assignee-avatars"
      role="img"
    >
      {visible.map((member) => (
        <Avatar key={member.id} member={member} size="small" />
      ))}
      {members.length > visible.length ? (
        <span aria-hidden="true" className="routine-assignee-avatars__more">
          +{members.length - visible.length}
        </span>
      ) : null}
    </span>
  );
}

const dayLabels: Record<ChoreTemplate['repeatDays'][number], string> = {
  MO: 'Mon',
  TU: 'Tue',
  WE: 'Wed',
  TH: 'Thu',
  FR: 'Fri',
  SA: 'Sat',
  SU: 'Sun',
};

function formatList(items: string[]): string {
  if (items.length < 2) return items[0] ?? 'selected day';
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

function formatLocalDate(localDate: string): string {
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${localDate}T12:00:00Z`));
}
