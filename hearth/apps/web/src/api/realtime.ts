import { householdApiBase } from './core';

export function getRealtimeUrl(): string {
  return `${householdApiBase()}/events`;
}
