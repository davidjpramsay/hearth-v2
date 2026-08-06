import { describe, expect, it } from 'vitest';

import { DEMO_TV_ACTOR, InMemoryHearthRepository } from './repository.js';

describe('in-memory Hearth repository', () => {
  it('replays duplicate completion requests without a second mutation', async () => {
    const repository = new InMemoryHearthRepository();
    const first = await repository.complete(
      'household_hearth_demo',
      'occurrence_school_bag',
      'request_same_001',
      DEMO_TV_ACTOR,
    );
    const replay = await repository.complete(
      'household_hearth_demo',
      'occurrence_school_bag',
      'request_same_001',
      DEMO_TV_ACTOR,
    );
    expect(first.replayed).toBe(false);
    expect(replay).toMatchObject({
      completionId: first.completionId,
      replayed: true,
    });
  });

  it('rolls a completion back through the typed reversal command', async () => {
    const repository = new InMemoryHearthRepository();
    const completed = await repository.complete(
      'household_hearth_demo',
      'occurrence_school_bag',
      'request_complete_001',
      DEMO_TV_ACTOR,
    );
    const undone = await repository.undo(
      'household_hearth_demo',
      'occurrence_school_bag',
      'request_undo_001',
      completed.completionId,
      DEMO_TV_ACTOR,
    );
    expect(undone.occurrence.state).toBe('pending');
    expect(undone.audit.result).toBe('reversed');
  });
});
