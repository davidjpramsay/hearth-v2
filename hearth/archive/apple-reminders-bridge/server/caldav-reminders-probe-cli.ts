import { probeCalDavReminderCapabilities } from './integrations/caldav-reminders-capability-probe.js';
import { readCalendarRuntimeConfig } from './integrations/calendar-runtime.js';

void main();

async function main(): Promise<void> {
  const configPath = process.env.HEARTH_CALENDAR_CONFIG_PATH;
  try {
    const sampleLimit = parseSampleLimit(process.env.HEARTH_REMINDERS_PROBE_SAMPLE_LIMIT);
    if (process.env.HEARTH_MODE !== 'private') {
      throw new Error('The CalDAV reminders probe runs only while HEARTH_MODE=private.');
    }
    if (configPath === undefined || configPath.trim().length === 0) {
      throw new Error('HEARTH_CALENDAR_CONFIG_PATH is not configured.');
    }
    const config = await readCalendarRuntimeConfig(configPath);
    const result = await probeCalDavReminderCapabilities({
      serverUrl: config.serverUrl,
      username: config.username,
      appPassword: config.appPassword,
      ...(sampleLimit === undefined ? {} : { sampleLimit }),
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'Calendar reminder capabilities could not be checked safely.'}\n`,
    );
    process.exitCode = 1;
  }
}

function parseSampleLimit(value: string | undefined): number | undefined {
  if (value === undefined || value.trim().length === 0) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error('HEARTH_REMINDERS_PROBE_SAMPLE_LIMIT must be a whole number from 0 to 10.');
  }
  return parsed;
}
