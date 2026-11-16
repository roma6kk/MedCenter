import type { ClinicDetails, ClinicStore } from '../clinic.store';

export const SEEDED_CLINIC: ClinicDetails = {
  name: 'ООО «Лайфлайн»',
  phone: '+375 17 000-00-00',
  email: 'info@lifeline.example',
  address: 'г. Минск, ул. Здоровья, 12',
  hours: 'Пн–Пт 08:00–20:00, сб 09:00–15:00',
};

export class InMemoryClinicStore implements ClinicStore {
  private details: ClinicDetails = SEEDED_CLINIC;

  async get(): Promise<ClinicDetails> {
    return this.details;
  }

  async update(changes: Partial<ClinicDetails>): Promise<ClinicDetails> {
    this.details = { ...this.details, ...changes };
    return this.details;
  }
}
