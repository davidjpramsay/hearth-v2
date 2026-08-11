import { PairingRequestSchema } from '@hearth/shared';

import { API_BASE, request } from './core';

export const pairingApi = {
  createPairing: (deviceName: string, requestId: string) =>
    request(`${API_BASE}/device-pairing-requests`, PairingRequestSchema, {
      method: 'POST',
      body: JSON.stringify({ deviceName, requestId }),
    }),
  getPairing: (pairingId: string) =>
    request(`${API_BASE}/device-pairing-requests/${pairingId}`, PairingRequestSchema),
};
