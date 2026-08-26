import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { lazy, Suspense } from 'react';

import { useAppearance } from './appearance/appearance';
import { AppShell } from './components/AppShell';
import { LoadingState } from './components/Status';
import { useRemoteNavigation } from './focus/useRemoteNavigation';
import { useScenario } from './hooks/useScenario';
import { useRealtimeInvalidation } from './hooks/useRealtimeInvalidation';
import { TodayScreen } from './screens/TodayScreen';

const AdminAuthBoundary = lazy(async () => ({
  default: (await import('./auth/AdminAuthBoundary')).AdminAuthBoundary,
}));

const WeekScreen = lazy(async () => ({
  default: (await import('./screens/WeekScreen')).WeekScreen,
}));
const MonthScreen = lazy(async () => ({
  default: (await import('./screens/MonthScreen')).MonthScreen,
}));
const ChoresScreen = lazy(async () => ({
  default: (await import('./screens/ChoresScreen')).ChoresScreen,
}));
const ListsScreen = lazy(async () => ({
  default: (await import('./screens/ListsScreen')).ListsScreen,
}));
const MealsScreen = lazy(async () => ({
  default: (await import('./screens/MealsScreen')).MealsScreen,
}));
const HomeScreen = lazy(async () => ({
  default: (await import('./screens/HomeScreen')).HomeScreen,
}));
const PhotosScreen = lazy(async () => ({
  default: (await import('./screens/PhotosScreen')).PhotosScreen,
}));
const RemindersScreen = lazy(async () => ({
  default: (await import('./screens/RemindersScreen')).RemindersScreen,
}));
const PairingScreen = lazy(async () => ({
  default: (await import('./screens/PairingScreen')).PairingScreen,
}));

const AgendaScreen = lazy(async () => ({
  default: (await import('./screens/AgendaScreen')).AgendaScreen,
}));
const MoreScreen = lazy(async () => ({
  default: (await import('./screens/MoreScreen')).MoreScreen,
}));
const AdminScreen = lazy(async () => ({
  default: (await import('./screens/AdminScreen')).AdminScreen,
}));
const AppearanceSettingsScreen = lazy(async () => ({
  default: (await import('./screens/AppearanceSettingsScreen')).AppearanceSettingsScreen,
}));
const ConnectionsSettingsScreen = lazy(async () => ({
  default: (await import('./screens/ConnectionsSettingsScreen')).ConnectionsSettingsScreen,
}));
const CalendarConnectionSettingsScreen = lazy(async () => ({
  default: (await import('./screens/CalendarConnectionSettingsScreen'))
    .CalendarConnectionSettingsScreen,
}));
const HomeAssistantConnectionSettingsScreen = lazy(async () => ({
  default: (await import('./screens/HomeAssistantConnectionSettingsScreen'))
    .HomeAssistantConnectionSettingsScreen,
}));
const ReminderConnectionSettingsScreen = lazy(async () => ({
  default: (await import('./screens/ReminderConnectionSettingsScreen'))
    .ReminderConnectionSettingsScreen,
}));
const HouseholdSettingsScreen = lazy(async () => ({
  default: (await import('./screens/HouseholdSettingsScreen')).HouseholdSettingsScreen,
}));
const PlanningSettingsScreen = lazy(async () => ({
  default: (await import('./screens/PlanningSettingsScreen')).PlanningSettingsScreen,
}));
const ListsSettingsScreen = lazy(async () => ({
  default: (await import('./screens/ListsSettingsScreen')).ListsSettingsScreen,
}));
const MealsSettingsScreen = lazy(async () => ({
  default: (await import('./screens/MealsSettingsScreen')).MealsSettingsScreen,
}));
const PhotosSettingsScreen = lazy(async () => ({
  default: (await import('./screens/PhotosSettingsScreen')).PhotosSettingsScreen,
}));
const PeopleSettingsScreen = lazy(async () => ({
  default: (await import('./screens/PeopleSettingsScreen')).PeopleSettingsScreen,
}));
const AdultAccessScreen = lazy(async () => ({
  default: (await import('./screens/AdultAccessScreen')).AdultAccessScreen,
}));
const PocketMoneySettingsScreen = lazy(async () => ({
  default: (await import('./screens/PocketMoneySettingsScreen')).PocketMoneySettingsScreen,
}));
const RoutinesSettingsScreen = lazy(async () => ({
  default: (await import('./screens/RoutinesSettingsScreen')).RoutinesSettingsScreen,
}));
const ChoreDaySettingsScreen = lazy(async () => ({
  default: (await import('./screens/ChoreDaySettingsScreen')).ChoreDaySettingsScreen,
}));
const TelevisionsSettingsScreen = lazy(async () => ({
  default: (await import('./screens/TelevisionsSettingsScreen')).TelevisionsSettingsScreen,
}));
const TodaySettingsScreen = lazy(async () => ({
  default: (await import('./screens/TodaySettingsScreen')).TodaySettingsScreen,
}));
const SystemHealthScreen = lazy(async () => ({
  default: (await import('./screens/SystemHealthScreen')).SystemHealthScreen,
}));
const SystemActivityScreen = lazy(async () => ({
  default: (await import('./screens/SystemActivityScreen')).SystemActivityScreen,
}));

