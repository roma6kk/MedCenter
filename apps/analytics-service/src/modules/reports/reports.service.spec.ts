import type { ClinicalReportSource } from './clinical-report.source';
import type { ReportsRepository } from './reports.repository';
import { ReportsService } from './reports.service';

const NOW = new Date('2026-10-13T08:00:00.000Z');
const range = { from: '2026-01-01', to: '2026-12-31' };

describe('ReportsService', () => {
  let repository: jest.Mocked<ReportsRepository>;
  let clinical: jest.Mocked<ClinicalReportSource>;
  let reportsService: ReportsService;

  beforeEach(() => {
    repository = {
      countAppointmentsByStatus: jest.fn().mockResolvedValue([]),
      countEncountersBySpecialty: jest.fn().mockResolvedValue([]),
      countBookingsByService: jest.fn().mockResolvedValue([]),
    };
    clinical = {
      noShowAppointmentIds: jest.fn().mockResolvedValue([]),
      serviceNames: jest.fn().mockResolvedValue(new Map()),
    };
    reportsService = new ReportsService(repository, clinical, () => NOW);
  });

  describe('appointmentsSummary', () => {
    it('should reject a date range longer than 366 days', async () => {
      await expect(reportsService.appointmentsSummary({ from: '2024-01-01', to: '2026-12-31' })).rejects.toThrow('range');
      expect(repository.countAppointmentsByStatus).not.toHaveBeenCalled();
    });

    it('should group appointments by status when the read-model returns string counts', async () => {
      repository.countAppointmentsByStatus.mockResolvedValue([{ status: 'booked', count: '12' }]);

      const summary = await reportsService.appointmentsSummary(range);

      expect(summary.groups).toEqual([
        { code: 'booked', display: 'Записано', count: 12 },
        { code: 'cancelled', display: 'Отменено', count: 0 },
        { code: 'noshow', display: 'Неявка', count: 0 },
      ]);
    });

    it('should report the no-shows the read-model reclassified when HAPI lists their ids', async () => {
      clinical.noShowAppointmentIds.mockResolvedValue(['apt-1', 'apt-2']);
      repository.countAppointmentsByStatus.mockResolvedValue([
        { status: 'booked', count: '8' },
        { status: 'cancelled', count: '3' },
        { status: 'noshow', count: '2' },
      ]);

      const summary = await reportsService.appointmentsSummary(range);

      expect(summary).toMatchObject({ booked: 8, cancelled: 3, noshow: 2, total: 13 });
    });

    it('should hand the HAPI no-show ids to the read-model when it counts, so one statement partitions the population', async () => {
      clinical.noShowAppointmentIds.mockResolvedValue(['apt-1', 'apt-2']);

      await reportsService.appointmentsSummary(range);

      expect(repository.countAppointmentsByStatus).toHaveBeenCalledWith(expect.anything(), ['apt-1', 'apt-2']);
    });

    it('should not count a HAPI no-show the read-model never saw when it is absent from the read-model rows', async () => {
      clinical.noShowAppointmentIds.mockResolvedValue(['unseen-1', 'unseen-2', 'unseen-3']);
      repository.countAppointmentsByStatus.mockResolvedValue([{ status: 'booked', count: '1' }]);

      const summary = await reportsService.appointmentsSummary(range);

      expect(summary).toMatchObject({ booked: 1, cancelled: 0, noshow: 0, total: 1 });
    });

    it('should fail the report when HAPI cannot list the no-shows, rather than guess a count', async () => {
      clinical.noShowAppointmentIds.mockRejectedValue(new Error('HAPI down'));

      await expect(reportsService.appointmentsSummary(range)).rejects.toThrow('HAPI down');
      expect(repository.countAppointmentsByStatus).not.toHaveBeenCalled();
    });

    it('should query the read-model and HAPI with the same half-open period when the range is valid', async () => {
      await reportsService.appointmentsSummary(range);

      const expected = { from: new Date('2026-01-01T00:00:00.000Z'), toExclusive: new Date('2027-01-01T00:00:00.000Z') };
      expect(repository.countAppointmentsByStatus).toHaveBeenCalledWith(expected, []);
      expect(clinical.noShowAppointmentIds).toHaveBeenCalledWith(expected);
    });

    it('should describe the period inclusively like a MeasureReport when the summary is built', async () => {
      const summary = await reportsService.appointmentsSummary(range);

      expect(summary.period).toEqual({ start: '2026-01-01T00:00:00.000Z', end: '2026-12-31T23:59:59.999Z' });
      expect(summary.scoring).toBe('cohort');
      expect(summary.measure).toBe('appointments-by-status');
    });
  });

  describe('encountersSummary', () => {
    it('should group finished encounters by specialty when the read-model returns rows', async () => {
      repository.countEncountersBySpecialty.mockResolvedValue([
        { system: 'http://snomed.info/sct', code: 'cardiology', display: 'Кардиология', count: '5' },
        { system: null, code: 'unknown', display: null, count: '1' },
      ]);

      const summary = await reportsService.encountersSummary(range);

      expect(summary.groups).toEqual([
        { code: 'cardiology', system: 'http://snomed.info/sct', display: 'Кардиология', count: 5 },
        { code: 'unknown', display: 'Специальность не указана', count: 1 },
      ]);
      expect(summary.total).toBe(6);
    });

    it('should keep one group per code system when the same code is coded in two systems', async () => {
      repository.countEncountersBySpecialty.mockResolvedValue([
        { system: 'http://snomed.info/sct', code: '394579002', display: 'Cardiology', count: '3' },
        { system: 'https://fhir.by/CodeSystem/specialty', code: '394579002', display: 'Кардиология', count: '2' },
      ]);

      const summary = await reportsService.encountersSummary(range);

      expect(summary.groups.map((group) => group.system)).toEqual([
        'http://snomed.info/sct',
        'https://fhir.by/CodeSystem/specialty',
      ]);
      expect(summary.total).toBe(5);
    });

    it('should reject an inverted range before touching the read-model when from is after to', async () => {
      await expect(reportsService.encountersSummary({ from: '2026-05-01', to: '2026-04-01' })).rejects.toThrow('range');
      expect(repository.countEncountersBySpecialty).not.toHaveBeenCalled();
    });
  });

  describe('servicesPopularity', () => {
    it('should rank services and label them with HealthcareService names when HAPI resolves them', async () => {
      repository.countBookingsByService.mockResolvedValue([
        { serviceId: 'svc-2', count: '9' },
        { serviceId: 'svc-1', count: '4' },
      ]);
      clinical.serviceNames.mockResolvedValue(new Map([['svc-2', 'УЗИ сердца']]));

      const report = await reportsService.servicesPopularity({ ...range, top: 5 });

      expect(repository.countBookingsByService).toHaveBeenCalledWith(expect.anything(), 5);
      expect(report.groups).toEqual([
        { code: 'svc-2', display: 'УЗИ сердца', count: 9 },
        { code: 'svc-1', count: 4 },
      ]);
    });

    it('should default to the top 10 services when "top" is omitted', async () => {
      await reportsService.servicesPopularity(range);

      expect(repository.countBookingsByService).toHaveBeenCalledWith(expect.anything(), 10);
    });

    it('should skip the HAPI name lookup when no service was booked in the period', async () => {
      await reportsService.servicesPopularity(range);

      expect(clinical.serviceNames).not.toHaveBeenCalled();
    });
  });
});
