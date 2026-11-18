import { planSlots } from '../../apps/catalog-service/src/modules/schedules/slot-planner';
import { SCHEDULES } from './demo-catalog';
import { windowsOf } from './demo-resources';
import { expandSlotIntervals } from './demo-slots';

interface Horizon {
  readonly from: string;
  readonly to: string;
}

const HORIZONS: readonly Horizon[] = [
  { from: '2026-11-02', to: '2026-11-15' },
  { from: '2026-12-27', to: '2027-01-09' },
  { from: '2026-11-03', to: '2026-11-03' },
];

const MINSK = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Minsk',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function clinicClock(isoInstant: string): string {
  return MINSK.format(new Date(isoInstant));
}

function plannedByService(schedule: (typeof SCHEDULES)[number], horizon: Horizon): Array<{ start: string; end: string }> {
  return planSlots(Date.parse(horizon.from), Date.parse(horizon.to), windowsOf(schedule), schedule.slotDurationMin);
}

describe('seed slots vs catalog-service planSlots', () => {
  describe.each(HORIZONS)('horizon $from..$to', (horizon) => {
    it.each(SCHEDULES.map((schedule) => [schedule.key, schedule] as const))(
      'should plan the same slots as the service when schedule %s is expanded',
      (_key, schedule) => {
        const windows = windowsOf(schedule);

        const seeded = expandSlotIntervals(horizon.from, horizon.to, windows, schedule.slotDurationMin);

        expect(seeded).toEqual(plannedByService(schedule, horizon));
      },
    );
  });

  it('should have slots to compare when a 14-day horizon is expanded', () => {
    const total = SCHEDULES.map((schedule) => plannedByService(schedule, HORIZONS[0] as Horizon).length);

    expect(total.every((count) => count > 0)).toBe(true);
  });

  it.each(SCHEDULES.map((schedule) => [schedule.key, schedule] as const))(
    'should start the first slot of schedule %s at its clinic start hour when read in Europe/Minsk',
    (_key, schedule) => {
      const [first] = plannedByService(schedule, HORIZONS[0] as Horizon);

      const clock = clinicClock(first?.start ?? '');

      expect(clock).toBe(schedule.localStart);
    },
  );

  it.each(SCHEDULES.map((schedule) => [schedule.key, schedule] as const))(
    'should end the last slot of schedule %s inside its clinic end hour when read in Europe/Minsk',
    (_key, schedule) => {
      const slots = plannedByService(schedule, HORIZONS[0] as Horizon);
      const last = slots[slots.length - 1];

      const clock = clinicClock(last?.end ?? '');

      expect(clock <= schedule.localEnd).toBe(true);
    },
  );
});
