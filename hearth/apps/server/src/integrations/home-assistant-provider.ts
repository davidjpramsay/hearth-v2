export type AllowedHomeAssistantScript =
  'script.hearth_evening' | 'script.hearth_goodnight' | 'script.hearth_screen_off';

export interface HomeAssistantSnapshot {
  occupied: boolean;
  televisionPower: 'on' | 'standby';
  hearthForeground: boolean;
  protectedMediaActive: boolean;
  observedAt: string;
}

export interface HomeAssistantProvider {
  readonly configured: boolean;
  readHouseholdState(): Promise<HomeAssistantSnapshot>;
  runScript(script: AllowedHomeAssistantScript): Promise<void>;
  reset?(): void;
}

export class HomeAssistantUnavailableError extends Error {
  constructor(message = 'Home Assistant is unavailable.') {
    super(message);
    this.name = 'HomeAssistantUnavailableError';
  }
}

const DEMO_SNAPSHOT: HomeAssistantSnapshot = {
  occupied: true,
  televisionPower: 'on',
  hearthForeground: true,
  protectedMediaActive: false,
  observedAt: '2026-08-03T07:42:00+08:00',
};

export class FakeHomeAssistantProvider implements HomeAssistantProvider {
  readonly configured = true;
  readonly calls: AllowedHomeAssistantScript[] = [];
  private snapshot = structuredClone(DEMO_SNAPSHOT);

  async readHouseholdState(): Promise<HomeAssistantSnapshot> {
    return structuredClone(this.snapshot);
  }

  async runScript(script: AllowedHomeAssistantScript): Promise<void> {
    this.calls.push(script);
    if (script === 'script.hearth_screen_off') {
      this.snapshot.televisionPower = 'standby';
      this.snapshot.observedAt = new Date().toISOString();
    }
  }

  setProtectedMediaActive(active: boolean): void {
    this.snapshot.protectedMediaActive = active;
  }

  reset(): void {
    this.calls.length = 0;
    this.snapshot = structuredClone(DEMO_SNAPSHOT);
  }
}

export class UnconfiguredHomeAssistantProvider implements HomeAssistantProvider {
  readonly configured = false;

  async readHouseholdState(): Promise<HomeAssistantSnapshot> {
    throw new HomeAssistantUnavailableError('Home Assistant is not configured.');
  }

  async runScript(_script: AllowedHomeAssistantScript): Promise<void> {
    throw new HomeAssistantUnavailableError('Home Assistant is not configured.');
  }
}
