import { buildIcs, downloadIcs } from './ics';

const EVENT = {
  uid: 'appt-1@lifeline',
  start: '2026-10-27T07:00:00.000Z',
  end: '2026-10-27T07:30:00.000Z',
  summary: 'Приём в клинике «Лайфлайн»',
  location: 'г. Минск, ул. Здоровья, 12',
  description: 'Врач: Мария Иванова. Услуга: Приём терапевта',
  stamp: new Date('2026-10-26T10:00:00.000Z'),
} as const;

describe('buildIcs', () => {
  it('should write one VEVENT with UTC start and end when an appointment is given', () => {
    const text = buildIcs(EVENT);

    expect(text).toContain('BEGIN:VCALENDAR\r\n');
    expect(text).toContain('\r\nUID:appt-1@lifeline\r\n');
    expect(text).toContain('\r\nDTSTART:20261027T070000Z\r\n');
    expect(text).toContain('\r\nDTEND:20261027T073000Z\r\n');
    expect(text).toContain('\r\nDTSTAMP:20261026T100000Z\r\n');
    expect(text.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(text.match(/BEGIN:VEVENT/g)).toHaveLength(1);
  });

  it('should escape commas and semicolons in text values when the address has them', () => {
    const text = buildIcs({ ...EVENT, location: 'г. Минск, ул. Здоровья; 12' });

    expect(text.replace(/\r\n /g, '')).toContain('LOCATION:г. Минск\\, ул. Здоровья\\; 12');
  });

  it('should escape a line break inside a value when the description has one', () => {
    const text = buildIcs({ ...EVENT, description: 'строка 1\nстрока 2' });

    expect(text).toContain('DESCRIPTION:строка 1\\nстрока 2');
  });

  it('should fold a line longer than 75 octets without cutting a character when the text is Cyrillic', () => {
    const text = buildIcs({ ...EVENT, summary: 'Приём '.repeat(30).trim() });

    const lines = text.split('\r\n');
    expect(lines.every((line) => Buffer.byteLength(line) <= 75)).toBe(true);
    expect(text.replace(/\r\n /g, '')).toContain(`SUMMARY:${'Приём '.repeat(30).trim()}`);
  });

  it('should leave out location and description when they are not given', () => {
    const { location: _location, description: _description, ...bare } = EVENT;

    const text = buildIcs(bare);

    expect(text).not.toContain('LOCATION');
    expect(text).not.toContain('DESCRIPTION');
  });

  it('should refuse a start that is not a date when the appointment is broken', () => {
    expect(() => buildIcs({ ...EVENT, start: 'soon' })).toThrow(RangeError);
  });
});

describe('downloadIcs', () => {
  it('should click a download link with the file name and release the object URL when the file is handed over', () => {
    jest.useFakeTimers();
    const create = jest.fn(() => 'blob:ics');
    const revoke = jest.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('visit.ics');
      expect(this.href).toBe('blob:ics');
    });

    downloadIcs('visit.ics', 'BEGIN:VCALENDAR');
    jest.runAllTimers();

    expect(click).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith('blob:ics');
    click.mockRestore();
    jest.useRealTimers();
  });
});
