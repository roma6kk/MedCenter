/** `PractitionerRole/abc` → `abc`: the id of the role a doctor's token names in `fhirUser`; `null` for anything else. */
export function roleIdOf(fhirUser: string | null): string | null {
  const [type, id] = (fhirUser ?? '').split('/');
  return type === 'PractitionerRole' && id !== undefined && id !== '' ? id : null;
}
