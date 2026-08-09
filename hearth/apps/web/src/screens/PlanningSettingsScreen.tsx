import { Link } from 'react-router-dom';

import { AdminPage } from '../components/AdminPage';
import { Icon, type IconName } from '../components/Icon';

const planningAreas: Array<{
  title: string;
  description: string;
  path: string;
  icon: IconName;
  focusId: string;
}> = [
  {
    title: 'Routines and chores',
    description: 'Repeat patterns and assignees',
    path: '/admin/routines',
    icon: 'chores',
    focusId: 'planning-routines',
  },
  {
    title: 'Meals',
    description: 'Plan dinners and keep family favourites',
    path: '/meals',
    icon: 'meal',
    focusId: 'planning-meals',
  },
  {
    title: 'Pocket money',
    description: 'Weekly amounts, progress, payday and payments',
    path: '/admin/pocket-money',
    icon: 'wallet',
    focusId: 'planning-pocket-money',
  },
  {
    title: 'Household lists',
    description: 'Groceries, packing and shared reminders',
    path: '/lists',
    icon: 'list',
    focusId: 'planning-lists',
  },
];

export function PlanningSettingsScreen() {
  return (
    <AdminPage title="Family planning" subtitle="The things that keep the week moving">
      <div className="planning-intro">
        <Icon name="leaf" />
        <div>
          <strong>Comfortable editing belongs on the phone</strong>
          <p>The television stays simple while adults can make detailed changes here.</p>
        </div>
      </div>
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
              <small>{area.description}</small>
            </div>
            <Icon name="chevron-right" />
          </Link>
        ))}
      </div>
    </AdminPage>
  );
}
