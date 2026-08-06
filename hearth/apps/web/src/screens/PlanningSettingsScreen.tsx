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
    description: 'Repeat patterns, assignees and star values',
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
    title: 'Rewards',
    description: 'Star balances, choices and corrections',
    path: '/admin/rewards',
    icon: 'star',
    focusId: 'planning-rewards',
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
        {planningAreas.map((area) => (
          <Link
            className="planning-area-card"
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