export function App() {
  const location = useLocation();
  const { preferences } = useAppearance();
  const { scenario, preparing, error } = useScenario();
  useRealtimeInvalidation();
  const initialFocus =
    location.pathname === '/appearance' ? `appearance-${preferences.theme}` : 'screen-entry';
  useRemoteNavigation(initialFocus);
  return (
    <AppShell>
      {error === null ? null : (
        <div className="bootstrap-error" role="alert">
          {error}
        </div>
      )}
      <Suspense fallback={<LoadingState />}>
        <Routes>
          <Route
            path="/today"
            element={<TodayScreen preparing={preparing} scenario={scenario} />}
          />
          <Route path="/calendar" element={<Navigate replace to="/calendar/week" />} />
          <Route
            path="/calendar/week"
            element={<WeekScreen preparing={preparing} scenario={scenario} />}
          />
          <Route
            path="/calendar/month"
            element={<MonthScreen preparing={preparing} scenario={scenario} />}
          />
          <Route
            path="/calendar/agenda"
            element={<AgendaScreen preparing={preparing} scenario={scenario} />}
          />
          <Route path="/week" element={<LegacyCalendarRedirect view="week" />} />
          <Route path="/month" element={<LegacyCalendarRedirect view="month" />} />
          <Route
            path="/chores"
            element={<ChoresScreen preparing={preparing} scenario={scenario} />}
          />
          <Route
            path="/lists"
            element={<ListsScreen preparing={preparing} scenario={scenario} />}
          />
          <Route
            path="/meals"
            element={<MealsScreen preparing={preparing} scenario={scenario} />}
          />
          <Route
            path="/photos"
            element={<PhotosScreen preparing={preparing} scenario={scenario} />}
          />
          <Route path="/reminders" element={<RemindersScreen preparing={preparing} />} />
          <Route path="/home" element={<HomeScreen preparing={preparing} scenario={scenario} />} />
          <Route path="/more" element={<MoreScreen />} />
          <Route path="/appearance" element={<AppearanceSettingsScreen />} />
          <Route path="/admin/appearance" element={<Navigate replace to="/appearance" />} />
          <Route
            element={
              <AdminAuthBoundary>
                <Outlet />
              </AdminAuthBoundary>
            }
          >
            <Route path="/admin" element={<AdminScreen />} />
            <Route path="/admin/household" element={<HouseholdSettingsScreen />} />
            <Route path="/admin/people" element={<PeopleSettingsScreen />} />
            <Route path="/admin/access" element={<AdultAccessScreen />} />
            <Route path="/admin/today" element={<TodaySettingsScreen />} />
            <Route path="/admin/televisions" element={<TelevisionsSettingsScreen />} />
            <Route path="/admin/connections" element={<ConnectionsSettingsScreen />} />
            <Route
              path="/admin/connections/calendar"
              element={<CalendarConnectionSettingsScreen />}
            />
            <Route
              path="/admin/connections/home-assistant"
              element={<HomeAssistantConnectionSettingsScreen />}
            />
            <Route
              path="/admin/connections/reminders"
              element={<ReminderConnectionSettingsScreen />}
            />
            <Route path="/admin/planning" element={<PlanningSettingsScreen />} />
            <Route path="/admin/lists" element={<ListsSettingsScreen />} />
            <Route path="/admin/meals" element={<MealsSettingsScreen />} />
            <Route path="/admin/photos" element={<PhotosSettingsScreen />} />
            <Route path="/admin/routines" element={<RoutinesSettingsScreen />} />
            <Route path="/admin/chore-day" element={<ChoreDaySettingsScreen />} />
            <Route path="/admin/pocket-money" element={<PocketMoneySettingsScreen />} />
            <Route path="/admin/system" element={<SystemHealthScreen />} />
            <Route path="/admin/activity" element={<SystemActivityScreen />} />
            <Route path="/admin/rewards" element={<Navigate replace to="/admin/pocket-money" />} />
          </Route>
          <Route path="/pair" element={<PairingScreen />} />
          <Route path="*" element={<Navigate replace to="/today" />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}

function LegacyCalendarRedirect({ view }: { view: 'week' | 'month' }) {
  const { search } = useLocation();
  return <Navigate replace to={{ pathname: `/calendar/${view}`, search }} />;
}
