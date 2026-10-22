import { ForbiddenException, NotFoundException } from '@nestjs/common';

import type { FhirClient } from './fhir-client.provider';
import {
  buildPatientReadAuditEvent,
  PatientReadAudit,
  type PatientReadAuditParams,
} from './patient-read-audit';

const params: PatientReadAuditParams = {
  interaction: 'read',
  outcome: 'success',
  actorSub: 'user-d',
  patientRef: 'Patient/9f2c',
  source: 'patient-service',
  requestId: 'req-1',
};

describe('buildPatientReadAuditEvent', () => {
  it('should describe a successful read as action R with outcome 0', () => {
    expect(buildPatientReadAuditEvent(params)).toMatchObject({
      resourceType: 'AuditEvent',
      type: { code: 'rest' },
      subtype: [{ system: 'http://hl7.org/fhir/restful-interaction', code: 'read' }],
      action: 'R',
      outcome: '0',
      agent: [{ who: { identifier: { value: 'user-d' } }, requestor: true }],
      source: { observer: { display: 'patient-service' } },
    });
  });

  it('should mark a refused read with outcome 4', () => {
    expect(buildPatientReadAuditEvent({ ...params, outcome: 'denied' })).toMatchObject({
      action: 'R',
      outcome: '4',
    });
  });

  it('should use the search-type subtype for a list read', () => {
    expect(buildPatientReadAuditEvent({ ...params, interaction: 'search-type' })).toMatchObject({
      subtype: [{ code: 'search-type' }],
      action: 'E',
    });
  });

  it('should name the patient first and carry the request id as an XrequestId entity', () => {
    const { entity } = buildPatientReadAuditEvent(params) as unknown as {
      entity: ReadonlyArray<Record<string, unknown>>;
    };
    expect(entity[0]).toMatchObject({ what: { reference: 'Patient/9f2c' }, role: { code: '1' } });
    expect(entity[1]).toMatchObject({
      what: { identifier: { value: 'req-1' } },
      type: { code: 'XrequestId' },
    });
  });

  it('should leave out the request id entity when the request has none', () => {
    const { entity } = buildPatientReadAuditEvent({
      ...params,
      requestId: undefined,
    }) as unknown as { entity: unknown[] };
    expect(entity).toHaveLength(1);
  });

  it('should carry no response body or personal data', () => {
    expect(JSON.stringify(buildPatientReadAuditEvent(params))).not.toMatch(
      /name|birthDate|diagnos/i,
    );
  });
});

describe('PatientReadAudit', () => {
  function clientWith(create: jest.Mock): FhirClient {
    return { create } as unknown as FhirClient;
  }

  it('should write the AuditEvent to HAPI without waiting for the answer', () => {
    const create = jest.fn().mockReturnValue(new Promise(() => undefined));
    new PatientReadAudit(clientWith(create)).record(params);
    expect(create).toHaveBeenCalledWith('AuditEvent', expect.objectContaining({ action: 'R' }));
  });

  it('should swallow a failed write so the clinical answer is not lost', async () => {
    const create = jest.fn().mockRejectedValue(new Error('HAPI down'));
    const audit = new PatientReadAudit(clientWith(create));
    expect(() => audit.record(params)).not.toThrow();
    await new Promise(setImmediate);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('should swallow a synchronous failure of the client too', () => {
    const create = jest.fn().mockImplementation(() => {
      throw new Error('boom');
    });
    expect(() => new PatientReadAudit(clientWith(create)).record(params)).not.toThrow();
  });
});

/** ADR-018 / D-3: DOCTOR and ADMIN reads and every refused read are journalled; a patient's own read is not. */
describe('PatientReadAudit.audited', () => {
  const doctor = { sub: 'user-d', role: 'DOCTOR' };
  const admin = { sub: 'user-a', role: 'ADMIN' };
  const patient = { sub: 'user-p', role: 'PATIENT' };
  const context = { interaction: 'read', source: 'patient-service', requestId: 'req-1' } as const;
  const violation = (): ForbiddenException =>
    new ForbiddenException({ errorCode: 'COMPARTMENT_VIOLATION', message: 'COMPARTMENT_VIOLATION: outside' });

  let create: jest.Mock;
  let audit: PatientReadAudit;

  beforeEach(() => {
    create = jest.fn().mockResolvedValue({});
    audit = new PatientReadAudit({ create } as unknown as FhirClient);
  });

  it('should record a successful read by a doctor and return its result', async () => {
    const result = await audit.audited(doctor, '9f2c', context, async () => 'card');

    expect(result).toBe('card');
    expect(create).toHaveBeenCalledWith(
      'AuditEvent',
      expect.objectContaining({ action: 'R', outcome: '0', agent: [expect.objectContaining({ who: { identifier: { value: 'user-d' } } })] }),
    );
  });

  it('should record a list read by an administrator as search-type', async () => {
    await audit.audited(admin, '9f2c', { ...context, interaction: 'search-type' }, async () => []);

    expect(create).toHaveBeenCalledWith('AuditEvent', expect.objectContaining({ action: 'E', subtype: [expect.objectContaining({ code: 'search-type' })] }));
  });

  it('should not record a patient reading their own record', async () => {
    await audit.audited(patient, '9f2c', context, async () => 'card');

    expect(create).not.toHaveBeenCalled();
  });

  it('should record a refused read with outcome 4 and rethrow the 403', async () => {
    const denied = violation();

    await expect(audit.audited(doctor, '1442', context, () => Promise.reject(denied))).rejects.toBe(denied);
    expect(create).toHaveBeenCalledWith(
      'AuditEvent',
      expect.objectContaining({ outcome: '4', entity: [expect.objectContaining({ what: { reference: 'Patient/1442' } }), expect.anything()] }),
    );
  });

  it('should record a patient asking for another patient as a refused read', async () => {
    await expect(audit.audited(patient, '1442', context, () => Promise.reject(violation()))).rejects.toBeInstanceOf(ForbiddenException);

    expect(create).toHaveBeenCalledWith('AuditEvent', expect.objectContaining({ outcome: '4' }));
  });

  it('should record nothing for a failure that is not a compartment refusal', async () => {
    const missing = new NotFoundException({ errorCode: 'NOT_FOUND', message: 'NOT_FOUND' });
    const noScope = new ForbiddenException({ errorCode: 'FORBIDDEN_SCOPE', message: 'scope' });

    await expect(audit.audited(admin, 'nope', context, () => Promise.reject(missing))).rejects.toBe(missing);
    await expect(audit.audited(admin, '9f2c', context, () => Promise.reject(noScope))).rejects.toBe(noScope);
    expect(create).not.toHaveBeenCalled();
  });
});
