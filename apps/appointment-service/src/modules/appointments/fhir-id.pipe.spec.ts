import { BadRequestException } from '@nestjs/common';

import { FhirIdPipe } from './fhir-id.pipe';

describe('FhirIdPipe', () => {
  const pipe = new FhirIdPipe();

  it.each(['apt-1', '1001', '7c9e6679-7425-40de-944b-e07fc1f90ae7'])('should return the id unchanged when it is %s', (id) => {
    expect(pipe.transform(id)).toBe(id);
  });

  it.each(['..', '.', 'a,b', 'a/b', '', 'x'.repeat(65)])('should throw VALIDATION_ERROR when the id is %j', (id) => {
    // Arrange
    const act = (): string => pipe.transform(id);

    // Act + Assert
    expect(act).toThrow(BadRequestException);
    expect(act).toThrow(expect.objectContaining({ response: expect.objectContaining({ errorCode: 'VALIDATION_ERROR' }) }));
  });
});
