import { describe, expect, it } from 'vitest';
import { MorningConfigurationSchema, SetMorningCompletionSchema } from './morning-routine.js';
const configuration = {
  startTime: '07:00',
  endTime: '08:00',
  selectedMemberIds: ['member_child'],
  routines: [{ memberId: 'member_child', steps: [{ id: 'step_shoes', title: 'Shoes on' }] }],
};
describe('Morning Routine contracts', () => {
  it('accepts empty selections, bounded lists and suggested ordering', () => {
    expect(MorningConfigurationSchema.parse(configuration)).toEqual(configuration);
    expect(
      MorningConfigurationSchema.safeParse({ ...configuration, selectedMemberIds: [] }).success,
    ).toBe(true);
  });
  it.each([
    { startTime: '08:00' },
    { endTime: '06:00' },
    { startTime: '25:00' },
    { selectedMemberIds: ['member_child', 'member_child'] },
    { selectedMemberIds: ['member_other'] },
    {
      routines: [
        {
          memberId: 'member_child',
          steps: Array.from({ length: 13 }, (_, i) => ({ id: `step_${i}`, title: 'Too many' })),
        },
      ],
    },
    { routines: [{ memberId: 'member_child', steps: [{ id: 'step_bad', title: ' ' }] }] },
    {
      routines: [
        {
          memberId: 'member_child',
          steps: [
            { id: 'step_same', title: 'One' },
            { id: 'step_same', title: 'Two' },
          ],
        },
      ],
    },
  ])('rejects unsafe/ambiguous configuration %j', (override) =>
    expect(MorningConfigurationSchema.safeParse({ ...configuration, ...override }).success).toBe(
      false,
    ),
  );
  it('rejects unknown command fields and absent concurrency protection', () => {
    const input = {
      requestId: 'request_check',
      localDate: '2026-10-26',
      memberId: 'member_child',
      stepId: 'step_shoes',
      settingsRevision: 1,
      expectedVersion: 0,
      isCompleted: true,
    };
    expect(SetMorningCompletionSchema.safeParse(input).success).toBe(true);
    expect(
      SetMorningCompletionSchema.safeParse({ ...input, householdId: 'household_other' }).success,
    ).toBe(false);
    expect(
      SetMorningCompletionSchema.safeParse({ ...input, expectedVersion: undefined }).success,
    ).toBe(false);
  });
});
