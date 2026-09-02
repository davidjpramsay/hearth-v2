import { Link } from 'react-router-dom';

import { AdminPage } from '../components/AdminPage';
import { Icon, type IconName } from '../components/Icon';

const planningAreas: Array<{
  title: string;
  path: string;
  icon: IconName;
  focusId: string;
}> = [
  {
    title: 'Routines and chores',
    path: '/admin/routines',
    icon: 'chores',
    focusId: 'planning-routines',
  },
  {
    title: 'Chores this week',
    path: '/admin/chore-day',
    icon: 'chores',
    focusId: 'planning-chore-day',
  },
  {
    title: 'Meals',
    path: '/admin/meals',
    icon: 'meal',
    focusId: 'planning-meals',
  },
  {
    title: 'Pocket money',
    path: '/admin/pocket-money',
    icon: 'wallet',
    focusId: 'planning-pocket-money',
  },
  {
    title: 'Household lists',
    path: '/admin/lists',
    icon: 'list',
    focusId: 'planning-lists',
  },
];

export function PlanningSettingsScreen() {
  return (
    <AdminPage title="Family planning">
      <div className="planning-area-list">
        {planningAreas.map((area, index) => (
          <Link
            className="planning-area-card"
            data-focus-entry={index === 0 ? 'true' : undefined}
            data-focus-id={area.focusId}
            key={area.title}
            to={area.path}
          >
            <span>
              <Icon name={area.icon} />
            </span>
            <div>
              <strong>{area.title}</strong>
            </div>
            <Icon name="chevron-right" />
          </Link>
        ))}
      </div>
    </AdminPage>
  );
}
