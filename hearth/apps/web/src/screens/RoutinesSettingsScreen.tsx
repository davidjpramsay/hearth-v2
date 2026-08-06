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

const weekdayValues = ['MO', 'TU', 'WE', 'TH', 'FR'] as const;
const everyDayValues = [...weekdayValues, 'SA', 'SU'] as const;

export function RoutinesSettingsScreen() {
  const admin = useAdminQuery();
  const templates = useChoreTemplatesQuery();
  const queryClient = useQueryClient();
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.choreTemplates }),
      queryClient.invalidateQueries({ queryKey: queryKeys.chores }),
      queryClient.invalidateQueries({ queryKey: queryKeys.today }),
    ]);
  };
  const create = useMutation({
    mutationFn: hearthApi.createChoreTemplate,
    onSuccess: async (result) => {
      await refresh();
      setConfirmation(`${result.template.title} was added for future days.`);
    },
  });
  const update = useMutation({
    mutationFn: ({ templateId, fields }: { templateId: string; fields: ChoreTemplateInput }) =>
      hearthApi.updateChoreTemplate(templateId, {
        requestId: createRequestId('routine_update'),
        ...fields,
      }),
    onSuccess: async (result) => {
      await refresh();
      setConfirmation(`${result.template.title} was updated from today forward.`);
    },
  });

  if (admin.isPending || templates.isPending) return <AdminLoading />;
  if (admin.isError) return <AdminError message={admin.error.message} />;
  if (templates.isError) return <AdminError message={templates.error.message} />;

  function addRoutine(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    create.mutate({
      requestId: createRequestId('routine_create'),
      ...templateFields(new FormData(form)),
    });
    form.reset();
  }

  const activeMembers = admin.data.household.members;
  return (
    <AdminPage
      backLabel="Back to Family planning"
      backTo="/admin/planning"
      title="Routines and chores"
      subtitle="Who does what, when, and how many stars it earns"
    >
      <div className="history-safe-note">
        <Icon name="refresh" />
        <p>Changes apply from today forward. Past completions and earned stars stay intact.</p>
      </div>
      {confirmation === null ? null : (
        <p className="save-confirmation" role="status">
          {confirmation}
        </p>
      )}
      {create.isError || update.isError ? (
        <AdminError
          message={(create.error ?? update.error)?.message ?? 'That routine could not be saved.'}
        />
      ) : null}
      <div className="routine-editor-list">
        {templates.data.templates
          .filter((template) => !template.archived)
          .map((template) => (
            <RoutineEditor
              key={template.id}
              members={activeMembers}
              onSave={(fields) => update.mutate({ templateId: template.id, fields })}
              pending={update.isPending}
              template={template}
            />
          ))}
      </div>
      <form className="admin-form routine-add-form" onSubmit={addRoutine}>
        <h2>Add a recurring chore</h2>
        <RoutineFields members={activeMembers} />
        <button className="admin-submit" disabled={create.isPending} type="submit">
          {create.isPending ? 'Adding…' : 'Add recurring chore'}
        </button>
      </form>
    </AdminPage>
  );
}

function RoutineEditor({
  template,
  members,
  pending,
  onSave,
}: {
  template: ChoreTemplate;
  members: HearthMember[];
  pending: boolean;
  onSave: (fields: ChoreTemplateInput) => void;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave(templateFields(new FormData(event.currentTarget), template.repeatDays));
  }

  return (
    <details className="routine-editor" open={template.id === 'template_school_bag'}>
      <summary data-focus-id={`routine-template-${template.id}`}>
        <Avatar member={template.assignee} />
        <span>
          <strong>{template.title}</strong>
          <small>
            {repeatLabel(template)} · {template.pointsValue} stars
          </small>
        </span>
        <Icon name="chevron-right" />
      </summary>
      <form onSubmit={submit}>
        <RoutineFields members={members} template={template} />
        <button className="admin-secondary routine-save" disabled={pending} type="submit">
          {pending ? 'Saving…' : 'Save future routine'}
        </button>
      </form>
    </details>
  );
}

function RoutineFields({
  members,
  template,
}: {
  members: HearthMember[];
  template?: ChoreTemplate;
}) {
  const activeDays: readonly string[] = template?.repeatDays ?? weekdayValues;
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
      <div className="admin-form__split routine-fields__split">
        <label>
          Person
          <select defaultValue={template?.assignee.id ?? members[0]?.id} name="assigneeId" required>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.displayName}
              </option>
            ))}
          </select>
        </label>
        <label>
          Stars
          <input
            defaultValue={template?.pointsValue ?? 1}
            max={100}
            min={0}
            name="pointsValue"
            type="number"
          />
        </label>
      </div>
      <div className="admin-form__split routine-fields__split">
        <label>
          Repeat
          <select defaultValue={template?.repeat ?? 'weekdays'} name="repeat">
            <option value="daily">Every day</option>
            <option value="weekdays">Weekdays</option>
            <option value="weekly">Once a week</option>
          </select>
        </label>
        <label>
          Routine
          <input
            defaultValue={template?.routineLabel ?? 'Morning routine'}
            maxLength={80}
            name="routineLabel"
            required
          />
        </label>
      </div>
      <fieldset className="routine-days">
        <legend>Days used for a weekly schedule</legend>
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
      <input name="activeFrom" type="hidden" value={template?.activeFrom ?? '2026-08-03'} />
    </div>
  );
}

function templateFields(
  data: FormData,
  existingDays?: ChoreTemplate['repeatDays'],
): ChoreTemplateInput {
  const repeat =
    data.get('repeat') === 'daily'
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
    assigneeId: String(data.get('assigneeId') ?? ''),
    routineLabel: String(data.get('routineLabel') ?? '').trim(),
    repeat,
    repeatDays:
      repeat === 'daily'
        ? [...everyDayValues]
        : repeat === 'weekdays'
          ? [...weekdayValues]
          : selectedDays.length > 0
            ? selectedDays
            : [existingDays?.[0] ?? 'MO'],
    pointsValue: Number(data.get('pointsValue') ?? 0),
    activeFrom: String(data.get('activeFrom') ?? '2026-08-03'),
  };
}

function repeatLabel(template: ChoreTemplate): string {
  if (template.repeat === 'daily') return 'Every day';
  if (template.repeat === 'weekdays') return 'Weekdays';
  return `Weekly · ${template.repeatDays.join(', ')}`;
}
