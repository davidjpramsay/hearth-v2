import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { FormEvent } from 'react';

import { createRequestId, hearthApi, queryKeys, type HearthMember } from '../api/client';
import { AdminError, AdminLoading, AdminPage } from '../components/AdminPage';
import { Avatar } from '../components/Avatar';
import { MemberColourPicker } from '../components/MemberColourPicker';
import { DEFAULT_MEMBER_COLOUR } from '../components/memberColours';
import { useAdminQuery } from '../hooks/useHearthQueries';

interface MemberFields {
  displayName: string;
  role: 'adult' | 'child';
  color: string;
  administrator: boolean;
}

export function PeopleSettingsScreen() {
  const admin = useAdminQuery();
  const queryClient = useQueryClient();
  const refresh = async () => queryClient.invalidateQueries({ queryKey: queryKeys.admin });
  const create = useMutation({ mutationFn: hearthApi.createMember, onSuccess: refresh });
  const update = useMutation({
    mutationFn: ({ memberId, fields }: { memberId: string; fields: MemberFields }) =>
      hearthApi.updateMember(memberId, { requestId: createRequestId('member_update'), ...fields }),
    onSuccess: refresh,
  });
  const archive = useMutation({
    mutationFn: (memberId: string) =>
      hearthApi.archiveMember(memberId, createRequestId('member_archive')),
    onSuccess: refresh,
  });
  if (admin.isPending) return <AdminLoading />;
  if (admin.isError) return <AdminError message={admin.error.message} />;

  function addMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = memberFields(new FormData(event.currentTarget));
    create.mutate({ requestId: createRequestId('member_create'), ...fields });
    if (!create.isError) event.currentTarget.reset();
  }

  return (
    <AdminPage title="People" subtitle="Names, roles and home permissions">
      <div className="member-editor-list">
        {admin.data.household.members.map((member) => (
          <MemberEditor
            actorId={admin.data.actor.id}
            archivePending={archive.isPending}
            member={member}
            onArchive={() => archive.mutate(member.id)}
            onSave={(fields) => update.mutate({ memberId: member.id, fields })}
            savePending={update.isPending}
            key={member.id}
          />
        ))}
      </div>
      {create.isError || update.isError || archive.isError ? (
        <AdminError
          message={
            (create.error ?? update.error ?? archive.error)?.message ??
            'That change could not be saved.'
          }
        />
      ) : null}
      <form className="admin-form admin-form--add-member" onSubmit={addMember}>
        <h2>Add someone</h2>
        <label>
          Display name
          <input maxLength={80} name="displayName" placeholder="e.g. Alex" required />
        </label>
        <label>
          Role
          <select defaultValue="child" name="role">
            <option value="child">Child</option>
            <option value="adult">Adult</option>
          </select>
        </label>
        <MemberColourPicker defaultValue={DEFAULT_MEMBER_COLOUR} />
        <label className="checkbox-field">
          <input name="administrator" type="checkbox" />
          Can change household setup
        </label>
        <button className="admin-submit" disabled={create.isPending} type="submit">
          {create.isPending ? 'Adding…' : 'Add person'}
        </button>
      </form>
    </AdminPage>
  );
}

function MemberEditor({
  member,
  actorId,
  onSave,
  onArchive,
  savePending,
  archivePending,
}: {
  member: HearthMember;
  actorId: string;
  onSave: (fields: MemberFields) => void;
  onArchive: () => void;
  savePending: boolean;
  archivePending: boolean;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave(
      memberFields(
        new FormData(event.currentTarget),
        member.id === actorId && member.capabilities.includes('household.admin'),
      ),
    );
  }
  return (
    <form className="member-editor" onSubmit={submit}>
      <div className="member-editor__heading">
        <Avatar member={member} />
        <div>
          <strong>{member.displayName}</strong>
          <span>{member.role === 'adult' ? 'Adult' : 'Child'}</span>
        </div>
      </div>
      <label>
        Display name
        <input defaultValue={member.displayName} name="displayName" required />
      </label>
      <label>
        Role
        {member.id === actorId ? <input name="role" type="hidden" value="adult" /> : null}
        <select
          defaultValue={member.role}
          disabled={member.id === actorId}
          name={member.id === actorId ? undefined : 'role'}
        >
          <option value="child">Child</option>
          <option value="adult">Adult</option>
        </select>
      </label>
      <MemberColourPicker defaultValue={member.color} />
      <label className="checkbox-field">
        {member.id === actorId ? <input name="administrator" type="hidden" value="on" /> : null}
        <input
          defaultChecked={member.capabilities.includes('household.admin')}
          disabled={member.id === actorId}
          name={member.id === actorId ? undefined : 'administrator'}
          type="checkbox"
        />
        Household administrator
      </label>
      <div className="member-editor__actions">
        <button className="admin-secondary" disabled={savePending} type="submit">
          Save
        </button>
        {member.id === actorId ? null : (
          <button
            className="admin-danger"
            disabled={archivePending}
            onClick={onArchive}
            type="button"
          >
            Remove
          </button>
        )}
      </div>
    </form>
  );
}

function memberFields(data: FormData, forceAdministrator = false): MemberFields {
  const role = data.get('role') === 'adult' ? 'adult' : 'child';
  return {
    displayName: String(data.get('displayName') ?? ''),
    role,
    color: String(data.get('color') ?? DEFAULT_MEMBER_COLOUR),
    administrator: role === 'adult' && (forceAdministrator || data.get('administrator') === 'on'),
  };
}
