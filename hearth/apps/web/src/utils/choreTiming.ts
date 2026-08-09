interface TimeParts {
  clock: string;
  dayPeriod: string;
}

export function formatChoreTiming(
  availableFromTime: string | null,
  dueTime: string | null,
): string | null {
  if (availableFromTime === null && dueTime === null) return null;
  if (availableFromTime === null) return `Due ${formatLocalTime(dueTime!)}`;
  if (dueTime === null) return `From ${formatLocalTime(availableFromTime)}`;

  const start = timeParts(availableFromTime);
  const end = timeParts(dueTime);
  return start.dayPeriod === end.dayPeriod
    ? `${start.clock}–${end.clock} ${end.dayPeriod}`
    : `${start.clock} ${start.dayPeriod}–${end.clock} ${end.dayPeriod}`;
}

export function formatLocalTime(localTime: string): string {
  const parts = timeParts(localTime);
  return `${parts.clock} ${parts.dayPeriod}`;
}

function timeParts(localTime: string): TimeParts {
  const formatted = new Intl.DateTimeFormat('en-AU', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'UTC',
  }).formatToParts(new Date(`2000-01-01T${localTime}:00.000Z`));
  const hour = formatted.find((part) => part.type === 'hour')?.value ?? '';
  const minute = formatted.find((part) => part.type === 'minute')?.value ?? '';
  const dayPeriod = formatted.find((part) => part.type === 'dayPeriod')?.value ?? '';
  return { clock: `${hour}:${minute}`, dayPeriod };
}
