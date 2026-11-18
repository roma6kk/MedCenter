import { rememberStartedEncounter, startedEncounterOf } from './started-encounters';

describe('started-encounters', () => {
  beforeEach(() => window.localStorage.clear());

  it('should answer null for an appointment this browser never opened', () => {
    expect(startedEncounterOf('appt-1')).toBeNull();
  });

  it('should return the encounter it remembered and replace it when the same appointment is opened again', () => {
    rememberStartedEncounter('appt-1', 'enc-1');
    rememberStartedEncounter('appt-1', 'enc-2');

    expect(startedEncounterOf('appt-1')).toBe('enc-2');
  });

  it('should drop the oldest entries first when the list grows past its cap', () => {
    for (let index = 0; index < 55; index += 1) rememberStartedEncounter(`appt-${index}`, `enc-${index}`);

    expect(startedEncounterOf('appt-0')).toBeNull();
    expect(startedEncounterOf('appt-54')).toBe('enc-54');
    expect(Object.keys(JSON.parse(window.localStorage.getItem('medcenter.startedEncounters') ?? '{}'))).toHaveLength(50);
  });

  it('should treat damaged storage as empty and never throw', () => {
    window.localStorage.setItem('medcenter.startedEncounters', '{not json');

    expect(startedEncounterOf('appt-1')).toBeNull();
    expect(() => rememberStartedEncounter('appt-1', 'enc-1')).not.toThrow();
    expect(startedEncounterOf('appt-1')).toBe('enc-1');
  });
});
