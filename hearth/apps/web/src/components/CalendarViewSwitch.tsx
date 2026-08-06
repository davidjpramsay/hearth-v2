import { NavLink } from 'react-router-dom';

export function CalendarViewSwitch() {
  return (
    <nav aria-label="Calendar view" className="calendar-view-switch">
      <NavLink
        className={({ isActive }) => (isActive ? 'calendar-view-switch__active' : undefined)}
        data-focus-id="calendar-view-week"
        data-focus-left="phone-tab-week"
        data-focus-right="calendar-view-month"
        to="/week"
      >
        Week
      </NavLink>
      <NavLink
        className={({ isActive }) => (isActive ? 'calendar-view-switch__active' : undefined)}
        data-focus-id="calendar-view-month"
        data-focus-left="calendar-view-week"
        data-focus-right="calendar-view-month"
        to="/month"
      >
        Month
      </NavLink>
    </nav>
  );
}
