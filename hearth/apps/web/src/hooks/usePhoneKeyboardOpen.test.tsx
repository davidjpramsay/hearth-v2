import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { COMPANION_QUERY } from '../layout/viewportQueries';
import { usePhoneKeyboardOpen } from './usePhoneKeyboardOpen';

const originalViewport = Object.getOwnPropertyDescriptor(window, 'visualViewport');
const originalHeight = Object.getOwnPropertyDescriptor(window, 'innerHeight');

describe('phone keyboard navigation visibility', () => {
  let viewport: EventTarget & { height: number; scale: number };
  let companion: EventTarget & { matches: boolean; media: string };
  let frames: Map<number, FrameRequestCallback>;
  let nextFrame: number;

  const flush = () => {
    act(() => {
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((callback) => callback(0));
    });
  };
  const resize = (height: number, scale = 1) => {
    viewport.height = height;
    viewport.scale = scale;
    act(() => viewport.dispatchEvent(new Event('resize')));
    flush();
  };

  beforeEach(() => {
    frames = new Map();
    nextFrame = 0;
    viewport = Object.assign(new EventTarget(), { height: 852, scale: 1 });
    companion = Object.assign(new EventTarget(), { matches: true, media: COMPANION_QUERY });
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 852 });
    vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(852);
    vi.spyOn(window, 'matchMedia').mockReturnValue(companion as unknown as MediaQueryList);
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      const id = ++nextFrame;
      frames.set(id, callback);
      return id;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      frames.delete(id);
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    if (originalViewport) Object.defineProperty(window, 'visualViewport', originalViewport);
    else Reflect.deleteProperty(window, 'visualViewport');
    if (originalHeight) Object.defineProperty(window, 'innerHeight', originalHeight);
  });

  it('keeps navigation visible without editing focus even when geometry is reduced', () => {
    const { result } = renderHook(() => usePhoneKeyboardOpen());
    resize(360);
    expect(result.current).toBe(false);
  });

  it('hides during text editing and restores after dismissal without clearing the draft', () => {
    render(<input aria-label="Reminder title" defaultValue="Fictional test reminder" />);
    const { result } = renderHook(() => usePhoneKeyboardOpen());
    act(() => screen.getByRole('textbox').focus());
    resize(360);
    expect(result.current).toBe(true);
    resize(852);
    expect(result.current).toBe(false);
    expect(screen.getByRole('textbox')).toHaveValue('Fictional test reminder');
  });

  it('recognises textarea editing and restores when focus leaves', () => {
    render(<textarea aria-label="Draft" />);
    const { result } = renderHook(() => usePhoneKeyboardOpen());
    act(() => screen.getByRole('textbox').focus());
    resize(360);
    expect(result.current).toBe(true);
    act(() => screen.getByRole('textbox').blur());
    flush();
    expect(result.current).toBe(false);
  });

  it('recognises an editable rich-text element', () => {
    render(<div contentEditable aria-label="Editable draft" role="textbox" />);
    const input = screen.getByRole('textbox');
    // jsdom does not implement this browser-computed content-editable property.
    Object.defineProperty(input, 'isContentEditable', { value: true });
    const { result } = renderHook(() => usePhoneKeyboardOpen());
    act(() => input.focus());
    resize(360);
    expect(result.current).toBe(true);
  });

  it.each([
    'button',
    'checkbox',
    'color',
    'file',
    'hidden',
    'image',
    'radio',
    'range',
    'reset',
    'submit',
  ])('does not treat %s input focus as keyboard editing', (type) => {
    render(<input type={type} aria-label="Non-editing control" />);
    const { result } = renderHook(() => usePhoneKeyboardOpen());
    act(() => screen.getByLabelText('Non-editing control').focus());
    resize(360);
    expect(result.current).toBe(false);
  });

  it('ignores browser toolbar changes and requires a reduction larger than 150 pixels', () => {
    render(<input aria-label="Draft" />);
    const { result } = renderHook(() => usePhoneKeyboardOpen());
    act(() => screen.getByRole('textbox').focus());
    resize(772);
    expect(result.current).toBe(false);
    resize(702);
    expect(result.current).toBe(false);
    resize(701);
    expect(result.current).toBe(true);
  });

  it('does not mistake pinch zoom for keyboard occlusion or change the zoom', () => {
    render(<input aria-label="Draft" />);
    const { result } = renderHook(() => usePhoneKeyboardOpen());
    act(() => screen.getByRole('textbox').focus());
    resize(360, 1.5);
    expect(result.current).toBe(false);
    expect(viewport.scale).toBe(1.5);
  });

  it('uses the larger layout height when the browser also resizes innerHeight', () => {
    render(<input aria-label="Draft" />);
    const { result } = renderHook(() => usePhoneKeyboardOpen());
    act(() => screen.getByRole('textbox').focus());
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 360 });
    resize(360);
    expect(result.current).toBe(true);
  });

  it('keeps wide-screen navigation unchanged and reacts to the companion breakpoint', () => {
    companion.matches = false;
    render(<input aria-label="Draft" />);
    const { result } = renderHook(() => usePhoneKeyboardOpen());
    act(() => screen.getByRole('textbox').focus());
    resize(360);
    expect(result.current).toBe(false);
    companion.matches = true;
    act(() => companion.dispatchEvent(new Event('change')));
    flush();
    expect(result.current).toBe(true);
    companion.matches = false;
    act(() => companion.dispatchEvent(new Event('change')));
    flush();
    expect(result.current).toBe(false);
  });

  it('fails safely when VisualViewport is unavailable', () => {
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: undefined });
    const { result } = renderHook(() => usePhoneKeyboardOpen());
    expect(result.current).toBe(false);
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
  });

  it('coalesces viewport and focus events into one animation frame', () => {
    render(<input aria-label="Draft" />);
    const { result } = renderHook(() => usePhoneKeyboardOpen());
    act(() => {
      screen.getByRole('textbox').focus();
      viewport.height = 360;
      viewport.dispatchEvent(new Event('resize'));
      window.dispatchEvent(new Event('resize'));
    });
    expect(frames.size).toBe(1);
    flush();
    expect(result.current).toBe(true);
  });

  it('removes every subscription and cancels a pending frame when unmounted', () => {
    const viewportRemoval = vi.spyOn(viewport, 'removeEventListener');
    const windowRemoval = vi.spyOn(window, 'removeEventListener');
    const companionRemoval = vi.spyOn(companion, 'removeEventListener');
    const documentRemoval = vi.spyOn(document, 'removeEventListener');
    const { unmount } = renderHook(() => usePhoneKeyboardOpen());
    act(() => viewport.dispatchEvent(new Event('resize')));
    expect(frames.size).toBe(1);
    unmount();
    expect(frames.size).toBe(0);
    expect(viewportRemoval).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(windowRemoval).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(companionRemoval).toHaveBeenCalledWith('change', expect.any(Function));
    expect(documentRemoval).toHaveBeenCalledWith('focusin', expect.any(Function));
    expect(documentRemoval).toHaveBeenCalledWith('focusout', expect.any(Function));
  });
});
