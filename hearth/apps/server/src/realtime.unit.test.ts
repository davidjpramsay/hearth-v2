import { describe, expect, it, vi } from 'vitest';

import { RealtimeHub } from './realtime.js';

describe('RealtimeHub', () => {
  it('publishes only to the matching household and stops after unsubscribe', () => {
    const hub = new RealtimeHub();
    const listener = vi.fn();
    const other = vi.fn();
    const unsubscribe = hub.subscribe('household_hearth_demo', listener);
    hub.subscribe('household_other', other);

    const event = hub.publish('household_hearth_demo', 'chore.changed', 'occurrence_school_bag');
    expect(listener).toHaveBeenCalledWith(event);
    expect(other).not.toHaveBeenCalled();
    unsubscribe();
    hub.publish('household_hearth_demo', 'household.changed', 'member_ezra');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
