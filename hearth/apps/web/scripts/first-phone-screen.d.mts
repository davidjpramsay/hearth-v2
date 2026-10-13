export function createFirstPhoneScreen(options: {
  keyFile: string;
  origin: string;
  fetchStatus?: typeof fetch;
}): Promise<{ url: string; close(): Promise<void> }>;
