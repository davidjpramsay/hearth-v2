import type { DemoScenario } from '@hearth/shared';

import { API_BASE, requestRaw } from './core';

export const demoApi = {
  setScenario: async (scenario: DemoScenario): Promise<void> => {
    await requestRaw(`${API_BASE}/demo/scenario`, {
      method: 'POST',
      body: JSON.stringify({ scenario }),
    });
  },
  resetDemo: async (): Promise<void> => {
    await requestRaw(`${API_BASE}/demo/reset`, { method: 'POST' });
  },
};
