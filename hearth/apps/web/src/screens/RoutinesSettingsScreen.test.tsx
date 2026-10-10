import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ChoreTemplate,
  ChoreTemplateCommandResult,
  Member,
  RuntimeContext,
} from '@hearth/shared';

import { choresApi, type ChoreTemplateInput } from '../api/chores';
import { configureHearthClient } from '../api/core';
import { useAdminQuery } from '../hooks/useAdminQueries';
import { useChoreTemplatesQuery } from '../hooks/useChoreQueries';
import { RuntimeContextValue } from '../runtime/context';
import { RoutinesSettingsScreen } from './RoutinesSettingsScreen';

vi.mock('../hooks/useAdminQueries', () => ({ useAdminQuery: vi.fn() }));
vi.mock('../hooks/useChoreQueries', () => ({ useChoreTemplatesQuery: vi.fn() }));

const members: Member[] = [
  member('maya', 'Maya', 'adult'),
  member('ezra', 'Ezra', 'child'),
  member('alex', 'Alex', 'child'),
];
const template: ChoreTemplate = {
  id: 'template_school_bag',
  title: 'Pack school bag',
  description: 'Water bottle and lunchbox',
  assignees: [members[1]!],
  routineLabel: 'Morning',
  availableFromTime: '07:00',
  dueTime: '07:30',
  sortOrder: 0,
  repeat: 'weekdays',
  repeatDays: ['MO', 'TU', 'WE', 'TH', 'FR'],
  activeFrom: '2026-10-09',
  activeUntil: null,
  archived: false,
};
const runtime: RuntimeContext = {
  mode: 'demo',
  generatedAt: '2026-10-09T10:00:00.000Z',
  household: {
    id: 'household_hearth_demo',
    name: 'Test household',
    timezone: 'Australia/Perth',
    locale: 'en-AU',
  },
  timezone: 'Australia/Perth',
  locale: 'en-AU',
  localDate: '2026-10-09',
  weekStart: '2026-10-05',
  currentMonth: '2026-10',
  requiresSetup: false,
};

