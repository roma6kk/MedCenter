import type { CompleteEncounterForm } from '@/lib/contracts';
import { clearAllDrafts, clearDraft, DRAFT_MAX_AGE_MS, isBlankForm, readDraft, writeDraft } from './encounter-draft';

const BLANK: CompleteEncounterForm = { summary: '', diagnoses: [{ code: '', display: '' }], recommendations: '', observations: [], serviceRequests: [], medicationRequests: [] };
const FILLED: CompleteEncounterForm = {
  ...BLANK,
  summary: 'ОРВИ',
  diagnoses: [{ code: 'J06.9', display: 'Острая инфекция', verificationStatus: 'provisional' }],
  observations: [{ codeSystem: 'sys', code: '20006', value: 36.6, unit: 'Cel' }],
};

beforeEach(() => window.localStorage.clear());

describe('encounter-draft', () => {
  it('should read back what was written, under the encounter id', () => {
    const result = writeDraft('1442', FILLED, new Date('2026-10-26T10:25:00Z'));

    expect(result).toEqual({ kind: 'saved', savedAt: '2026-10-26T10:25:00.000Z' });
    expect(readDraft('1442', Date.parse('2026-10-26T11:00:00Z'))?.values).toEqual(FILLED);
    expect(readDraft('other')).toBeNull();
  });

  it('should bring an observation value that was never typed back as NaN', () => {
    writeDraft('1', { ...FILLED, observations: [{ codeSystem: 's', code: '1', value: Number.NaN, unit: '' }] });

    expect(readDraft('1')?.values.observations[0]?.value).toBeNaN();
  });

  it('should keep nothing for a blank form and drop the draft a cleared form leaves behind', () => {
    writeDraft('1', FILLED);

    expect(writeDraft('1', BLANK)).toEqual({ kind: 'blank' });
    expect(readDraft('1')).toBeNull();
    expect(window.localStorage.length).toBe(0);
  });

  it('should store only the fields of the form', () => {
    writeDraft('1', { ...FILLED, patientName: 'Кузнецов Павел' } as unknown as CompleteEncounterForm);
    const raw: string = window.localStorage.getItem('medcenter.encounterDraft.1') ?? '';

    expect(raw).not.toContain('Кузнецов');
  });

  it('should forget a draft older than the retention time', () => {
    writeDraft('1', FILLED, new Date('2026-10-20T10:00:00Z'));

    expect(readDraft('1', Date.parse('2026-10-20T10:00:00Z') + DRAFT_MAX_AGE_MS + 1000)).toBeNull();
    expect(window.localStorage.length).toBe(0);
  });

  it('should ignore a stored value that is not a draft', () => {
    window.localStorage.setItem('medcenter.encounterDraft.1', '{not json');
    window.localStorage.setItem('medcenter.encounterDraft.2', JSON.stringify({ savedAt: new Date().toISOString(), values: 'oops' }));

    expect(readDraft('1')).toBeNull();
    expect(readDraft('2')).toBeNull();
  });

  it('should keep at most ten drafts, dropping the oldest', () => {
    for (let id = 1; id <= 12; id += 1) writeDraft(String(id), FILLED, new Date(Date.UTC(2026, 9, 26, 10, id)));

    expect(readDraft('1', Date.UTC(2026, 9, 26, 12))).toBeNull();
    expect(readDraft('2', Date.UTC(2026, 9, 26, 12))).toBeNull();
    expect(readDraft('12', Date.UTC(2026, 9, 26, 12))).not.toBeNull();
  });

  it('should remove one draft or all of them', () => {
    writeDraft('1', FILLED);
    writeDraft('2', FILLED);
    window.localStorage.setItem('unrelated', 'x');

    clearDraft('1');
    expect(readDraft('1')).toBeNull();
    expect(readDraft('2')).not.toBeNull();

    clearAllDrafts();
    expect(readDraft('2')).toBeNull();
    expect(window.localStorage.getItem('unrelated')).toBe('x');
  });

  it('should report a failed write instead of throwing when storage refuses', () => {
    const spy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });

    expect(writeDraft('1', FILLED)).toEqual({ kind: 'failed' });
    spy.mockRestore();
  });

  it('should tell a blank form from a touched one', () => {
    expect(isBlankForm(BLANK)).toBe(true);
    expect(isBlankForm({ ...BLANK, recommendations: ' ' })).toBe(true);
    expect(isBlankForm({ ...BLANK, diagnoses: [{ code: 'J06', display: '' }] })).toBe(false);
  });
});
