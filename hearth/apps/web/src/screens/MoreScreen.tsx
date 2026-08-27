import { Link } from 'react-router-dom';

import './MoreScreen.css';

import { Icon, type IconName } from '../components/Icon';

interface MoreLink {
  title: string;
  icon: IconName;
  path: string;
  emphasis?: boolean;
}

const baseGroups: Array<{ title: string; links: MoreLink[] }> = [
  {
    title: 'Family',
    links: [
      { title: 'Reminders', icon: 'bell', path: '/reminders' },
      { title: 'Lists', icon: 'list', path: '/lists' },
      { title: 'Meals', icon: 'meal', path: '/meals' },
      { title: 'Home controls', icon: 'home', path: '/home' },
      {
        title: 'Photos',
        icon: 'image',
        path: '/photos',
      },
    ],
  },
  {
    title: 'Manage Hearth',
    links: [
      {
        title: 'Manage photos',
        icon: 'image',
        path: '/admin/photos',
        emphasis: true,
      },
      {
        title: 'Household details',
        icon: 'home',
        path: '/admin/household',
      },
      {
        title: 'People',
        icon: 'users',
        path: '/admin/people',
      },
      {
        title: 'Adult access',
        icon: 'shield',
        path: '/admin/access',
      },
      {
        title: 'Today screen & notices',
        icon: 'today',
        path: '/admin/today',
      },
      {
        title: 'Chores, routines & pocket money',
        icon: 'wallet',
        path: '/admin/planning',
      },
      {
        title: 'Connections',
        icon: 'link',
        path: '/admin/connections',
      },
      {
        title: 'Televisions',
        icon: 'television',
        path: '/admin/televisions',
      },
    ],
  },
  {
    title: 'This device',
    links: [
      {
        title: 'Appearance',
        icon: 'moon',
        path: '/appearance',
      },
    ],
  },
  {
    title: 'System',
    links: [
      {
        title: 'System health',
        icon: 'shield',
        path: '/admin/system',
      },
      {
        title: 'Recent activity',
        icon: 'list',
        path: '/admin/activity',
      },
    ],
  },
];

export function MoreScreen() {
  const groups = baseGroups;
  const flattened = groups.flatMap((group) => group.links);
  return (
    <div className="screen more-screen">
      <header className="more-screen__header">
        <h1>More</h1>
      </header>
      {groups.map((group) => (
        <section className="more-group" key={group.title}>
          <h2>{group.title}</h2>
          <div className="more-grid">
            {group.links.map((link) => {
              const index = flattened.findIndex((candidate) => candidate.path === link.path);
              const prior = flattened[index - 1];
              const next = flattened[index + 1];
              const focusId = moreFocusId(link);
              return (
                <Link
                  className={`more-card focusable${link.emphasis === true ? ' more-card--emphasis' : ''}`}
                  data-focus-entry={index === 0 ? 'true' : undefined}
                  data-focus-id={focusId}
                  data-focus-left="phone-tab-more"
                  data-focus-up={prior === undefined ? 'phone-tab-more' : moreFocusId(prior)}
                  data-focus-down={next === undefined ? focusId : moreFocusId(next)}
                  to={link.path}
                  key={link.title}
                >
                  <span className="more-card__icon">
                    <Icon name={link.icon} />
                  </span>
                  <strong>{link.title}</strong>
                  <Icon name="chevron-right" />
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function moreFocusId(link: MoreLink): string {
  return `more-${link.path.replaceAll('/', '-').replace(/^-/, '')}`;
}