beforeEach(() => {
  vi.mocked(useAdminQuery).mockReturnValue({
    data: { household: { members } },
    isPending: false,
  } as ReturnType<typeof useAdminQuery>);
  vi.mocked(useChoreTemplatesQuery).mockReturnValue({
    data: { templates: [template] },
    isPending: false,
  } as ReturnType<typeof useChoreTemplatesQuery>);
  vi.spyOn(choresApi, 'createChoreTemplate').mockImplementation(async (fields) => result(fields));
  vi.spyOn(choresApi, 'updateChoreTemplate').mockImplementation(async (_id, fields) =>
    result(fields),
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('RoutinesSettingsScreen People picker', () => {
  it('starts a new chore with nobody selected and focus does not select a person', async () => {
    const user = userEvent.setup();
    const { container } = renderScreen();
    await user.click(screen.getByRole('button', { name: 'New chore' }));
    const form = within(container.querySelector('.routine-add-form')!);
    for (const checkbox of form.getAllByRole('checkbox')) expect(checkbox).not.toBeChecked();
    form.getByRole('checkbox', { name: /Ezra/ }).focus();
    expect(form.getByRole('checkbox', { name: /Ezra/ })).not.toBeChecked();
    expect(choresApi.createChoreTemplate).not.toHaveBeenCalled();
  });

  it('allows every checkbox, including the last one, to be unticked', async () => {
    const user = userEvent.setup();
    const { container } = renderScreen();
    await user.click(screen.getByRole('button', { name: 'New chore' }));
    const form = within(container.querySelector('.routine-add-form')!);
    const ezra = form.getByRole('checkbox', { name: /Ezra/ });
    const alex = form.getByRole('checkbox', { name: /Alex/ });
    await user.click(ezra);
    await user.click(alex);
    expect(ezra).toBeChecked();
    expect(alex).toBeChecked();
    await user.click(ezra);
    await user.click(alex);
    expect(ezra).not.toBeChecked();
    expect(alex).not.toBeChecked();
    expect(choresApi.createChoreTemplate).not.toHaveBeenCalled();
  });

  it('blocks an empty new-chore save, focuses People and clears the error when corrected', async () => {
    const user = userEvent.setup();
    const { container } = renderScreen();
    await user.click(screen.getByRole('button', { name: 'New chore' }));
    const form = within(container.querySelector('.routine-add-form')!);
    await user.type(form.getByLabelText('Chore', { exact: true }), 'Bring bins in');
    await user.click(form.getByRole('button', { name: 'Add chore' }));
    expect(form.getByRole('alert')).toHaveTextContent('Choose at least one person.');
    expect(form.getAllByRole('checkbox')[0]).toHaveFocus();
    expect(form.getAllByRole('checkbox')[0]).toHaveAttribute('aria-invalid', 'true');
    expect(form.getAllByRole('checkbox')[0]).toHaveAccessibleDescription(
      /Choose at least one person/,
    );
    expect(form.getByLabelText('Chore', { exact: true })).toHaveValue('Bring bins in');
    expect(choresApi.createChoreTemplate).not.toHaveBeenCalled();
    await user.click(form.getByRole('checkbox', { name: /Alex/ }));
    expect(form.queryByRole('alert')).not.toBeInTheDocument();
    expect(form.getByRole('checkbox', { name: /Alex/ })).not.toHaveAttribute('aria-invalid');
    await user.click(form.getByRole('button', { name: 'Add chore' }));
    await waitFor(() => expect(choresApi.createChoreTemplate).toHaveBeenCalledOnce());
    expect(vi.mocked(choresApi.createChoreTemplate).mock.calls[0]?.[0]).toMatchObject({
      title: 'Bring bins in',
      assigneeIds: ['member_alex'],
    });
  });

  it('submits only the explicit selection after another child is removed', async () => {
    const user = userEvent.setup();
    const { container } = renderScreen();
    await user.click(screen.getByRole('button', { name: 'New chore' }));
    const form = within(container.querySelector('.routine-add-form')!);
    await user.type(form.getByLabelText('Chore', { exact: true }), 'Put sports gear away');
    await user.click(form.getByRole('checkbox', { name: /Ezra/ }));
    await user.click(form.getByRole('checkbox', { name: /Alex/ }));
    await user.click(form.getByRole('checkbox', { name: /Ezra/ }));
    await user.click(form.getByRole('button', { name: 'Add chore' }));
    await waitFor(() => expect(choresApi.createChoreTemplate).toHaveBeenCalledOnce());
    expect(vi.mocked(choresApi.createChoreTemplate).mock.calls[0]?.[0]).toMatchObject({
      assigneeIds: ['member_alex'],
    });
  });

  it('cancel and reopening creation clears the unsaved selection and validation error', async () => {
    const user = userEvent.setup();
    const { container } = renderScreen();
    await user.click(screen.getByRole('button', { name: 'New chore' }));
    const form = within(container.querySelector('.routine-add-form')!);
    await user.type(form.getByLabelText('Chore', { exact: true }), 'Unsaved chore');
    await user.click(form.getByRole('button', { name: 'Add chore' }));
    expect(form.getByRole('alert')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'New chore' }));
    const reopened = within(container.querySelector('.routine-add-form')!);
    expect(reopened.queryByRole('alert')).not.toBeInTheDocument();
    for (const checkbox of reopened.getAllByRole('checkbox')) expect(checkbox).not.toBeChecked();
    expect(reopened.getByLabelText('Chore', { exact: true })).toHaveValue('');
    await user.click(reopened.getByRole('checkbox', { name: /Ezra/ }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'New chore' }));
    const fresh = within(container.querySelector('.routine-add-form')!);
    for (const checkbox of fresh.getAllByRole('checkbox')) expect(checkbox).not.toBeChecked();
    expect(choresApi.createChoreTemplate).not.toHaveBeenCalled();
  });

  it('loads existing assignees, blocks clearing them on save and preserves the draft', async () => {
    const user = userEvent.setup();
    const { container } = renderScreen();
    await user.click(screen.getByText('Pack school bag', { selector: 'strong' }));
    const form = within(container.querySelector('.routine-editor form')!);
    expect(form.getByRole('checkbox', { name: /Ezra/ })).toBeChecked();
    expect(form.getByRole('checkbox', { name: /Maya/ })).not.toBeChecked();
    expect(form.getByRole('checkbox', { name: /Alex/ })).not.toBeChecked();
    await user.click(form.getByRole('checkbox', { name: /Ezra/ }));
    expect(form.getByRole('checkbox', { name: /Ezra/ })).not.toBeChecked();
    await user.click(form.getByRole('button', { name: 'Save future schedule' }));
    expect(form.getByRole('alert')).toHaveTextContent('Choose at least one person.');
    expect(form.getByLabelText('Helpful note')).toHaveValue(template.description);
    expect(form.getByLabelText('Available from')).toHaveValue('07:00');
    expect(form.getByLabelText('Due by')).toHaveValue('07:30');
    expect(choresApi.updateChoreTemplate).not.toHaveBeenCalled();
    await user.click(form.getByRole('checkbox', { name: /Alex/ }));
    expect(form.queryByRole('alert')).not.toBeInTheDocument();
    await user.click(form.getByRole('button', { name: 'Save future schedule' }));
    await waitFor(() => expect(choresApi.updateChoreTemplate).toHaveBeenCalledOnce());
    expect(choresApi.updateChoreTemplate).toHaveBeenCalledWith(
      template.id,
      expect.objectContaining({
        assigneeIds: ['member_alex'],
        description: template.description,
        availableFromTime: '07:00',
        dueTime: '07:30',
      }),
    );
    expect(template.assignees.map((person) => person.id)).toEqual(['member_ezra']);
  });

  it('starts an adult-only household with no automatic fallback selection', async () => {
    vi.mocked(useAdminQuery).mockReturnValue({
      data: { household: { members: [members[0]] } },
      isPending: false,
    } as ReturnType<typeof useAdminQuery>);
    const user = userEvent.setup();
    const { container } = renderScreen();
    await user.click(screen.getByRole('button', { name: 'New chore' }));
    const form = within(container.querySelector('.routine-add-form')!);
    expect(form.getByRole('checkbox', { name: /Maya/ })).not.toBeChecked();
  });
});

function member(id: string, displayName: string, role: Member['role']): Member {
  return {
    id: `member_${id}`,
    displayName,
    role,
    color: '#1668b7',
    avatarUrl: '',
    capabilities: ['household.view', 'chores.complete'],
  };
}

function result(fields: ChoreTemplateInput): ChoreTemplateCommandResult {
  return {
    template: {
      ...template,
      ...fields,
      assignees: members.filter((person) => fields.assigneeIds.includes(person.id)),
    },
    replayed: false,
    audit: {
      id: 'audit_test_chore',
      actorType: 'member',
      actorId: 'member_maya',
      source: 'companion',
      action: 'chore-template.create',
      targetId: template.id,
      occurredAt: runtime.generatedAt,
      result: 'succeeded',
    },
  };
}

function renderScreen() {
  configureHearthClient(runtime);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <MemoryRouter initialEntries={['/admin/routines']}>
      <QueryClientProvider client={queryClient}>
        <RuntimeContextValue.Provider value={runtime}>
          <RoutinesSettingsScreen />
        </RuntimeContextValue.Provider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}
