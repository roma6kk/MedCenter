'use client';

import type { ReactNode } from 'react';
import { CodeChip } from '@/components/feedback/code-chip';
import { useT } from '@/lib/i18n/use-t';
import type { DiagnosisView } from './doctor-types';

const ICD10_CODE_SYSTEM = 'https://fhir.by/CodeSystem/InternClassificDiseases10';

export function DiagnosisList({ diagnoses }: { readonly diagnoses: ReadonlyArray<DiagnosisView> }): ReactNode {
  const t = useT('doctor.verification');
  return (
    <ul className="grid gap-1.5">
      {diagnoses.map((diagnosis, index) => (
        <li key={`${diagnosis.code}-${index}`} className="flex flex-wrap items-baseline gap-2 text-sm">
          <CodeChip code={diagnosis.code} system={ICD10_CODE_SYSTEM} />
          <span>{diagnosis.display}</span>
          {diagnosis.verificationStatus ? <span className="text-xs text-muted-foreground">{t(diagnosis.verificationStatus)}</span> : null}
        </li>
      ))}
    </ul>
  );
}
