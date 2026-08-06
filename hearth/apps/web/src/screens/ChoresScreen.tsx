import type { CSSProperties } from 'react';

import type { ChoreGroup, ChoreOccurrence, DemoScenario } from '@hearth/shared';

import { Avatar } from '../components/Avatar';
import { ChoreRow } from '../components/ChoreRow';
import { ScreenHeader } from '../components/ScreenHeader';
import { EmptyState, FailureState, LoadingState } from '../components/Status';
import { useChoreMutation } from '../hooks/useChoreMutation';
import { useChoresQuery } from '../hooks/useHearthQueries';

export function ChoresScreen({
  scenario: _scenario,
  preparing,
}: {
  scenario: DemoScenario | 'offline';
  preparing: boolean;
}) {
  const query = useChoresQuery(!preparing);
  const mutation = useChoreMutation();
  if (preparing || query.isPending) return <LoadingState />;
  if (query.data === undefined) return <FailureState onRetry={() => void query.refetch()} />;
  const chores = query.data;
  if (chores.totalCount === 0) return <EmptyState onBootstrap={() => void query.refetch()} />;
  const groups = chores.groups.filter((group) => group.occurrences.length > 0);
  const longestGroup = Math.max(0, ...groups.map((group) => group.occurrences.length));
  const gridStyle = {
    '--chore-column-count': groups.length,
  } as CSSProperties;
  return (
    <div className="screen chores-screen">
      <ScreenHeader
        eyebrow={chores.displayDate}
        title="Chores"
        meta={`${chores.completedCount} of ${chores.totalCount} complete`}
      />
      <div
        className="progress-track"
        aria-label={`${chores.completedCount} of ${chores.totalCount} chores complete`}
        role="progressbar"
        aria-valuemax={chores.totalCount}
        aria-valuemin={0}
        aria-valuenow={chores.completedCount}
      >
        <span style={{ width: `${(chores.completedCount / chores.totalCount) * 100}%` }} />
      </div>
      <div
        className="chore-groups"
        data-column-count={groups.length}
        data-density={longestGroup > 4 ? 'compact' : 'comfortable'}
        style={gridStyle}
      >
        {groups.map((group, groupIndex) => (
          <ChoreColumn
            allGroups={groups}
            group={group}
            groupIndex={groupIndex}
            key={group.member.id}
            mutation={mutation}
          />
        ))}
      </div>
    </div>
  );
}

function ChoreColumn({
  allGroups,
  group,
  groupIndex,
  mutation,
}: {
  allGroups: ChoreGroup[];
  group: ChoreGroup;
  groupIndex: number;
  mutation: ReturnType<typeof useChoreMutation>;
}) {
  const completedCount = group.occurrences.filter((item) => item.state === 'completed').length;
  return (
    <section className="chore-group">
      <header>
        <Avatar member={group.member} />
        <div>
          <h2>{group.member.displayName}</h2>
          <p>
            {completedCount} of {group.occurrences.length} done
          </p>
        </div>
      </header>
      <div className="chore-list">
        {group.occurrences.map((occurrence, rowIndex) => (
          <ChoreRow
            focus={focusLinks(allGroups, groupIndex, rowIndex, occurrence)}
            key={occurrence.id}
            mutation={mutation}
            occurrence={occurrence}
            showAssignee={false}
          />
        ))}
      </div>
    </section>
  );
}

function focusLinks(
  groups: ChoreGroup[],
  groupIndex: number,
  rowIndex: number,
  occurrence: ChoreOccurrence,
) {
  const group = groups[groupIndex];
  const previousGroup = groups[groupIndex - 1];
  const nextGroup = groups[groupIndex + 1];
  const ownId = focusId(groups, groupIndex, rowIndex);
  const upId = focusId(groups, groupIndex, Math.max(0, rowIndex - 1));
  const downId = focusId(
    groups,
    groupIndex,
    Math.min(rowIndex + 1, (group?.occurrences.length ?? 1) - 1),
  );
  const leftId =
    previousGroup === undefined
      ? 'nav-chores'
      : focusId(groups, groupIndex - 1, Math.min(rowIndex, previousGroup.occurrences.length - 1));
  const rightId =
    nextGroup === undefined
      ? ownId
      : focusId(groups, groupIndex + 1, Math.min(rowIndex, nextGroup.occurrences.length - 1));
  return {
    'data-focus-id': occurrence === groups[0]?.occurrences[0] ? 'chore-primary' : ownId,
    'data-focus-up': upId,
    'data-focus-down': downId,
    'data-focus-left': leftId,
    'data-focus-right': rightId,
  };
}

function focusId(groups: ChoreGroup[], groupIndex: number, rowIndex: number): string {
  const occurrence = groups[groupIndex]?.occurrences[rowIndex];
  if (occurrence === groups[0]?.occurrences[0]) return 'chore-primary';
  return occurrence === undefined ? 'nav-chores' : `chore-${occurrence.id}`;
}
