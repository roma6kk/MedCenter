import { consentRecordSchema, toConsentEntry, validateScanFile, type ConsentRecordValues } from './consent-record-schema';

function scan(type: string, size = 1000, name = 'scan'): File {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

const PDF: File = scan('application/pdf');
const SELF: ConsentRecordValues = {
  formNumber: ' Ф-12 ',
  signedAt: '2026-10-20',
  status: 'active',
  consenterType: 'self',
  relatedPersonId: '',
  representativeDocument: '',
  signedByName: '',
  file: PDF,
};

function messagesOf(values: ConsentRecordValues, role: 'ADMIN' | 'DOCTOR' = 'DOCTOR'): Readonly<Record<string, string>> {
  const result = consentRecordSchema(role, '2026-10-22').safeParse(values);
  if (result.success) return {};
  return Object.fromEntries([...result.error.issues].reverse().map((issue) => [String(issue.path[0]), issue.message]));
}

describe('validateScanFile', () => {
  it.each(['application/pdf', 'image/jpeg', 'image/png'])('should accept %s', (type) => {
    expect(validateScanFile(scan(type))).toBeNull();
  });

  it('should ask for a file when none is chosen', () => {
    expect(validateScanFile(null)).toBe('validation.scanRequired');
  });

  it('should refuse a type other than PDF, JPEG and PNG', () => {
    expect(validateScanFile(scan('image/gif'))).toBe('validation.scanType');
  });

  it('should accept exactly 10 MB and refuse one byte more', () => {
    expect(validateScanFile(scan('application/pdf', 10 * 1024 * 1024))).toBeNull();
    expect(validateScanFile(scan('application/pdf', 10 * 1024 * 1024 + 1))).toBe('validation.scanSize');
  });
});

describe('consentRecordSchema', () => {
  it('should accept a consent signed by the patient themselves; a doctor leaves the signer to the server', () => {
    expect(messagesOf(SELF)).toEqual({});
  });

  it('should require the form number, the date and a file', () => {
    expect(messagesOf({ ...SELF, formNumber: '  ', signedAt: '', file: null })).toMatchObject({
      formNumber: 'validation.required',
      signedAt: 'validation.required',
      file: 'validation.scanRequired',
    });
  });

  it('should refuse a form number longer than 64 characters', () => {
    expect(messagesOf({ ...SELF, formNumber: 'я'.repeat(65) })['formNumber']).toBe('validation.tooLong');
  });

  it('should refuse a signing date in the future', () => {
    expect(messagesOf({ ...SELF, signedAt: '2026-10-23' })['signedAt']).toBe('validation.futureDate');
    expect(messagesOf({ ...SELF, signedAt: '2026-10-22' })).toEqual({});
  });

  it('should refuse a date that is not a calendar day', () => {
    expect(messagesOf({ ...SELF, signedAt: '2026-13-40' })['signedAt']).toBe('validation.date');
  });

  it('should require the name of the signing clerk from an administrator only', () => {
    expect(messagesOf(SELF, 'ADMIN')['signedByName']).toBe('validation.required');
    expect(messagesOf({ ...SELF, signedByName: 'Петрова А. И.' }, 'ADMIN')).toEqual({});
    expect(messagesOf({ ...SELF, signedByName: 'я'.repeat(201) }, 'ADMIN')['signedByName']).toBe('validation.tooLong');
  });

  it.each(['legal-representative', 'guardian', 'relative'] as const)('should require the person and the authority document when %s signed', (consenterType) => {
    expect(messagesOf({ ...SELF, consenterType })).toMatchObject({ relatedPersonId: 'validation.relatedRequired', representativeDocument: 'validation.required' });
    expect(messagesOf({ ...SELF, consenterType, relatedPersonId: 'rp1', representativeDocument: 'Доверенность № 5' })).toEqual({});
  });

  it('should refuse an authority document longer than 500 characters', () => {
    expect(messagesOf({ ...SELF, consenterType: 'guardian', relatedPersonId: 'rp1', representativeDocument: 'я'.repeat(501) })['representativeDocument']).toBe('validation.tooLong');
  });
});

describe('toConsentEntry', () => {
  it('should trim the text and leave out what a self-signed consent does not have', () => {
    expect(toConsentEntry({ ...SELF, signedByName: ' Петрова ' })).toEqual({
      file: PDF,
      body: { status: 'active', formNumber: 'Ф-12', signedAt: '2026-10-20', consenterType: 'self', signedByName: 'Петрова' },
    });
  });

  it('should carry the related person and the document for a representative and the written refusal status', () => {
    expect(toConsentEntry({ ...SELF, status: 'rejected', consenterType: 'guardian', relatedPersonId: 'rp1', representativeDocument: ' Решение суда ' }).body).toEqual({
      status: 'rejected',
      formNumber: 'Ф-12',
      signedAt: '2026-10-20',
      consenterType: 'guardian',
      relatedPersonId: 'rp1',
      representativeDocument: 'Решение суда',
    });
  });
});
