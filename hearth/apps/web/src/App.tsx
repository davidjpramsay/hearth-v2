import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { lazy, Suspense } from 'react';

import { useAppearance } from './appearance/appearance';
import { AdminAuthBoundary } from './auth/AdminAuthBoundary';
import { AppShell } from './components/AppShell';
import { LoadingState } from './components/Status';
import { useRemoteNavigation } from './focus/useRemoteNavigation';
import { useScenario } from './hooks/useScenario';
import { useRealtimeInvalidation } from './hooks/useRealtimeInvalidation';
import { ChoresScreen } from './screens/ChoresScreen';
import { HomeScreen } from './screens/HomeScreen';
import { ListsScreen } from './screens/ListsScreen';
import { MealsScreen } from './screens/MealsScreen';
import { MonthScreen } from './screens/MonthScreen';
import { PairingScreen } from './screens/PairingScreen';
import { PhotosScreen } from './screens/PhotosScreen';
import { TodayScreen } from './screens/TodayScreen';
import { WeekScreen } from './screens/WeekScreen';

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
const HouseholdSettingsScreen = lazy(async () => ({
  default: (await import('./screens/HouseholdSettingsScreen')).HouseholdSettingsScreen,
}));
const PlanningSettingsScreen = lazy(async () => ({
  default: (await import('./screens/PlanningSettingsScreen')).PlanningSettingsScreen,
}));
const PhotosSettingsScreen = lazy(async () => ({
  default: (await import('./screens/PhotosSettingsScreen')).PhotosSettingsScreen,
}));
const PeopleSettingsScreen = lazy(async () => ({
  default: (await import('./screens/PeopleSettingsScreen')).PeopleSettingsScreen,
}));
const PocketMoneySettingsScreen = lazy(async () => ({
  default: (await import('./screens/PocketMoneySettingsScreen')).PocketMoneySettingsScreen,
}));
const RoutinesSettingsScreen = lazy(async () => ({
  default: (await import('./screens/RoutinesSettingsScreen')).RoutinesSettingsScreen,
}));
const TelevisionsSettingsScreen = lazy(async () => ({
  default: (await import('./screens/TelevisionsSettingsScreen')).TelevisionsSettingsScreen,
}));

export function App() {
  const location = useLocation();
  const { preferences } = useAppearance();
  const { scenario, preparing, error } = useScenario();
  useRealtimeInvalidation();
  const initialFocus =
    location.pathname === '/admin/appearance' ? `appearance-${preferences.theme}` : 'screen-entry';
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
          <Route path="/home" element={<HomeScreen preparing={preparing} scenario={scenario} />} />
          <Route path="/more" element={<MoreScreen />} />
          <Route
            element={
              <AdminAuthBoundary>
                <Outlet />
              </AdminAuthBoundary>
            }
          >
            <Route path="/admin" element={<AdminScreen />} />
            <Route path="/admin/appearance" element={<AppearanceSettingsScreen />} />
            <Route path="/admin/household" element={<HouseholdSettingsScreen />} />
            <Route path="/admin/people" element={<PeopleSettingsScreen />} />
            <Route path="/admin/televisions" element={<TelevisionsSettingsScreen />} />
            <Route path="/admin/connections" element={<ConnectionsSettingsScreen />} />
            <Route
              path="/admin/connections/calendar"
              element={<CalendarConnectionSettingsScreen />}
            />
            <Route path="/admin/planning" element={<PlanningSettingsScreen />} />
            <Route path="/admin/photos" element={<PhotosSettingsScreen />} />
            <Route path="/admin/routines" element={<RoutinesSettingsScreen />} />
            <Route path="/admin/pocket-money" element={<PocketMoneySettingsScreen />} />
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
