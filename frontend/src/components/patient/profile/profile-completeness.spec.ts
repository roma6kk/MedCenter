import { accountFixture, patientProfileFixture } from '../cabinet-fixtures';
import { computeCompleteness, phoneOf } from './profile-completeness';

describe('computeCompleteness', () => {
  it('should be 100 % with nothing missing when birth date, sex, a phone and an e-mail are there', () => {
    expect(computeCompleteness(patientProfileFixture(), accountFixture())).toEqual({ score: 100, missing: [] });
  });

  it('should name the phone and drop to 75 % when the card has no phone contact', () => {
    const patient = patientProfileFixture({ telecom: [{ system: 'email', value: 'a@b.test' }] });
    expect(computeCompleteness(patient, accountFixture())).toEqual({ score: 75, missing: ['phone'] });
  });

  it('should not count an empty phone value or an unknown sex as filled', () => {
    const patient = patientProfileFixture({ gender: 'unknown', telecom: [{ system: 'phone', value: ' ' }] });
    expect(computeCompleteness(patient, accountFixture()).missing).toEqual(['gender', 'phone']);
  });

  it('should take the e-mail from the account when the card carries none', () => {
    const patient = patientProfileFixture({ telecom: [{ system: 'phone', value: '+375291234567' }] });
    expect(computeCompleteness(patient, accountFixture()).missing).toEqual([]);
    expect(computeCompleteness(patient, null).missing).toEqual(['email']);
  });

  it('should count everything the card would hold as missing when there is no card', () => {
    expect(computeCompleteness(null, accountFixture())).toEqual({ score: 25, missing: ['birthDate', 'gender', 'phone'] });
    expect(computeCompleteness(undefined, undefined).score).toBe(0);
  });
});

describe('phoneOf', () => {
  it('should return the phone value or undefined', () => {
    expect(phoneOf(patientProfileFixture())).toBe('+375291234567');
    expect(phoneOf(patientProfileFixture({ telecom: [] }))).toBeUndefined();
    expect(phoneOf(null)).toBeUndefined();
  });
});
