import { doctorLabel, formatDoctorName, normalizeDoctorName } from './doctor-name';

describe('doctor-name', () => {
  it('should write surname, name and patronymic in that order when the patronymic is known', () => {
    expect(formatDoctorName({ lastName: 'Иванова', firstName: 'Мария', middleName: 'Сергеевна' })).toBe('Иванова Мария Сергеевна');
  });

  it('should leave the patronymic out when it is not known', () => {
    expect(formatDoctorName({ lastName: 'Иванова', firstName: 'Мария' })).toBe('Иванова Мария');
    expect(formatDoctorName({ lastName: 'Иванова', firstName: 'Мария', middleName: '  ' })).toBe('Иванова Мария');
  });

  it('should tidy a name that came as one string', () => {
    expect(normalizeDoctorName('  Иванова   Мария  Сергеевна ')).toBe('Иванова Мария Сергеевна');
    expect(normalizeDoctorName(undefined)).toBe('');
  });

  it('should show a catalog doctor as surname and name, not name and surname', () => {
    expect(doctorLabel({ lastName: 'Иванова', firstName: 'Мария', name: 'Мария Иванова' })).toBe('Иванова Мария');
  });

  it('should fall back to the ready-made name when the parts are empty', () => {
    expect(doctorLabel({ lastName: '', firstName: '', name: 'Мария Иванова' })).toBe('Мария Иванова');
  });
});
