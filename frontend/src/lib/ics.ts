export interface IcsEvent {
  readonly uid: string;
  readonly start: string;
  readonly end: string;
  readonly summary: string;
  readonly location?: string;
  readonly description?: string;
  readonly stamp?: Date;
}

const LINE_BREAK = '\r\n';
const MAX_LINE_OCTETS = 75;

function utcStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function escapeText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

function utf8Length(char: string): number {
  const code: number = char.codePointAt(0) ?? 0;
  if (code < 0x80) return 1;
  if (code < 0x800) return 2;
  return code < 0x10000 ? 3 : 4;
}

function fold(line: string): string {
  const parts: string[] = [];
  let current = '';
  let octets = 0;
  for (const char of line) {
    const size: number = utf8Length(char);
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

export function downloadIcs(fileName: string, content: string): void {
  const url: string = URL.createObjectURL(new Blob([content], { type: 'text/calendar;charset=utf-8' }));
  const link: HTMLAnchorElement = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
