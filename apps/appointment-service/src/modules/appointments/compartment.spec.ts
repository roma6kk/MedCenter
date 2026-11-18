import type { JwtClaims } from '@medcenter/common';
import type { FhirResource } from '@medcenter/fhir';

import {
  assertDoctorParticipates,
  assertPatientOwns,
  assertViewerCanSee,
  requireDoctorRoleRef,
  resolveViewer,
} from './compartment';

const appointment: FhirResource = {
  resourceType: 'Appointment',
  id: 'apt-1',
  participant: [
    { actor: { reference: 'Patient/9f2c' } },
    { actor: { reference: 'PractitionerRole/role-1' } },
    { actor: { reference: 'HealthcareService/svc-1' } },
  ],
};

const patient: JwtClaims = { sub: 'user-1', scope: 'patient/*.read', role: 'PATIENT', patient: '9f2c', jti: 'j-1' };
const doctor: JwtClaims = { sub: 'doc-1', scope: 'user/*.read', role: 'DOCTOR', fhirUser: 'PractitionerRole/role-1', jti: 'j-2' };
const admin: JwtClaims = { sub: 'adm-1', scope: 'user/*.read', role: 'ADMIN', jti: 'j-3' };

function errorCodeOf(act: () => unknown): unknown {
  try {
    act();
  } catch (error) {
    return ((error as { getResponse(): { errorCode?: unknown } }).getResponse()).errorCode;
  }
  return undefined;
}

describe('assertPatientOwns', () => {
  it('should accept the owner when the caller reference is the patient participant', () => {
    const callerRef = 'Patient/9f2c';

    const code = errorCodeOf(() => assertPatientOwns(callerRef, appointment));

    expect(code).toBeUndefined();
  });

  it('should accept the owner when the stored participant reference is absolute', () => {
    const absolute: FhirResource = { ...appointment, participant: [{ actor: { reference: 'http://hapi:8080/fhir/Patient/9f2c' } }] };

    const code = errorCodeOf(() => assertPatientOwns('Patient/9f2c', absolute));

    expect(code).toBeUndefined();
  });

  it('should refuse with COMPARTMENT_VIOLATION when the appointment belongs to another patient', () => {
    const callerRef = 'Patient/other';

    const code = errorCodeOf(() => assertPatientOwns(callerRef, appointment));

    expect(code).toBe('COMPARTMENT_VIOLATION');
  });
});

describe('requireDoctorRoleRef', () => {
  it('should return PractitionerRole/{id} when fhirUser names a PractitionerRole', () => {
    const claims: JwtClaims = { ...doctor, fhirUser: 'https://api.medcenter.by/fhir/PractitionerRole/role-1' };

    const reference = requireDoctorRoleRef(claims);

    expect(reference).toBe('PractitionerRole/role-1');
  });

  it('should fail closed with COMPARTMENT_VIOLATION when fhirUser is absent', () => {
    const claims: JwtClaims = { ...doctor, fhirUser: undefined };

    const code = errorCodeOf(() => requireDoctorRoleRef(claims));

    expect(code).toBe('COMPARTMENT_VIOLATION');
  });

  it('should fail closed with COMPARTMENT_VIOLATION when fhirUser is not a PractitionerRole', () => {
    const claims: JwtClaims = { ...doctor, fhirUser: 'Practitioner/role-1' };

    const code = errorCodeOf(() => requireDoctorRoleRef(claims));

    expect(code).toBe('COMPARTMENT_VIOLATION');
  });
});

describe('assertDoctorParticipates', () => {
  it('should accept the participant when the stored reference is versioned', () => {
    const versioned: FhirResource = {
      ...appointment,
      participant: [{ actor: { reference: 'PractitionerRole/role-1/_history/2' } }],
    };

    const code = errorCodeOf(() => assertDoctorParticipates('PractitionerRole/role-1', versioned));

    expect(code).toBeUndefined();
  });

  it('should refuse with COMPARTMENT_VIOLATION when another practitioner role participates', () => {
    const callerRef = 'PractitionerRole/role-9';

    const code = errorCodeOf(() => assertDoctorParticipates(callerRef, appointment));

    expect(code).toBe('COMPARTMENT_VIOLATION');
  });
});

describe('resolveViewer', () => {
  it('should resolve each role to its compartment identity when the token is complete', () => {
    const tokens = [patient, doctor, admin];

    const viewers = tokens.map((claims) => resolveViewer(claims));

    expect(viewers).toEqual([
      { kind: 'patient', reference: 'Patient/9f2c' },
      { kind: 'doctor', reference: 'PractitionerRole/role-1' },
      { kind: 'admin' },
    ]);
  });

  it('should fail closed with COMPARTMENT_VIOLATION when a doctor token has no fhirUser', () => {
    const claims: JwtClaims = { ...doctor, fhirUser: undefined };

    const code = errorCodeOf(() => resolveViewer(claims));

    expect(code).toBe('COMPARTMENT_VIOLATION');
  });

  it('should refuse with FORBIDDEN_ROLE when the role is unknown', () => {
    const claims: JwtClaims = { ...admin, role: 'NURSE' };

    const code = errorCodeOf(() => resolveViewer(claims));

    expect(code).toBe('FORBIDDEN_ROLE');
  });
});

describe('assertViewerCanSee', () => {
  it('should let the owner patient, the participant doctor and an admin see the appointment', () => {
    const viewers = [patient, doctor, admin].map((claims) => resolveViewer(claims));

    const codes = viewers.map((viewer) => errorCodeOf(() => assertViewerCanSee(viewer, appointment)));

    expect(codes).toEqual([undefined, undefined, undefined]);
  });

  it('should refuse with COMPARTMENT_VIOLATION when the viewer neither owns nor participates', () => {
    const viewers = [
      resolveViewer({ ...patient, patient: 'other' }),
      resolveViewer({ ...doctor, fhirUser: 'PractitionerRole/role-9' }),
    ];

    const codes = viewers.map((viewer) => errorCodeOf(() => assertViewerCanSee(viewer, appointment)));

    expect(codes).toEqual(['COMPARTMENT_VIOLATION', 'COMPARTMENT_VIOLATION']);
  });
});
