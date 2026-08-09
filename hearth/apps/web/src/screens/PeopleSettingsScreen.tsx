import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Camera, RotateCcw } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import { createRequestId, hearthApi, queryKeys, type HearthMember } from '../api/client';
import { AdminError, AdminLoading, AdminPage } from '../components/AdminPage';
import { Avatar } from '../components/Avatar';
import { MemberAvatarDialog } from '../components/MemberAvatarDialog';
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
  const [selectedPhoto, setSelectedPhoto] = useState<{
    member: HearthMember;
    file: File;
  } | null>(null);
  const [photoInputError, setPhotoInputError] = useState<string | null>(null);
  const refresh = async () => queryClient.invalidateQueries({ queryKey: queryKeys.admin });
  const refreshHousehold = async () =>
    queryClient.invalidateQueries({ queryKey: [queryKeys.today[0]] });
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
  const updateAvatar = useMutation({
    mutationFn: ({ memberId, dataBase64 }: { memberId: string; dataBase64: string }) =>
      hearthApi.updateMemberAvatar(memberId, createRequestId('member_avatar_update'), dataBase64),
    onSuccess: refreshHousehold,
  });
  const resetAvatar = useMutation({
    mutationFn: (memberId: string) =>
      hearthApi.resetMemberAvatar(memberId, createRequestId('member_avatar_reset')),
    onSuccess: refreshHousehold,
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
    <AdminPage title="People" subtitle="Photos, names, roles and home permissions">
      <div className="member-editor-list">
        {admin.data.household.members.map((member) => (
          <MemberEditor
            actorId={admin.data.actor.id}
            archivePending={archive.isPending}
            member={member}
            avatarPending={updateAvatar.isPending || resetAvatar.isPending}
            onArchive={() => archive.mutate(member.id)}
            onChoosePhoto={(file) => {
              setPhotoInputError(null);
              updateAvatar.reset();
              if (file.size > 20_000_000) {
                setPhotoInputError('That original photo is too large. Choose one under 20 MB.');
                return;
              }
              setSelectedPhoto({ member, file });
            }}
            onResetPhoto={() => resetAvatar.mutate(member.id)}
            onSave={(fields) => update.mutate({ memberId: member.id, fields })}
            savePending={update.isPending}
            key={member.id}
          />
        ))}
      </div>
      {create.isError || update.isError || archive.isError || resetAvatar.isError ? (
        <AdminError
          message={
            (create.error ?? update.error ?? archive.error ?? resetAvatar.error)?.message ??
            'That change could not be saved.'
          }
        />
      ) : null}
      {photoInputError !== null ? <AdminError message={photoInputError} /> : null}
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
      {selectedPhoto === null ? null : (
        <MemberAvatarDialog
          file={selectedPhoto.file}
          memberName={selectedPhoto.member.displayName}
          onCancel={() => {
            if (!updateAvatar.isPending) setSelectedPhoto(null);
          }}
          onSave={async (dataBase64) => {
            await updateAvatar.mutateAsync({
              memberId: selectedPhoto.member.id,
              dataBase64,
            });
            setSelectedPhoto(null);
          }}
          saving={updateAvatar.isPending}
          serverError={updateAvatar.error?.message ?? null}
        />
      )}
    </AdminPage>
  );
}

function MemberEditor({
  member,
  actorId,
  onSave,
  onArchive,
  onChoosePhoto,
  onResetPhoto,
  savePending,
  archivePending,
  avatarPending,
}: {
  member: HearthMember;
  actorId: string;
  onSave: (fields: MemberFields) => void;
  onArchive: () => void;
  onChoosePhoto: (file: File) => void;
  onResetPhoto: () => void;
  savePending: boolean;
  archivePending: boolean;
  avatarPending: boolean;
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
        <div className="member-editor__photo-actions">
          <label className="admin-secondary member-photo-picker">
            <Camera aria-hidden="true" />
            {hasCustomAvatar(member) ? 'Replace photo' : 'Change photo'}
            <input
              accept="image/*"
              aria-label={`Choose profile photo for ${member.displayName}`}
              disabled={avatarPending}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file !== undefined) onChoosePhoto(file);
                event.currentTarget.value = '';
              }}
              type="file"
            />
          </label>
          {hasCustomAvatar(member) ? (
            <button
              className="admin-secondary member-photo-reset"
              disabled={avatarPending}
              onClick={onResetPhoto}
              type="button"
            >
              <RotateCcw aria-hidden="true" /> Restore original
            </button>
          ) : null}
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

function hasCustomAvatar(member: HearthMember): boolean {
  return member.avatarUrl.includes(`/members/${member.id}/avatar?v=`);
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
