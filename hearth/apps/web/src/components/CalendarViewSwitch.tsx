import { Link, NavLink } from 'react-router-dom';

import { Icon } from './Icon';

export function CalendarViewSwitch() {
  return (
    <div className="calendar-toolbar">
      <nav aria-label="Calendar view" className="calendar-view-switch">
        <NavLink
          className={({ isActive }) => (isActive ? 'calendar-view-switch__active' : undefined)}
          data-focus-id="calendar-view-week"
          data-focus-left="nav-calendar"
          data-focus-right="calendar-view-month"
          data-focus-down="screen-entry"
          to="/calendar/week"
        >
          Week
        </NavLink>
        <NavLink
          className={({ isActive }) => (isActive ? 'calendar-view-switch__active' : undefined)}
          data-focus-id="calendar-view-month"
          data-focus-left="calendar-view-week"
          data-focus-right="calendar-view-agenda"
          data-focus-down="screen-entry"
          to="/calendar/month"
        >
          Month
        </NavLink>
        <NavLink
          className={({ isActive }) => (isActive ? 'calendar-view-switch__active' : undefined)}
          data-focus-id="calendar-view-agenda"
          data-focus-left="calendar-view-month"
          data-focus-right="calendar-manage"
          data-focus-down="screen-entry"
          to="/calendar/agenda"
        >
          Agenda
        </NavLink>
      </nav>
      <Link
        className="calendar-manage-link focusable"
        data-focus-id="calendar-manage"
        data-focus-left="calendar-view-agenda"
        data-focus-right="calendar-manage"
        data-focus-down="screen-entry"
        to="/admin/connections/calendar"
      >
        <Icon name="calendar" />
        <span>Sources</span>
      </Link>
    </div>
  );
}
