import { idFromLocation, referenceId } from './fhir-transaction';

describe('referenceId', () => {
  it('should return the logical id when the reference is relative', () => {
    // Arrange
    const reference = 'Slot/slot-1';

    // Act
    const id = referenceId(reference);

    // Assert
    expect(id).toBe('slot-1');
  });

  it('should return the logical id, not the version, when the reference is versioned', () => {
    // Arrange
    const reference = 'Slot/slot-1/_history/4';

    // Act
    const id = referenceId(reference);

    // Assert
    expect(id).toBe('slot-1');
  });

  it('should return an empty id when the value is not a reference', () => {
    // Arrange
    const values: readonly unknown[] = [undefined, 42, '', 'not a reference'];

    // Act
    const ids = values.map(referenceId);

    // Assert
    expect(ids).toEqual(['', '', '', '']);
  });
});

describe('idFromLocation', () => {
  it('should return the created id when the location is relative and versioned', () => {
    // Arrange
    const location = 'Appointment/apt-1/_history/1';

    // Act
    const id = idFromLocation(location);

    // Assert
    expect(id).toBe('apt-1');
  });

  it('should return the created id when HAPI answers with an absolute location', () => {
    // Arrange
    const location = 'http://hapi:8080/fhir/Appointment/apt-1/_history/1';

    // Act
    const id = idFromLocation(location);

    // Assert
    expect(id).toBe('apt-1');
  });

  it('should return an empty id when the location is missing', () => {
    // Arrange
    const location = undefined;

    // Act
    const id = idFromLocation(location);

    // Assert
    expect(id).toBe('');
  });
});
