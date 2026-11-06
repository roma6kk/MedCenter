export function roleIdOf(fhirUser: string | null): string | null {
  const [type, id] = (fhirUser ?? '').split('/');
  return type === 'PractitionerRole' && id !== undefined && id !== '' ? id : null;
}
