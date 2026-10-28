/**
 * ics — a single appointment as an iCalendar file (RFC 5545), built in the browser so nothing about the visit leaves it.
 * Times go out as UTC instants, which every calendar app converts to the zone of its own user; the clinic's wall clock is
 * what the visit page shows. Only what the patient already sees on the screen is written: when, where, with whom.
 */

export interface IcsEvent {
  /** Stable id of the event, so adding the file twice updates one entry instead of duplicating it. */
  readonly uid: string;
  /** RFC 3339 instants. */
  readonly start: string;
  readonly end: string;
  readonly summary: string;
  readonly location?: string;
  readonly description?: string;
  /** The moment the file was made (`DTSTAMP`); now by default. */
  readonly stamp?: Date;
}

const LINE_BREAK = '\r\n';
const MAX_LINE_OCTETS = 75;

/** `20261027T070000Z` */
function utcStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** Text values escape backslash, semicolon, comma and line breaks (RFC 5545 §3.3.11). */
function escapeText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Bytes of one character in UTF-8 (no `TextEncoder`: older test and embedded engines lack it). */
function utf8Length(char: string): number {
  const code: number = char.codePointAt(0) ?? 0;
  if (code < 0x80) return 1;
  if (code < 0x800) return 2;
  return code < 0x10000 ? 3 : 4;
}

/** A content line longer than 75 octets continues on the next line after a space; a multi-byte character is never cut in two. */
function fold(line: string): string {
  const parts: string[] = [];
  let current = '';
  let octets = 0;
  for (const char of line) {
    const size: number = utf8Length(char);
    // A continuation line starts with a space, which counts toward its 75 octets.
    const limit: number = parts.length === 0 ? MAX_LINE_OCTETS : MAX_LINE_OCTETS - 1;
    if (octets + size > limit) {
      parts.push(current);
      current = '';
      octets = 0;
    }
    current += char;
    octets += size;
  }
  parts.push(current);
  return parts.join(`${LINE_BREAK} `);
}

function asDate(iso: string): Date {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) throw new RangeError(`Not a date: ${iso}`);
  return date;
}

/** The text of the `.ics` file of one event. Throws a `RangeError` when `start` or `end` is not a date. */
export function buildIcs(event: IcsEvent): string {
  const lines: ReadonlyArray<string> = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Lifeline//Booking//RU',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `DTSTAMP:${utcStamp(event.stamp ?? new Date())}`,
    `DTSTART:${utcStamp(asDate(event.start))}`,
    `DTEND:${utcStamp(asDate(event.end))}`,
    `SUMMARY:${escapeText(event.summary)}`,
    ...(event.location === undefined ? [] : [`LOCATION:${escapeText(event.location)}`]),
    ...(event.description === undefined ? [] : [`DESCRIPTION:${escapeText(event.description)}`]),
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.map(fold).join(LINE_BREAK)}${LINE_BREAK}`;
}

/** Hands the text to the browser as a file download. */
export function downloadIcs(fileName: string, content: string): void {
  const url: string = URL.createObjectURL(new Blob([content], { type: 'text/calendar;charset=utf-8' }));
  const link: HTMLAnchorElement = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // The download has started by the time the task ends; the URL only needs to outlive the click.
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
