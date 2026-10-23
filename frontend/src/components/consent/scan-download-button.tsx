'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { buttonVariants } from '@/components/ui/button-variants';
import { useT } from '@/lib/i18n/use-t';
import { cn } from '@/lib/ui/cn';
import { fetchConsentScan } from './consent-api';
import type { ConsentScanRef } from './consent-types';

const EXTENSIONS: Readonly<Record<string, string>> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' };

/** `consent-scan-Ф-12.pdf`: the form number tells the file apart, anything a file system dislikes becomes a hyphen. */
function fileNameOf(formNumber: string | undefined, contentType: string): string {
  const label: string = (formNumber ?? '').replace(/[\\/:*?"<>|\s]+/g, '-');
  return `consent-scan${label === '' ? '' : `-${label}`}.${EXTENSIONS[contentType] ?? 'bin'}`;
}

/** Hands the bytes to the browser as a download and releases the temporary address at once. */
function saveBlob(blob: Blob, fileName: string): void {
  const address: string = URL.createObjectURL(blob);
  const anchor: HTMLAnchorElement = document.createElement('a');
  anchor.href = address;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(address);
}

interface ScanDownloadButtonProps {
  readonly patientId: string;
  readonly scan: ConsentScanRef;
  readonly formNumber?: string;
}

/**
 * Downloads the scan of a consent form (API 3.11). A plain link cannot carry the Bearer token, so the bytes are fetched with
 * the session and saved from memory; the read is audited by the server. While it runs the button is `aria-disabled`, not
 * `disabled` (keeps the keyboard focus); a failure is said next to it and the button stays usable.
 */
export function ScanDownloadButton({ patientId, scan, formNumber }: ScanDownloadButtonProps): ReactNode {
  const t = useT('consent.staff');
  const [isBusy, setIsBusy] = useState(false);
  const [hasFailed, setHasFailed] = useState(false);
  const download = async (): Promise<void> => {
    if (isBusy) return;
    setIsBusy(true);
    setHasFailed(false);
    try {
      saveBlob(await fetchConsentScan(patientId, scan.id), fileNameOf(formNumber, scan.contentType));
    } catch {
      setHasFailed(true);
    } finally {
      setIsBusy(false);
    }
  };
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => void download()}
        aria-disabled={isBusy ? true : undefined}
        aria-busy={isBusy}
        aria-label={isBusy ? undefined : formNumber === undefined ? t('downloadScan') : t('downloadScanFor', { number: formNumber })}
        className={cn(buttonVariants({ variant: 'secondary' }))}
      >
        {isBusy ? t('downloading') : t('downloadScan')}
      </button>
      {hasFailed ? <span role="alert" className="text-sm text-destructive">{t('downloadFailed')}</span> : null}
    </span>
  );
}
