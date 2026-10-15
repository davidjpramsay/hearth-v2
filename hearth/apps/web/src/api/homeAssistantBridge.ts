import {
  BridgeConnectionSchema,
  BridgeGrantRequestSchema,
  BridgeGrantResultSchema,
  ScreenPresentationRequestSchema,
  ScreenPresentationResultSchema,
  TvDeviceSessionSchema,
  type BridgeGrantRequest,
  type ScreenPresentationRequest,
} from '@hearth/shared';
import { z } from 'zod';

import { API_BASE, demoAdminHeaders, householdApiBase } from './core';
import { withRequestDeadline } from './deadline';

/** Keep status for quiet polling/backoff without retaining a response body or credential. */
export class HomeAssistantBridgeApiError extends Error {
  constructor(readonly status: number) {
    super('Hearth could not confirm the Home Assistant bridge request.');
    this.name = 'HomeAssistantBridgeApiError';
  }
}

async function bridgeRequest<T>(url: string, schema: z.ZodType<T>, init: RequestInit) {
  try {
    return await withRequestDeadline(init, async (boundedInit) => {
      const response = await fetch(url, {
        ...boundedInit,
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
        headers: {
          Accept: 'application/json',
          ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...init.headers,
        },
      });
      // Never retain or surface an error body; an upstream error could contain a submitted key.
      if (!response.ok) throw new HomeAssistantBridgeApiError(response.status);
      const parsed = schema.safeParse(await response.json());
      if (!parsed.success) throw new HomeAssistantBridgeApiError(0);
      return parsed.data;
    });
  } catch (error) {
    if (error instanceof HomeAssistantBridgeApiError) throw error;
    throw new HomeAssistantBridgeApiError(0);
  }
}

export const homeAssistantBridgeApi = {
  getConnection: (signal?: AbortSignal) =>
    bridgeRequest(
      `${householdApiBase()}/home-assistant-bridge`,
      BridgeConnectionSchema.nullable(),
      {
        headers: demoAdminHeaders,
        ...(signal === undefined ? {} : { signal }),
      },
    ),
  issue: (input: BridgeGrantRequest, signal?: AbortSignal) => {
    if (!BridgeGrantRequestSchema.safeParse(input).success)
      return Promise.reject(new HomeAssistantBridgeApiError(0));
    return bridgeRequest(`${householdApiBase()}/home-assistant-bridge`, BridgeGrantResultSchema, {
      method: 'POST',
      headers: demoAdminHeaders,
      body: JSON.stringify(input),
      ...(signal === undefined ? {} : { signal }),
    });
  },
  revoke: (requestId: string, signal?: AbortSignal) =>
    bridgeRequest(
      `${householdApiBase()}/home-assistant-bridge/revocations`,
      z.object({ revoked: z.literal(true) }),
      {
        method: 'POST',
        headers: demoAdminHeaders,
        body: JSON.stringify({ requestId }),
        ...(signal === undefined ? {} : { signal }),
      },
    ),
  getCurrentDevice: (signal: AbortSignal) =>
    bridgeRequest(`${API_BASE}/device-sessions/current`, TvDeviceSessionSchema, { signal }),
  present: (input: ScreenPresentationRequest, signal: AbortSignal) =>
    bridgeRequest(
      `${API_BASE}/device-sessions/current/presentation`,
      ScreenPresentationResultSchema,
      {
        method: 'POST',
        body: JSON.stringify(ScreenPresentationRequestSchema.parse(input)),
        signal,
      },
    ),
};
