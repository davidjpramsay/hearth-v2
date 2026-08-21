import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { setPhotoRotationPaused, usePhotoRotationPreference } from './usePhotoRotationPreference';

afterEach(() => setPhotoRotationPaused(false));

describe('photo rotation preference', () => {
  it('shares a session-only pause state between mounted consumers', () => {
    const first = renderHook(() => usePhotoRotationPreference());
    const second = renderHook(() => usePhotoRotationPreference());

    act(() => first.result.current.togglePhotoRotation());

    expect(first.result.current.rotationPaused).toBe(true);
    expect(second.result.current.rotationPaused).toBe(true);

    act(() => second.result.current.togglePhotoRotation());

    expect(first.result.current.rotationPaused).toBe(false);
    expect(second.result.current.rotationPaused).toBe(false);
  });
});
