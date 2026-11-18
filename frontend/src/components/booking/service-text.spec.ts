import { isRedundantDescription, visibleDescription } from './service-text';

describe('isRedundantDescription', () => {
  it.each([
    ['Приём терапевта (первичный)', 'Первичная консультация терапевта'],
    ['Приём терапевта (повторный)', 'Повторная консультация терапевта'],
    ['Приём кардиолога (первичный)', 'Первичная консультация кардиолога'],
    ['Приём хирурга (первичный)', 'Первичная консультация врача-хирурга'],
  ])('should call the description of "%s" a repeat when it only rewords the title', (name, description) => {
    expect(isRedundantDescription(name, description)).toBe(true);
  });

  it.each([
    ['Therapist appointment (initial)', 'Initial consultation with a therapist'],
    ['Therapist appointment (follow-up)', 'Follow-up consultation with a therapist'],
    ['Cardiologist appointment (initial)', 'Initial consultation with a cardiologist'],
    ['Surgeon appointment (initial)', 'Initial consultation with a surgeon'],
  ])('should call the English description of "%s" a repeat when it only rewords the title', (name, description) => {
    expect(isRedundantDescription(name, description)).toBe(true);
  });

  it('should keep an English description that says something the title does not', () => {
    expect(isRedundantDescription('Electrocardiography (ECG)', 'Resting ECG with interpretation')).toBe(false);
  });

  it('should keep a description that says something the title does not', () => {
    expect(isRedundantDescription('Электрокардиография (ЭКГ)', 'ЭКГ в покое с расшифровкой')).toBe(false);
  });

  it('should keep a description about another subject when the words differ', () => {
    expect(isRedundantDescription('Приём терапевта (первичный)', 'Включает измерение давления и осмотр')).toBe(false);
  });
});

describe('visibleDescription', () => {
  it('should hide a missing, blank or repeated description', () => {
    expect(visibleDescription('Приём терапевта', undefined)).toBeUndefined();
    expect(visibleDescription('Приём терапевта', '   ')).toBeUndefined();
    expect(visibleDescription('Приём терапевта (первичный)', 'Первичная консультация терапевта')).toBeUndefined();
  });

  it('should return the trimmed text when it adds information', () => {
    expect(visibleDescription('Электрокардиография (ЭКГ)', ' ЭКГ в покое с расшифровкой ')).toBe('ЭКГ в покое с расшифровкой');
  });
});
