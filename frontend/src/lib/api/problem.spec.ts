import { errorCodeToUx, ERROR_CODES } from './problem';

describe('errorCodeToUx', () => {
  it('should map all 17 catalog codes', () => {
    expect(ERROR_CODES).toHaveLength(17);
  });

  it('should render COMPARTMENT_VIOLATION as 404', () => {
    expect(errorCodeToUx('COMPARTMENT_VIOLATION')).toEqual({ kind: 'not-found' });
  });

  it('should refetch slots on SLOT_CONFLICT', () => {
    expect(errorCodeToUx('SLOT_CONFLICT')).toEqual({ kind: 'slot-conflict' });
  });

  it('should switch the encounter form to read-only on ENCOUNTER_STATE_INVALID', () => {
    expect(errorCodeToUx('ENCOUNTER_STATE_INVALID')).toEqual({ kind: 'encounter-readonly' });
  });
});
