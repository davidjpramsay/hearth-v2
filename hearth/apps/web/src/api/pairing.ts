import {
  PairingRequestSchema,
  TvDeviceSessionSchema,
  TvPairingSessionSchema,
} from '@hearth/shared';

import { API_BASE, request } from './core';

export const pairingApi = {
  createPairing: (deviceName: string, requestId: string) =>
    request(`${API_BASE}/device-pairing-requests`, PairingRequestSchema, {
      method: 'POST',
      body: JSON.stringify({ deviceName, requestId }),
    }),
  getPairing: (pairingId: string) =>
    request(`${API_BASE}/device-pairing-requests/${pairingId}`, PairingRequestSchema),
  createBrowserTelevisionSession: (deviceName: string, requestId: string, pairingSecret: string) =>
    request(`${API_BASE}/tv-pairing-sessions`, TvPairingSessionSchema, {
      method: 'POST',
      body: JSON.stringify({
        applicationVersion: 'browser-display-1',
        deviceName,
        pairingSecret,
        requestId,
      }),
    }),
  exchangeBrowserTelevisionCredential: (
    pairingId: string,
    requestId: string,
    pairingSecret: string,
  ) =>
    request(
      `${API_BASE}/tv-pairing-sessions/${pairingId}/credential-exchanges`,
      TvDeviceSessionSchema,
      {
        method: 'POST',
        body: JSON.stringify({ pairingSecret, requestId }),
      },
    ),
};
