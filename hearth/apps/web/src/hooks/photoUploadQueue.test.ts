import type { PhotoUploadResult } from '@hearth/shared';
import { describe, expect, it, vi } from 'vitest';
import { PhotoUploadQueue } from './photoUploadQueue';
import type { PhotoUploadProgress } from '../api/photoUpload';
const receipt = (duplicate = false) => ({ duplicate }) as PhotoUploadResult;
const file = (name: string) => new File(['photo'], name, { type: 'image/jpeg' });
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
let sequence = 0;
const requestId = () => `request_upload_${++sequence}`;

describe('bounded photo upload queue', () => {
  it('overlaps only two transfers, continues after failure and releases accepted File references', async () => {
    const finish: Array<(result: PhotoUploadResult) => void> = [];
    const reject: Array<(error: Error) => void> = [];
    const upload = vi.fn(
      () =>
        new Promise<PhotoUploadResult>((yes, no) => {
          finish.push(yes);
          reject.push(no);
        }),
    );
    const accepted = vi.fn();
    const queue = new PhotoUploadQueue(upload, accepted, vi.fn());
    queue.add(['a', 'b', 'c', 'd'].map(file), 100, requestId);
    expect(upload).toHaveBeenCalledTimes(2);
    reject[0]!(new Error('Connection interrupted.'));
    await flush();
    expect(upload).toHaveBeenCalledTimes(3);
    finish[1]!(receipt());
    await flush();
    expect(upload).toHaveBeenCalledTimes(4);
    finish[2]!(receipt(true));
    finish[3]!(receipt());
    await flush();
    expect(queue.getSnapshot().items.map((item) => item.state)).toEqual([
      'failed',
      'added',
      'duplicate',
      'added',
    ]);
    expect(queue.getSnapshot().items.filter((item) => item.file !== null)).toHaveLength(1);
    expect(accepted).toHaveBeenCalledTimes(3);
  });
  it('pauses future work, finishes active transfers and resumes without resending successes', async () => {
    const finish: Array<(result: PhotoUploadResult) => void> = [];
    const upload = vi.fn(() => new Promise<PhotoUploadResult>((resolve) => finish.push(resolve)));
    const queue = new PhotoUploadQueue(upload, vi.fn(), vi.fn());
    queue.add(['a', 'b', 'c'].map(file), 100, requestId);
    queue.pause();
    finish[0]!(receipt());
    finish[1]!(receipt());
    await flush();
    expect(upload).toHaveBeenCalledTimes(2);
    expect(queue.getSnapshot().items[2]?.state).toBe('queued');
    queue.resume();
    expect(upload).toHaveBeenCalledTimes(3);
    finish[2]!(receipt());
    await flush();
    expect(queue.getSnapshot().items.every((item) => item.state === 'added')).toBe(true);
  });
  it('retries only failures with the exact original file and request ID', async () => {
    const upload = vi
      .fn()
      .mockRejectedValueOnce(new Error('Timed out'))
      .mockResolvedValue(receipt());
    const queue = new PhotoUploadQueue(upload, vi.fn(), vi.fn());
    const original = file('private-local-name.jpg');
    queue.add([original], 100, requestId);
    await flush();
    const id = queue.getSnapshot().items[0]!.requestId;
    queue.retry();
    await flush();
    expect(upload.mock.calls.map(([blob, request]) => [blob, request])).toEqual([
      [original, id],
      [original, id],
    ]);
    queue.retry();
    expect(upload).toHaveBeenCalledTimes(2);
  });
  it('keeps failed retries paused until Continue is explicitly chosen', async () => {
    let fail!: (error: Error) => void;
    const upload = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<PhotoUploadResult>((_resolve, reject) => {
            fail = reject;
          }),
      )
      .mockResolvedValue(receipt());
    const queue = new PhotoUploadQueue(upload, vi.fn(), vi.fn());
    queue.add([file('retry.jpg')], 100, requestId);
    queue.pause();
    fail(new Error('Timed out'));
    await flush();
    queue.retry();
    expect(queue.getSnapshot().paused).toBe(true);
    expect(upload).toHaveBeenCalledTimes(1);
    queue.resume();
    await flush();
    expect(upload).toHaveBeenCalledTimes(2);
    expect(queue.getSnapshot().items[0]?.state).toBe('added');
  });

  it('honours the advertised per-file limit without blocking valid photos', async () => {
    const upload = vi.fn().mockResolvedValue(receipt());
    const queue = new PhotoUploadQueue(upload, vi.fn(), vi.fn());
    queue.add([new File(['too much'], 'large.jpg'), new File(['ok'], 'small.jpg')], 4, requestId);
    await flush();
    expect(upload).toHaveBeenCalledOnce();
    expect(queue.getSnapshot().items[0]).toMatchObject({
      state: 'failed',
      file: null,
      retryable: false,
    });
    queue.retry();
    expect(upload).toHaveBeenCalledOnce();
  });
  it('distinguishes bytes sent from preparation and stops dispatch after leaving', async () => {
    const finish: Array<(result: PhotoUploadResult) => void> = [];
    const upload = vi.fn(
      (_file: File, _id: string, progress: (value: PhotoUploadProgress) => void) => {
        progress({ fraction: 0.5, processing: false });
        progress({ fraction: 1, processing: true });
        return new Promise<PhotoUploadResult>((resolve) => finish.push(resolve));
      },
    );
    const queue = new PhotoUploadQueue(upload, vi.fn(), vi.fn());
    queue.add(['a', 'b', 'c'].map(file), 100, requestId);
    expect(queue.getSnapshot().items[0]).toMatchObject({ state: 'processing', fraction: 1 });
    queue.setActive(false);
    finish[0]!(receipt());
    finish[1]!(receipt());
    await flush();
    expect(upload).toHaveBeenCalledTimes(2);
    expect(queue.getSnapshot().items[2]?.state).toBe('queued');
  });
});
