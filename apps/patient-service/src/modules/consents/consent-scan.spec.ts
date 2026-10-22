import { createHash } from 'node:crypto';

import { CONSENT_SCAN_MAX_BYTES } from '@medcenter/contracts';

import { validateScanUpload, type UploadedScan } from './consent-scan';

const PDF = Buffer.from('%PDF-1.7\n%âãÏÓ\n1 0 obj\n');
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(16),
]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16)]);

function upload(buffer: Buffer, mimetype: string): UploadedScan {
  return { buffer, mimetype, size: buffer.length, originalname: 'form.bin' };
}

function messageOf(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    const response = (
      error as { getResponse(): { errorCode: string; message: string } }
    ).getResponse();
    expect(response.errorCode).toBe('VALIDATION_ERROR');
    return response.message;
  }
  throw new Error('expected a rejection');
}

describe('validateScanUpload', () => {
  it.each([
    ['a PDF', PDF, 'application/pdf'],
    ['a PNG', PNG, 'image/png'],
    ['a JPEG', JPEG, 'image/jpeg'],
  ])('should accept %s and name its type and sha1 hash', (_name, buffer, mimetype) => {
    const scan = validateScanUpload(upload(buffer, mimetype));

    expect(scan.contentType).toBe(mimetype);
    expect(scan.size).toBe(buffer.length);
    expect(scan.hash).toMatch(/^[A-Za-z0-9+/]{27}=$/);
  });

  it('should compute the base64 SHA-1 of the bytes (Consent.sourceAttachment.hash)', () => {
    const expected = createHash('sha1').update(PDF).digest('base64');

    expect(validateScanUpload(upload(PDF, 'application/pdf')).hash).toBe(expected);
  });

  it('should refuse a request without a file', () => {
    expect(messageOf(() => validateScanUpload(undefined))).toContain('file');
  });

  it('should refuse an empty file', () => {
    expect(
      messageOf(() => validateScanUpload(upload(Buffer.alloc(0), 'application/pdf'))),
    ).toContain('empty');
  });

  it('should refuse a file over 10 MB', () => {
    const big = { ...upload(PDF, 'application/pdf'), size: CONSENT_SCAN_MAX_BYTES + 1 };

    expect(messageOf(() => validateScanUpload(big))).toContain('10 MB');
  });

  it('should accept a file of exactly 10 MB', () => {
    const edge = Buffer.concat([PDF, Buffer.alloc(CONSENT_SCAN_MAX_BYTES - PDF.length)]);

    expect(validateScanUpload(upload(edge, 'application/pdf')).size).toBe(CONSENT_SCAN_MAX_BYTES);
  });

  it('should refuse a declared type outside PDF, JPEG and PNG', () => {
    expect(messageOf(() => validateScanUpload(upload(PDF, 'text/html')))).toContain(
      'application/pdf',
    );
  });

  it('should refuse a file whose bytes are not the declared type', () => {
    expect(
      messageOf(() =>
        validateScanUpload(upload(Buffer.from('<script>alert(1)</script>'), 'application/pdf')),
      ),
    ).toContain('content');
  });

  it('should refuse a PNG sent as a PDF: the signature decides, not the header', () => {
    expect(messageOf(() => validateScanUpload(upload(PNG, 'application/pdf')))).toContain(
      'content',
    );
  });
});
