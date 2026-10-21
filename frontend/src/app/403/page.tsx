import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { ForbiddenPage } from '@/components/feedback/route-pages';
import { pageMetadata } from '@/lib/i18n/page-metadata';

export const metadata: Metadata = pageMetadata('feedback.forbiddenTitle');

export default function Forbidden(): ReactNode {
  return <ForbiddenPage />;
}
