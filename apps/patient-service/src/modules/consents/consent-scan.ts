import { createHash } from 'node:crypto';

import { BadRequestException } from '@nestjs/common';
import {
  CONSENT_SCAN_CONTENT_TYPES,
  CONSENT_SCAN_MAX_BYTES,
  type ConsentScanContentType,
} from '@medcenter/contracts';

/** The part of a multer memory file this module uses (`@types/multer` is not a dependency). */
export interface UploadedScan {
  readonly buffer: Buffer;
  readonly mimetype: string;
  readonly size: number;
  readonly originalname: string;
}

/** An accepted scan: the type its bytes prove and the SHA-1 `Consent.sourceAttachment.hash` carries. */
export interface ValidScan {
  readonly buffer: Buffer;
  readonly contentType: ConsentScanContentType;
  readonly size: number;
  /** Base64 SHA-1 of the bytes. */
  readonly hash: string;
}

const SIGNATURES: ReadonlyArray<{
  readonly type: ConsentScanContentType;
  readonly magic: ReadonlyArray<number>;
}> = [
  { type: 'application/pdf', magic: [0x25, 0x50, 0x44, 0x46, 0x2d] },
  { type: 'image/png', magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { type: 'image/jpeg', magic: [0xff, 0xd8, 0xff] },
];

function reject(message: string): BadRequestException {
  return new BadRequestException({
    errorCode: 'VALIDATION_ERROR',
    message,
    details: [{ field: 'file', message }],
  });
}

function sniff(buffer: Buffer): ConsentScanContentType | undefined {
  return SIGNATURES.find(
    ({ magic }) =>
      buffer.length >= magic.length && magic.every((byte, index) => buffer[index] === byte),
  )?.type;
}

function isAllowedType(value: string): value is ConsentScanContentType {
  return (CONSENT_SCAN_CONTENT_TYPES as ReadonlyArray<string>).includes(value);
}

/**
 * Boundary check of a consent scan (API §3.10): a file is present and not
 * empty, at most 10 MB, declared as PDF/JPEG/PNG **and** starting with that
 * type's signature — the header alone is the client's word. Throws 400
 * `VALIDATION_ERROR`; nothing reaches HAPI before this passes.
 */
export function validateScanUpload(file: UploadedScan | undefined): ValidScan {
  if (file === undefined) {
    throw reject('file is required (multipart field "file")');
  }
  if (file.size === 0 || file.buffer.length === 0) {
    throw reject('file is empty');
  }
  if (file.size > CONSENT_SCAN_MAX_BYTES || file.buffer.length > CONSENT_SCAN_MAX_BYTES) {
    throw reject('file must be at most 10 MB');
  }
  if (!isAllowedType(file.mimetype)) {
    throw reject(`file type must be one of ${CONSENT_SCAN_CONTENT_TYPES.join(', ')}`);
  }
  if (sniff(file.buffer) !== file.mimetype) {
    throw reject(`file content is not ${file.mimetype}`);
  }
  return {
    buffer: file.buffer,
    contentType: file.mimetype,
    size: file.buffer.length,
    hash: createHash('sha1').update(file.buffer).digest('base64'),
  };
}
