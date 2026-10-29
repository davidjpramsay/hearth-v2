import type { PhotoUploadResult } from '@hearth/shared';
import type { PhotoUploadProgress } from '../api/photoUpload';

export interface QueuedPhoto {
  requestId: string;
  name: string;
  file: File | null;
  state: 'queued' | 'uploading' | 'processing' | 'added' | 'duplicate' | 'failed';
  fraction: number;
  error: string | null;
  retryable: boolean;
}
interface UploadQueueState {
  items: QueuedPhoto[];
  paused: boolean;
}
type Upload = (
  file: File,
  id: string,
  progress: (value: PhotoUploadProgress) => void,
) => Promise<PhotoUploadResult>;

/** Two transfers can overlap; the NAS serializes expensive image normalization. Memory only. */
export class PhotoUploadQueue {
  private state: UploadQueueState = { items: [], paused: false };
  private listeners = new Set<() => void>();
  private running = 0;
  private active = true;
  constructor(
    private upload: Upload,
    private accepted: (result: PhotoUploadResult) => void,
    private settled: () => void,
  ) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(items = this.state.items, paused = this.state.paused) {
    this.state = { items, paused };
    for (const listener of this.listeners) listener();
  }
  private update(id: string, changes: Partial<QueuedPhoto>) {
    this.publish(
      this.state.items.map((item) => (item.requestId === id ? { ...item, ...changes } : item)),
    );
  }
  add(files: File[], maxFileBytes: number, requestId: () => string) {
    this.publish([
      ...this.state.items,
      ...files.map((file): QueuedPhoto => ({
        requestId: requestId(),
        name: file.name,
        file: file.size > maxFileBytes ? null : file,
        state: file.size > maxFileBytes ? 'failed' : 'queued',
        fraction: 0,
        error:
          file.size > maxFileBytes
            ? `Larger than ${Math.round(maxFileBytes / 1024 / 1024)} MB per photo.`
            : null,
        retryable: file.size <= maxFileBytes,
      })),
    ]);
    this.drain();
  }
  setActive(active: boolean) {
    this.active = active;
    if (active) this.drain();
  }
  pause = () => this.publish(this.state.items, true);
  resume = () => {
    this.publish(this.state.items, false);
    this.drain();
  };
  retry = () => {
    this.publish(
      this.state.items.map((item) =>
        item.state === 'failed' && item.retryable
          ? { ...item, state: 'queued', fraction: 0, error: null }
          : item,
      ),
      this.state.paused,
    );
    this.drain();
  };
  private drain() {
    while (this.active && !this.state.paused && this.running < 2) {
      const item = this.state.items.find((candidate) => candidate.state === 'queued');
      if (!item || !item.file) break;
      this.running++;
      this.update(item.requestId, { state: 'uploading' });
      void this.send(item);
    }
  }
  private async send(item: QueuedPhoto) {
    try {
      const result = await this.upload(item.file!, item.requestId, (progress) => {
        this.update(item.requestId, {
          state: progress.processing ? 'processing' : 'uploading',
          fraction: progress.fraction,
        });
      });
      this.update(item.requestId, {
        state: result.duplicate ? 'duplicate' : 'added',
        fraction: 1,
        file: null,
      });
      this.accepted(result);
    } catch (error) {
      this.update(item.requestId, {
        state: 'failed',
        error: error instanceof Error ? error.message : 'This photo needs another try.',
      });
    } finally {
      this.running--;
      this.drain();
      if (this.running === 0) this.settled();
    }
  }
}
