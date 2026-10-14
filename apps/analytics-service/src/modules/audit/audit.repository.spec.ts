import { QueryFailedError } from 'typeorm';

import { isRowRejection } from './audit.repository';

describe('isRowRejection', () => {
  it.each([
    ['22001', 'a value too long for its column'],
    ['22021', 'a byte sequence outside the encoding'],
    ['22008', 'a timestamp out of range'],
    ['23514', 'a CHECK violation'],
    ['23502', 'a NOT NULL violation'],
  ])('should recognise SQLSTATE %s as a rejected row when the database refuses %s', (code) => {
    expect(isRowRejection(Object.assign(new Error('rejected'), { code }))).toBe(true);
  });

  it.each([
    ['ECONNREFUSED', 'the connection was refused'],
    ['57P01', 'the server is shutting down'],
    ['40P01', 'a deadlock was detected'],
    ['53300', 'there are too many connections'],
    ['08006', 'the connection failed'],
  ])('should not treat %s as a rejected row when it means %s', (code) => {
    expect(isRowRejection(Object.assign(new Error('outage'), { code }))).toBe(false);
  });

  it('should read the SQLSTATE from the driver error when TypeORM wraps it in a QueryFailedError', () => {
    const driverError = Object.assign(new Error('value too long for type character varying(128)'), { code: '22001' });

    expect(isRowRejection(new QueryFailedError('INSERT ...', [], driverError))).toBe(true);
  });

  it.each([[undefined], [null], ['22001'], [42], [new Error('no code')]])(
    'should answer false when the thrown value %p carries no SQLSTATE',
    (value) => {
      expect(isRowRejection(value)).toBe(false);
    },
  );
});
