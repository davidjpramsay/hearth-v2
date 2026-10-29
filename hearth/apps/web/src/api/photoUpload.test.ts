import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HearthApiError } from './core';
import { sendPhotoUpload } from './photoUpload';
class FakeXHR {
  static current: FakeXHR;
  upload: { onprogress?: (event: ProgressEvent) => void; onload?: () => void } = {};
  headers: Record<string, string> = {};
  timeout = 0;
  responseType = '';
  status = 0;
  response: unknown = null;
  onload?: () => void;
  onerror?: () => void;
  ontimeout?: () => void;
  body: unknown;
  constructor() {
    FakeXHR.current = this;
  }
  open = vi.fn();
  setRequestHeader(key: string, value: string) {
    this.headers[key] = value;
  }
  send(body: unknown) {
    this.body = body;
  }
}
beforeEach(() => vi.stubGlobal('XMLHttpRequest', FakeXHR));
afterEach(() => vi.unstubAllGlobals());
describe('photo upload transport', () => {
  it('sends only raw bytes/approved headers and distinguishes progress from processing', async () => {
    const progress = vi.fn();
    const file = new File(['private image bytes'], 'private-local-filename.jpg');
    const pending = sendPhotoUpload(
      '/api/v1/households/household_test/photo-uploads',
      file,
      {
        'Content-Type': 'image/jpeg',
        'X-Hearth-Request-Id': 'request_same',
      },
      progress,
    );
    const xhr = FakeXHR.current;
    expect(xhr.body).toBe(file);
    expect(JSON.stringify(xhr.headers)).not.toContain(file.name);
    xhr.upload.onprogress?.(
      new ProgressEvent('progress', { lengthComputable: true, loaded: 5, total: 10 }),
    );
    xhr.upload.onload?.();
    expect(progress.mock.calls).toEqual([
      [{ fraction: 0.5, processing: false }],
      [{ fraction: 1, processing: true }],
    ]);
    xhr.ontimeout?.();
    await expect(pending).rejects.toThrow('Retry to check whether Hearth received it');
  });
  it('preserves typed access failures without returning response internals', async () => {
    const pending = sendPhotoUpload('/api/v1/test', new File(['x'], 'x.jpg'), {});
    const xhr = FakeXHR.current;
    xhr.status = 403;
    xhr.response = {
      error: {
        code: 'FORBIDDEN',
        message: 'Connect an adult phone.',
        retryable: false,
        requestId: null,
      },
    };
    xhr.onload?.();
    await expect(pending).rejects.toBeInstanceOf(HearthApiError);
  });
  it('treats a malformed success as ambiguous and permits an exact retry', async () => {
    const pending = sendPhotoUpload('/api/v1/test', new File(['x'], 'x.jpg'), {});
    FakeXHR.current.status = 200;
    FakeXHR.current.response = { internalPath: '/never-show-this' };
    FakeXHR.current.onload?.();
    await expect(pending).rejects.toThrow('Retry it to check safely');
  });
});
