import { idFromLocation, referenceId } from './fhir-transaction';

describe('referenceId', () => {
  it('should return the logical id when the reference is relative', () => {
    const reference = 'Slot/slot-1';

    const id = referenceId(reference);

    expect(id).toBe('slot-1');
  });

  it('should return the logical id, not the version, when the reference is versioned', () => {
    const reference = 'Slot/slot-1/_history/4';

    const id = referenceId(reference);

    expect(id).toBe('slot-1');
  });

  it('should return an empty id when the value is not a reference', () => {
    const values: readonly unknown[] = [undefined, 42, '', 'not a reference'];

    const ids = values.map(referenceId);

    expect(ids).toEqual(['', '', '', '']);
  });
});

describe('idFromLocation', () => {
  it('should return the created id when the location is relative and versioned', () => {
    const location = 'Appointment/apt-1/_history/1';

    const id = idFromLocation(location);

    expect(id).toBe('apt-1');
  });

  it('should return the created id when HAPI answers with an absolute location', () => {
    const location = 'http://hapi:8080/fhir/Appointment/apt-1/_history/1';

    const id = idFromLocation(location);

    expect(id).toBe('apt-1');
  });

  it('should return an empty id when the location is missing', () => {
    const location = undefined;

    const id = idFromLocation(location);

    expect(id).toBe('');
  });
});
