import { createContext, useContext } from 'react';
import {
  DEFAULT_MODULE_FLAGS,
  moduleForPath,
  normalizeModulePath,
  type ModuleFlags,
} from '@hearth/shared';

// Isolated component fixtures use the unchanged all-enabled product; the real app always loads
// ModulesProvider after household authentication, before mounting any feature.
export const ModulesContext = createContext<ModuleFlags>(DEFAULT_MODULE_FLAGS);
export const useModules = () => useContext(ModulesContext);
export function useModulePathAvailable(): (path: string) => boolean {
  const enabled = useModules();
  return (path) => {
    const clean = normalizeModulePath(path);
    if (clean === '/admin/planning') return enabled.chores || enabled.meals || enabled.lists;
    const module = moduleForPath(clean);
    return module === null || enabled[module];
  };
}
