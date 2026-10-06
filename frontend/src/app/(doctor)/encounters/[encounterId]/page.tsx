import { EncounterView } from '@/components/doctor/encounter-view';

export default async function EncounterPage({ params }: { readonly params: Promise<{ encounterId: string }> }): Promise<React.JSX.Element> {
  const { encounterId } = await params;
  return <EncounterView encounterId={encounterId} />;
}
