'use client';

import type { ReactNode } from 'react';
import { ProblemBanner } from '@/components/feedback/problem-banner';
import { useT } from '@/lib/i18n/use-t';
import type { FormBanner } from './use-form-banner';
import { detailCodeOf, problemOf } from './problem-of';

interface AdminProblemProps {
  readonly error: unknown;
  readonly title?: string;
  readonly detail?: string;
}

export function AdminProblem({ error, title, detail }: AdminProblemProps): ReactNode {
  const t = useT('admin.problems');
  const problem = problemOf(error);
  if (problem === null) return <ProblemBanner errorCode="INTERNAL" />;
  const code = detailCodeOf(problem);
  const explanation: string | undefined = detail ?? (code === null ? undefined : t(code));
  return <ProblemBanner problem={problem} {...(title === undefined ? {} : { title })} {...(explanation === undefined ? {} : { detail: explanation })} />;
}

interface FormProblemProps {
  readonly banner: FormBanner | null;
  readonly title?: string;
}

export function FormProblem({ banner, title }: FormProblemProps): ReactNode {
  if (banner === null) return null;
  return (
    <div className="mt-3">
      <AdminProblem error={banner.error} {...(title === undefined ? {} : { title })} {...(banner.detail === undefined ? {} : { detail: banner.detail })} />
    </div>
  );
}
