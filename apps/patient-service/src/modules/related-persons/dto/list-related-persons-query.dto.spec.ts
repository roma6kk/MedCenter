import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { ListRelatedPersonsQueryDto } from './list-related-persons-query.dto';

function invalidPropertiesOf(plain: Record<string, unknown>): string[] {
  return validateSync(plainToInstance(ListRelatedPersonsQueryDto, plain)).map((error) => error.property);
}

describe('ListRelatedPersonsQueryDto', () => {
  it('should convert numeric strings when page and pageSize come from the query string', () => {
    const dto = plainToInstance(ListRelatedPersonsQueryDto, { page: '2', pageSize: '50' });

    expect(validateSync(dto)).toEqual([]);
    expect(dto).toMatchObject({ page: 2, pageSize: 50 });
  });

  it('should default to page 1 of 20 when no paging is supplied', () => {
    expect(plainToInstance(ListRelatedPersonsQueryDto, {})).toMatchObject({ page: 1, pageSize: 20 });
  });

  it('should reject a pageSize above 100 when validating', () => {
    expect(invalidPropertiesOf({ pageSize: '101' })).toEqual(['pageSize']);
  });

  it('should reject a page below 1 when validating', () => {
    expect(invalidPropertiesOf({ page: '0' })).toEqual(['page']);
  });

  it('should reject a page above 1000 when validating', () => {
    expect(invalidPropertiesOf({ page: '1001' })).toEqual(['page']);
  });

  it('should reject a non-numeric page when validating', () => {
    expect(invalidPropertiesOf({ page: 'abc' })).toEqual(['page']);
  });

  it('should reject a fractional page when validating', () => {
    expect(invalidPropertiesOf({ page: '1.5' })).toEqual(['page']);
  });

  it('should reject a pageSize below 1 when validating', () => {
    expect(invalidPropertiesOf({ pageSize: '0' })).toEqual(['pageSize']);
  });

  it('should accept the boundaries page 1000 and pageSize 100 when validating', () => {
    expect(invalidPropertiesOf({ page: '1000', pageSize: '100' })).toEqual([]);
  });
});
