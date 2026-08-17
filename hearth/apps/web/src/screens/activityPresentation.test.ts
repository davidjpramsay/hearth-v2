import { describe, expect, it } from 'vitest';

import type { AdminOverview, AuditSummary } from '@hearth/shared';

import {
  actorLabel,
  presentationForActivity,
  resultLabel,
  sourceLabel,
} from './activityPresentation';

const admin = {
  household: {
    id: 'household_demo',
    name: 'Hearth Demo Home',
    timezone: 'Australia/Perth',
    locale: 'en-AU',
    mode: 'Morning',
    members: [
      {
        id: 'member_maya',
        displayName: 'Maya',
        color: '#d78600',
        avatarUrl: '/maya.png',
        role: 'adult',
        capabilities: ['household.view'],
      },
    ],
  },
  actor: {
    id: 'member_maya',
    displayName: 'Maya',
    role: 'adult',
    capabilities: ['household.admin', 'household.view'],
  },
  pairedDevices: [
    {
      id: 'device_tv',
      name: 'Living room TV',
      type: 'television',
      status: 'connected',
      scopes: ['household.read'],
      pairedAt: '2026-08-03T00:00:00.000Z',
      lastSeenAt: null,
      revokedAt: null,
    },
  ],
  pendingPairings: [],
  integrations: [],
  recentAudit: [],
  localOnly: true,
} satisfies AdminOverview;

function activity(overrides: Partial<AuditSummary> = {}): AuditSummary {
  return {
    id: 'audit_001',
    actorType: 'member',
    actorId: 'member_maya',
    source: 'companion',
    action: 'chore.complete',
    targetId: 'occurrence_001',
    occurredAt: '2026-08-03T07:42:00.000Z',
    result: 'succeeded',
    ...overrides,
  };
}

describe('activity presentation', () => {
  it('turns technical audit actions into family-readable labels and filters', () => {
    expect(presentationForActivity('pocket-money.payment.void')).toEqual({
      title: 'Pocket money payment corrected',
      filter: 'planning',
      icon: 'wallet',
    });
    expect(presentationForActivity('home-assistant.connection.save')).toMatchObject({
      title: 'Home Assistant connected',
      filter: 'connections',
    });
    expect(presentationForActivity('photo.hide')).toMatchObject({
      title: 'Family photo hidden',
      filter: 'family',
      icon: 'image',
    });
  });

  it('resolves household actors without exposing opaque identifiers', () => {
    expect(actorLabel(activity(), admin)).toBe('Maya');
    expect(
      actorLabel(activity({ actorType: 'device', actorId: 'device_tv', source: 'tv' }), admin),
    ).toBe('Living room TV');
    expect(
      actorLabel(
        activity({ actorType: 'service', actorId: 'service_ha', source: 'automation' }),
        admin,
      ),
    ).toBe('Home Assistant');
  });

  it('uses concise family-readable source and result labels', () => {
    expect(sourceLabel('companion')).toBe('Phone');
    expect(sourceLabel('automation')).toBe('Automation');
    expect(resultLabel('rejected')).toBe('Not allowed');
    expect(resultLabel('reversed')).toBe('Reversed');
  });
});
