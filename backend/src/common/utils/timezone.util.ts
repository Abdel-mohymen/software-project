import { BadRequestException } from '@nestjs/common';

export function parseLocalAirportTimeToUtc(localDateTimeStr: string, ianaTimeZone: string): Date {
  // Expected format: YYYY-MM-DDTHH:mm or YYYY-MM-DDTHH:mm:ss
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(
    localDateTimeStr.trim(),
  );
  if (!match) {
    const parsed = new Date(localDateTimeStr);
    if (isNaN(parsed.getTime())) {
      throw new BadRequestException(`Invalid date-time format: ${localDateTimeStr}`);
    }
    return parsed;
  }

  const [, year, month, day, hour, minute, second = '00'] = match;
  const utcGuess = new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    ),
  );

  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: ianaTimeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    const parts = formatter.formatToParts(utcGuess);
    const partMap: Record<string, number> = {};
    for (const part of parts) {
      if (part.type !== 'literal') {
        partMap[part.type] = Number(part.value);
      }
    }

    const tzHour = partMap.hour === 24 ? 0 : partMap.hour;
    const zonedTimestamp = Date.UTC(
      partMap.year,
      partMap.month - 1,
      partMap.day,
      tzHour,
      partMap.minute,
      partMap.second,
    );

    const offsetMs = zonedTimestamp - utcGuess.getTime();
    return new Date(utcGuess.getTime() - offsetMs);
  } catch {
    throw new BadRequestException(`Invalid IANA time zone: ${ianaTimeZone}`);
  }
}

export function formatUtcToLocalAirportTime(utcDate: Date, ianaTimeZone: string): string {
  try {
    const formatter = new Intl.DateTimeFormat('sv-SE', {
      timeZone: ianaTimeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    return formatter.format(new Date(utcDate)).replace(' ', 'T');
  } catch {
    return new Date(utcDate).toISOString();
  }
}

export function getLocalDateString(utcDate: Date, ianaTimeZone: string): string {
  return formatUtcToLocalAirportTime(utcDate, ianaTimeZone).slice(0, 10);
}
