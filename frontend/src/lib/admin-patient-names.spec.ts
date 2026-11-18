import { recallPatientName, rememberPatientNames } from './admin-patient-names';

describe('admin-patient-names', () => {
  beforeEach(() => window.sessionStorage.clear());

  it('should give back the name of a patient that the user list showed', () => {
    rememberPatientNames([{ patientId: 'p1', name: 'Иванова Мария' }, { patientId: 'p2', name: 'Петров Пётр' }]);

    expect(recallPatientName('p1')).toBe('Иванова Мария');
    expect(recallPatientName('p3')).toBeUndefined();
  });

  it('should keep the names of earlier pages when another page is remembered', () => {
    rememberPatientNames([{ patientId: 'p1', name: 'Иванова Мария' }]);
    rememberPatientNames([{ patientId: 'p2', name: 'Петров Пётр' }]);

    expect(recallPatientName('p1')).toBe('Иванова Мария');
  });

  it('should answer nothing when the stored value is damaged or storage throws', () => {
    window.sessionStorage.setItem('medcenter.adminPatientNames', '{broken');
    expect(recallPatientName('p1')).toBeUndefined();
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(recallPatientName('p1')).toBeUndefined();
    jest.restoreAllMocks();
  });
});
