import { describe, expect, it } from 'vitest';

import { eventColorVariables } from './calendar';

describe('calendar event presentation', () => {
  it('uses deep source-colour fills in light and dark themes', () => {
    expect(eventColorVariables('#6b4fa3')).toMatchObject({
      '--event-background': 'rgba(107, 79, 163, 0.36)',
      '--event-background-dark': 'rgba(107, 79, 163, 0.44)',
      '--event-border': 'rgba(107, 79, 163, 0.74)',
    });
  });
});
