import { appointment } from './doctor-test-utils';
import { findPatients, patientsOf, type PatientHit } from './patient-search-model';

const HITS: ReadonlyArray<PatientHit> = [
  { patientId: 'p1', name: 'Кузнецов Павел', lastVisit: '2026-10-27T07:00:00Z' },
  { patientId: 'p2', name: 'Лебедева Алёна', lastVisit: '2026-10-20T07:00:00Z' },
  { patientId: 'p3', name: 'Кузнецова Ольга', lastVisit: '2026-09-01T07:00:00Z' },
];

describe('patientsOf', () => {
  it('should list each patient once with the newest visit, the most recent patient first', () => {
    const visits = [
      appointment({ id: 'a1', patientId: 'p1', patientName: 'Кузнецов Павел', start: '2026-09-01T07:00:00Z' }),
      appointment({ id: 'a2', patientId: 'p2', patientName: 'Лебедева Алёна', start: '2026-10-20T07:00:00Z' }),
      appointment({ id: 'a3', patientId: 'p1', patientName: 'Кузнецов Павел', start: '2026-10-27T07:00:00Z' }),
    ];

    expect(patientsOf(visits)).toEqual([
      { patientId: 'p1', name: 'Кузнецов Павел', lastVisit: '2026-10-27T07:00:00Z' },
      { patientId: 'p2', name: 'Лебедева Алёна', lastVisit: '2026-10-20T07:00:00Z' },
    ]);
  });

  it('should leave out a patient whose card the doctor cannot open and a row without a name', () => {
    const visits = [
      appointment({ id: 'a1', patientId: 'p1', status: 'cancelled' }),
      appointment({ id: 'a2', patientId: 'p2', status: 'noshow' }),
      appointment({ id: 'a3', patientId: 'p3', patientName: undefined }),
      appointment({ id: 'a4', patientId: 'p4', status: 'fulfilled', patientName: 'Новиков Игорь' }),
    ];

    expect(patientsOf(visits).map((hit) => hit.patientId)).toEqual(['p4']);
  });
});

describe('findPatients', () => {
  it('should find by a part of the surname without regard to case', () => {
    expect(findPatients(HITS, 'кузн').map((hit) => hit.patientId)).toEqual(['p1', 'p3']);
  });

  it('should require every word of the query and accept them in any order', () => {
    expect(findPatients(HITS, 'павел кузнецов').map((hit) => hit.patientId)).toEqual(['p1']);
  });

  it('should treat ё and е as the same letter', () => {
    expect(findPatients(HITS, 'алена').map((hit) => hit.patientId)).toEqual(['p2']);
  });

  it('should find nothing for a query shorter than two characters or a stranger', () => {
    expect(findPatients(HITS, 'к')).toEqual([]);
    expect(findPatients(HITS, 'сидоров')).toEqual([]);
  });
});
