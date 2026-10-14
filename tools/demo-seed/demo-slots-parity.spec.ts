import { planSlots } from '../../apps/catalog-service/src/modules/schedules/slot-planner';
import { SCHEDULES } from './demo-catalog';
import { windowsOf } from './demo-resources';
import { expandSlotIntervals } from './demo-slots';

/**
 * Parity with catalog-service. The seed writes slots itself and the service
 * generates them on `POST /admin/schedules/{id}/slots` from the *stored* weekly
 * windows. If the two disagree about what a window means (clinic time vs UTC,
 * which weekday), the admin button lays a second, overlapping grid over the
 * seeded one. These tests run the service's own planner (`planSlots`) over the
 * windows the seed stores and require the same slots.
 */

interface Horizon {
  readonly from: string;
  readonly to: string;
}

const HORIZONS: readonly Horizon[] = [
  { from: '2026-11-02', to: '2026-11-15' },
  /** Starts on a Sunday and crosses a month and a year boundary. */
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

/** What `POST /admin/schedules/{id}/slots` with `{ from, to }` (date-only strings) plans for the stored windows. */
function plannedByService(schedule: (typeof SCHEDULES)[number], horizon: Horizon): Array<{ start: string; end: string }> {
  return planSlots(Date.parse(horizon.from), Date.parse(horizon.to), windowsOf(schedule), schedule.slotDurationMin);
}

describe('seed slots vs catalog-service planSlots', () => {
  describe.each(HORIZONS)('horizon $from..$to', (horizon) => {
    it.each(SCHEDULES.map((schedule) => [schedule.key, schedule] as const))(
      'should plan the same slots as the service when schedule %s is expanded',
      (_key, schedule) => {
        // Arrange
        const windows = windowsOf(schedule);

        // Act
        const seeded = expandSlotIntervals(horizon.from, horizon.to, windows, schedule.slotDurationMin);

        // Assert
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
      // Arrange
      const [first] = plannedByService(schedule, HORIZONS[0] as Horizon);

      // Act
      const clock = clinicClock(first?.start ?? '');

      // Assert
      expect(clock).toBe(schedule.localStart);
    },
  );

  it.each(SCHEDULES.map((schedule) => [schedule.key, schedule] as const))(
    'should end the last slot of schedule %s inside its clinic end hour when read in Europe/Minsk',
    (_key, schedule) => {
      // Arrange
      const slots = plannedByService(schedule, HORIZONS[0] as Horizon);
      const last = slots[slots.length - 1];

      // Act
      const clock = clinicClock(last?.end ?? '');

      // Assert
      expect(clock <= schedule.localEnd).toBe(true);
    },
  );
});
