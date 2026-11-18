import {
  BadRequestException,
  PayloadTooLargeException,
  type CallHandler,
  type ExecutionContext,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CONSENT_SCAN_MAX_BYTES } from '@medcenter/contracts';
import type { Observable } from 'rxjs';

// Oversized or malformed uploads become 400 VALIDATION_ERROR (the error catalogue has no code for multer's 413).
export class ScanUploadInterceptor extends FileInterceptor('file', {
  limits: { fileSize: CONSENT_SCAN_MAX_BYTES + 1, files: 1 },
}) {
  override async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    try {
      return await super.intercept(context, next);
    } catch (error) {
      if (error instanceof PayloadTooLargeException) {
        throw new BadRequestException({
          errorCode: 'VALIDATION_ERROR',
          message: 'file: must be at most 10 MB',
          details: [{ field: 'file', message: 'file must be at most 10 MB' }],
        });
      }
      throw error;
    }
  }
}
