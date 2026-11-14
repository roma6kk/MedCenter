import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { PrivacyPolicy } from '@/components/legal/privacy-policy';
import { pageMetadata } from '@/lib/i18n/page-metadata';

export const metadata: Metadata = pageMetadata('privacy.title');

export default function PrivacyPage(): ReactNode {
  return <PrivacyPolicy />;
}
