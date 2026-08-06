import type { RealtimeEvent } from '@hearth/shared';

type RealtimeListener = (event: RealtimeEvent) => void;

export class RealtimeHub {
  private readonly listeners = new Map<string, Set<RealtimeListener>>();
  private sequence = 0;

  subscribe(householdId: string, listener: RealtimeListener): () => void {
    const householdListeners = this.listeners.get(householdId) ?? new Set<RealtimeListener>();
    householdListeners.add(listener);
    this.listeners.set(householdId, householdListeners);
    return () => {
      householdListeners.delete(listener);
      if (householdListeners.size === 0) this.listeners.delete(householdId);
    };
  }

  publish(householdId: string, kind: RealtimeEvent['kind'], targetId: string): RealtimeEvent {
    this.sequence += 1;
    const event: RealtimeEvent = {
      id: `realtime_${this.sequence}`,
      kind,
      householdId,
      targetId,
      occurredAt: new Date().toISOString(),
    };
    for (const listener of this.listeners.get(householdId) ?? []) listener(event);
    return event;
  }
}
