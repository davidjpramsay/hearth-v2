import { Navigate, Route, Routes, useLocation } from 'react-router-dom';

import { useAppearance } from './appearance/appearance';
import { AppShell } from './components/AppShell';
import { useRemoteNavigation } from './focus/useRemoteNavigation';
import { useScenario } from './hooks/useScenario';
import { useRealtimeInvalidation } from './hooks/useRealtimeInvalidation';
import { ChoresScreen } from './screens/ChoresScreen';
import { AdminScreen } from './screens/AdminScreen';
import { AppearanceSettingsScreen } from './screens/AppearanceSettingsScreen';
import { ConnectionsSettingsScreen } from './screens/ConnectionsSettingsScreen';
import { CalendarConnectionSettingsScreen } from './screens/CalendarConnectionSettingsScreen';
import { HouseholdSettingsScreen } from './screens/HouseholdSettingsScreen';
import { HomeScreen } from './screens/HomeScreen';
import { ListsScreen } from './screens/ListsScreen';
import { MealsScreen } from './screens/MealsScreen';
import { MonthScreen } from './screens/MonthScreen';
import { PairingScreen } from './screens/PairingScreen';
import { PlanningSettingsScreen } from './screens/PlanningSettingsScreen';
import { PhotosScreen } from './screens/PhotosScreen';
import { PhotosSettingsScreen } from './screens/PhotosSettingsScreen';
import { PeopleSettingsScreen } from './screens/PeopleSettingsScreen';
import { PocketMoneySettingsScreen } from './screens/PocketMoneySettingsScreen';
import { RoutinesSettingsScreen } from './screens/RoutinesSettingsScreen';
import { TelevisionsSettingsScreen } from './screens/TelevisionsSettingsScreen';
import { TodayScreen } from './screens/TodayScreen';
import { WeekScreen } from './screens/WeekScreen';

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
      <Routes>
        <Route path="/today" element={<TodayScreen preparing={preparing} scenario={scenario} />} />
        <Route path="/week" element={<WeekScreen preparing={preparing} scenario={scenario} />} />
        <Route path="/month" element={<MonthScreen preparing={preparing} scenario={scenario} />} />
        <Route
          path="/chores"
          element={<ChoresScreen preparing={preparing} scenario={scenario} />}
        />
        <Route path="/lists" element={<ListsScreen preparing={preparing} scenario={scenario} />} />
        <Route path="/meals" element={<MealsScreen preparing={preparing} scenario={scenario} />} />
        <Route
          path="/photos"
          element={<PhotosScreen preparing={preparing} scenario={scenario} />}
        />
        <Route path="/home" element={<HomeScreen preparing={preparing} scenario={scenario} />} />
        <Route path="/admin" element={<AdminScreen />} />
        <Route path="/admin/appearance" element={<AppearanceSettingsScreen />} />
        <Route path="/admin/household" element={<HouseholdSettingsScreen />} />
        <Route path="/admin/people" element={<PeopleSettingsScreen />} />
        <Route path="/admin/televisions" element={<TelevisionsSettingsScreen />} />
        <Route path="/admin/connections" element={<ConnectionsSettingsScreen />} />
        <Route path="/admin/connections/calendar" element={<CalendarConnectionSettingsScreen />} />
        <Route path="/admin/planning" element={<PlanningSettingsScreen />} />
        <Route path="/admin/photos" element={<PhotosSettingsScreen />} />
        <Route path="/admin/routines" element={<RoutinesSettingsScreen />} />
        <Route path="/admin/pocket-money" element={<PocketMoneySettingsScreen />} />
        <Route path="/admin/rewards" element={<Navigate replace to="/admin/pocket-money" />} />
        <Route path="/pair" element={<PairingScreen />} />
        <Route path="*" element={<Navigate replace to="/today" />} />
      </Routes>
    </AppShell>
  );
}
