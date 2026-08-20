import type { AdminOverview, AuditSummary } from '@hearth/shared';

import type { IconName } from '../components/Icon';

export type ActivityFilter = 'all' | 'family' | 'planning' | 'connections' | 'system';

export interface ActivityPresentation {
  title: string;
  filter: Exclude<ActivityFilter, 'all'>;
  icon: IconName;
}

export const activityFilters: Array<{ id: ActivityFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'family', label: 'Family' },
  { id: 'planning', label: 'Planning' },
  { id: 'connections', label: 'Connections' },
  { id: 'system', label: 'System' },
];

const actionPresentations: Record<AuditSummary['action'], ActivityPresentation> = {
  'chore.complete': planning('Chore marked done', 'chores'),
  'chore.undo': planning('Chore completion undone', 'chores'),
  'chore.skip': planning('Chore skipped', 'chores'),
  'chore.excuse': planning('Chore excused', 'chores'),
  'chore.reassign': planning('Chore reassigned', 'chores'),
  'household.update': family('Household details updated', 'home'),
  'member.create': family('Person added', 'users'),
  'member.update': family('Person updated', 'users'),
  'member.avatar.update': family('Profile photo updated', 'users'),
  'member.avatar.reset': family('Profile photo reset', 'users'),
  'member.archive': family('Person archived', 'users'),
  'device.pair': family('Television paired', 'television'),
  'device.revoke': family('Television access revoked', 'television'),
  'chore-template.create': planning('Chore routine created', 'chores'),
  'chore-template.update': planning('Chore routine updated', 'chores'),
  'chore-template.archive': planning('Chore routine archived', 'chores'),
  'chore-template.restore': planning('Chore routine restored', 'chores'),
  'chore-template.reorder': planning('Chore order changed', 'chores'),
  'list.create': planning('List created', 'list'),
  'list.update': planning('List updated', 'list'),
  'list.archive': planning('List archived', 'list'),
  'list.restore': planning('List restored', 'list'),
  'list.reorder': planning('Lists reordered', 'list'),
  'list.item.add': planning('List item added', 'list'),
  'list.item.update': planning('List item updated', 'list'),
  'list.item.archive': planning('List item removed', 'list'),
  'list.item.reorder': planning('List items reordered', 'list'),
  'list.item.clear-checked': planning('Checked items cleared', 'list'),
  'list.item.complete': planning('List item checked', 'list'),
  'list.item.undo': planning('List item restored', 'list'),
  'meal.plan': planning('Dinner plan updated', 'meal'),
  'meal.week.update': planning('Meal week updated', 'meal'),
  'meal.week.clear': planning('Meal week cleared', 'meal'),
  'meal.week.copy': planning('Meal week copied', 'meal'),
  'saved-meal.create': planning('Family meal saved', 'meal'),
  'saved-meal.update': planning('Saved meal updated', 'meal'),
  'saved-meal.archive': planning('Saved meal archived', 'meal'),
  'saved-meal.restore': planning('Saved meal restored', 'meal'),
  'pocket-money.settings.update': planning('Pocket money updated', 'wallet'),
  'pocket-money.payment.record': planning('Pocket money payment recorded', 'wallet'),
  'pocket-money.payment.void': planning('Pocket money payment corrected', 'wallet'),
  'calendar.connection.save': connections('Calendar connected', 'calendar'),
  'calendar.mappings.update': connections('Calendar assignments updated', 'calendar'),
  'calendar.connection.remove': connections('Calendar disconnected', 'calendar'),
  'weather.location.update': connections('Weather location updated', 'cloud-sun'),
  'home-assistant.connection.save': connections('Home Assistant connected', 'home'),
  'home-assistant.connection.remove': connections('Home Assistant disconnected', 'home'),
  'system.backup.create': system('Recovery copy created', 'refresh'),
  'photo.upload': connections('Family photo added', 'image'),
  'photo.source.refresh': connections('Family photos refreshed', 'image'),
  'photo.favourite': family('Family photo favourited', 'star'),
  'photo.unfavourite': family('Family photo removed from favourites', 'star'),
  'photo.hide': family('Family photo hidden', 'image'),
  'photo.unhide': family('Family photo restored', 'image'),
  'auth.passkey.register': system('Adult passkey registered', 'shield'),
  'auth.passkey.revoke': system('Adult passkey removed', 'shield'),
  'auth.recovery-code.rotate': system('Recovery code renewed', 'shield'),
  'auth.account.recover': system('Adult access recovered', 'shield'),
  'home.action.execute': connections('Household action run', 'home'),
  'notice.create': family('Notice published', 'today'),
  'notice.update': family('Notice updated', 'today'),
  'notice.archive': family('Notice removed', 'today'),
  'today.sections.update': family('Today layout updated', 'today'),
};

export function presentationForActivity(action: AuditSummary['action']): ActivityPresentation {
  return actionPresentations[action];
}

export function actorLabel(entry: AuditSummary, admin: AdminOverview): string {
  if (entry.actorType === 'member') {
    return (
      admin.household.members.find((member) => member.id === entry.actorId)?.displayName ??
      'Household adult'
    );
  }
  if (entry.actorType === 'device') {
    return admin.pairedDevices.find((device) => device.id === entry.actorId)?.name ?? 'Television';
  }
  if (entry.actorType === 'service') {
    return entry.source === 'sync' ? 'Connected service' : 'Home Assistant';
  }
  return 'Hearth';
}

export function sourceLabel(source: AuditSummary['source']): string {
  const labels: Record<AuditSummary['source'], string> = {
    tv: 'Television',
    companion: 'Phone',
    voice: 'Voice',
    automation: 'Automation',
    sync: 'Sync',
    system: 'System',
  };
  return labels[source];
}

export function resultLabel(result: AuditSummary['result']): string {
  const labels: Record<AuditSummary['result'], string> = {
    succeeded: 'Saved',
    reversed: 'Reversed',
    rejected: 'Not allowed',
    failed: 'Failed',
  };
  return labels[result];
}

function family(title: string, icon: IconName): ActivityPresentation {
  return { title, filter: 'family', icon };
}

function planning(title: string, icon: IconName): ActivityPresentation {
  return { title, filter: 'planning', icon };
}

function connections(title: string, icon: IconName): ActivityPresentation {
  return { title, filter: 'connections', icon };
}

function system(title: string, icon: IconName): ActivityPresentation {
  return { title, filter: 'system', icon };
}
