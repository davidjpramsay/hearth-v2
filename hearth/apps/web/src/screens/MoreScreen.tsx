import { Link } from 'react-router-dom';

import './MoreScreen.css';

import { Icon, type IconName } from '../components/Icon';

interface MoreLink {
  title: string;
  description: string;
  icon: IconName;
  path: string;
}

const groups: Array<{ title: string; links: MoreLink[] }> = [
  {
    title: 'Family',
    links: [
      { title: 'Lists', description: 'Groceries and shared lists', icon: 'list', path: '/lists' },
      { title: 'Meals', description: 'This week’s family meal plan', icon: 'meal', path: '/meals' },
      { title: 'Home', description: 'Approved household actions', icon: 'home', path: '/home' },
      {
        title: 'Photos',
        description: 'Family gallery and ambient mode',
        icon: 'image',
        path: '/photos',
      },
    ],
  },
  {
    title: 'This device',
    links: [
      {
        title: 'Appearance',
        description: 'Light, dark and evening comfort',
        icon: 'moon',
        path: '/appearance',
      },
    ],
  },
  {
    title: 'Set up Hearth',
    links: [
      {
        title: 'Household & people',
        description: 'Home details, family members and photos',
        icon: 'users',
        path: '/admin',
      },
      {
        title: 'Today & notices',
        description: 'Choose overview sections and publish notices',
        icon: 'today',
        path: '/admin/today',
      },
      {
        title: 'Connections',
        description: 'Calendar, Apple Reminders and Home Assistant',
        icon: 'link',
        path: '/admin/connections',
      },
      {
        title: 'Family planning',
        description: 'Routines, chores and pocket money',
        icon: 'wallet',
        path: '/admin/planning',
      },
      {
        title: 'Televisions',
        description: 'Pair, review or revoke a display',
        icon: 'television',
        path: '/admin/televisions',
      },
    ],
  },
  {
    title: 'System',
    links: [
      {
        title: 'System health',
        description: 'Backups, storage and version',
        icon: 'shield',
        path: '/admin/system',
      },
      {
        title: 'Recent activity',
        description: 'Private household change history',
        icon: 'list',
        path: '/admin/activity',
      },
    ],
  },
];

const flattened = groups.flatMap((group) => group.links);

export function MoreScreen() {
  return (
    <div className="screen more-screen">
      <header className="more-screen__header">
        <p>Hearth companion</p>
        <h1>More</h1>
        <span>Family tools and private setup</span>
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
                  className="more-card focusable"
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
                  <span>
                    <strong>{link.title}</strong>
                    <small>{link.description}</small>
                  </span>
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
