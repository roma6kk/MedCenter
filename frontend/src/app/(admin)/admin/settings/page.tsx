import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/i18n/page-metadata';
import { SettingsPanel } from '@/components/admin/settings/settings-panel';

export const metadata: Metadata = pageMetadata('admin.settings.title');

export default function AdminSettingsPage(): React.JSX.Element {
  return <SettingsPanel />;
}
