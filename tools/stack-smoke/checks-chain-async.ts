import { isoDay } from './checks-catalog-read';
import { pollUntil } from './polling';
import {
  asArray,
  bodyObject,
  expectDefined,
  expectEqual,
  expectPage,
  expectShape,
  expectStatus,
  expectTrue,
} from './smoke-assert';
import { AUDIT_EVENT_SHAPE, MEASURE_REPORT_SHAPE, NOTIFICATION_SHAPE } from './smoke-shapes';
import type { SmokeStep } from './smoke-runner';
import type { JsonObject } from './smoke-types';
import type { ReportBaseline, Suite } from './suite';

const REPORT_RANGE = { from: isoDay(0), to: isoDay(30) };

async function readCount(suite: Suite, path: string): Promise<JsonObject> {
  const response = await suite.api.get(path, { session: suite.sessions.admin, query: REPORT_RANGE });
  expectStatus(response, 200);
  return expectShape(response.body, MEASURE_REPORT_SHAPE, path);
}

function popularityOf(report: JsonObject): Record<string, number> {
  const entries = asArray(report['groups'], 'groups').map((group) => group as JsonObject);
  return Object.fromEntries(entries.map((group) => [String(group['code']), Number(group['count'])]));
}

/** The admin reports as they stand now (taken before the chain, compared after it). */
export async function takeBaseline(suite: Suite): Promise<ReportBaseline> {
  const appointments = await readCount(suite, '/api/v1/admin/analytics/appointments');
  const encounters = await readCount(suite, '/api/v1/admin/analytics/encounters');
  const popularity = await readCount(suite, '/api/v1/admin/analytics/services-popularity');
  return { appointments: Number(appointments['total']), encounters: Number(encounters['total']), popularity: popularityOf(popularity) };
}

/** Step 18: notification-service consumed the events and created a Communication for the patient. */
function arrivalStep(suite: Suite, found: { notificationId: string }): SmokeStep {
  const { api, sessions, chain, config } = suite;
  return {
    name: 'notification-service has a Communication for the booking (GET /notifications) and for the finished encounter',
    run: async () => {
      const notification = await pollUntil(config, 'the booking and encounter notifications', async () => {
        const response = await api.get('/api/v1/notifications', { session: sessions.patient, query: { pageSize: 100 } });
        const items = expectPage(response, NOTIFICATION_SHAPE);
        const booked = items.find((item) => item['category'] === 'appointment' && item['appointmentId'] === chain.appointmentId);
        const finished = items.find((item) => item['category'] === 'encounter');
        return booked !== undefined && finished !== undefined ? booked : undefined;
      });
      found.notificationId = String(notification['id']);
    },
  };
}

/** Step 19: the unread counter and the read flag. */
function readFlagSteps(suite: Suite, found: { notificationId: string }): SmokeStep[] {
  const { api, sessions } = suite;
  const session = sessions.patient;
  return [
    {
      name: 'GET /notifications/unread-count counts it; POST /notifications/{id}/read -> 204 and the count drops by one',
      run: async () => {
        const before = await api.get('/api/v1/notifications/unread-count', { session });
        expectStatus(before, 200);
        const unread = Number(expectShape(before.body, { count: 'number' }, 'unread-count')['count']);
        expectTrue(unread >= 2, `expected at least the booking and encounter notifications unread, got ${unread}`);
        expectStatus(await api.post(`/api/v1/notifications/${found.notificationId}/read`, { session }), 204);
        const after = await api.get('/api/v1/notifications/unread-count', { session });
        expectEqual(Number(bodyObject(after)['count']), unread - 1, 'unread-count after reading one');
      },
    },
    {
      name: 'GET /notifications?unread=true no longer lists the read one',
      run: async () => {
        const items = expectPage(await api.get('/api/v1/notifications', { session, query: { unread: true, pageSize: 100 } }), NOTIFICATION_SHAPE);
        expectTrue(items.every((item) => item['id'] !== found.notificationId && item['read'] === false), 'the unread filter returned a read notification');
      },
    },
  ];
}

/** API §8.4: read-all marks the caller's remaining unread notifications and the counter drops to zero. */
function readAllStep(suite: Suite): SmokeStep {
  const { api, sessions } = suite;
  const session = sessions.patient;
  return {
    name: 'POST /notifications/read-all -> 200 with the number marked read, and the unread count drops to zero',
    run: async () => {
      const response = await api.post('/api/v1/notifications/read-all', { session });
      expectStatus(response, 200);
      const updated = Number(expectShape(response.body, { updated: 'number' }, 'read-all')['updated']);
      expectTrue(updated >= 1, `read-all marked ${updated} notifications, expected the encounter one at least`);
      const after = await api.get('/api/v1/notifications/unread-count', { session });
      expectEqual(Number(bodyObject(after)['count']), 0, 'unread-count after read-all');
    },
  };
}

export function notificationSteps(suite: Suite): SmokeStep[] {
  const found = { notificationId: '' };
  return [arrivalStep(suite, found), ...readFlagSteps(suite, found), readAllStep(suite)];
}

function analyticsStep(suite: Suite): SmokeStep {
  const { chain, config } = suite;
  return {
    name: 'admin analytics: appointments, encounters and services-popularity moved by the chain',
    run: async () => {
      const base = expectDefined(chain.baseline, 'the report baseline');
      const serviceId = expectDefined(chain.serviceId, 'the booked service id');
      await pollUntil(config, 'the analytics read-model to catch up', async () => {
        const now = await takeBaseline(suite);
        const moved = now.appointments > base.appointments && now.encounters > base.encounters && (now.popularity[serviceId] ?? 0) > (base.popularity[serviceId] ?? 0);
        return moved ? true : undefined;
      });
    },
  };
}

function auditSteps(suite: Suite): SmokeStep[] {
  const { api, sessions, chain } = suite;
  return [
    {
      name: 'GET /admin/audit?entity=Appointment/{id} -> a create event with a request id, in the PaginatedResponseDto envelope',
      run: async () => {
        const items = await auditOf(suite, `Appointment/${chain.appointmentId}`, 'create');
        expectTrue(String(items[0]?.['requestId']).length > 0, 'the audit event of the booking carries no requestId (NFR-007)');
      },
    },
    encounterAuditStep(suite),
    {
      name: 'GET /admin/audit?userId=&entity= filters by the actor: the booking is attributed to the patient',
      run: async () => {
        const userId = expectDefined(sessions.patient.claims.sub, 'the patient token sub');
        const query = { userId, entity: `Appointment/${chain.appointmentId}`, pageSize: 20 };
        const items = expectPage(await api.get('/api/v1/admin/audit', { session: sessions.admin, query }), AUDIT_EVENT_SHAPE);
        expectTrue(items.length > 0 && items.every((item) => item['userId'] === userId), "the userId filter did not return the patient's event");
      },
    },
    patientReadAuditStep(suite),
  ];
}

function encounterAuditStep(suite: Suite): SmokeStep {
  const { chain } = suite;
  return (
    {
      name: 'GET /admin/audit?entity=Encounter/{id} -> exactly one open (create) event despite the concurrent open, and the completion (update) event, each with a request id',
      run: async () => {
        const created = await auditOf(suite, `Encounter/${chain.encounterId}`, 'create');
        const updated = await auditOf(suite, `Encounter/${chain.encounterId}`, 'update');
        expectEqual(created.length, 1, 'create events of the encounter (a replayed open writes none)');
        expectTrue([...created, ...updated].every((item) => String(item['requestId']).length > 0), 'an audit event of the encounter carries no requestId');
      },
    }
  );
}

function patientReadAuditStep(suite: Suite): SmokeStep {
  const { api, sessions, chain } = suite;
  return (
    {
      name: "GET /patients/{id} by the doctor and by another doctor -> a `read` and a `denied` audit event of the patient, attributed to each (ADR-018)",
      run: async () => {
        const patientId = expectDefined(chain.patientId, 'the chain patient id');
        expectEqual((await api.get(`/api/v1/patients/${patientId}`, { session: sessions.doctor })).status, 200, 'the treating doctor reading the card');
        expectEqual((await api.get(`/api/v1/patients/${patientId}`, { session: sessions.otherDoctor })).status, 403, 'a doctor without shared care reading the card');
        const read = await auditOf(suite, `Patient/${patientId}`, 'read');
        const denied = await auditOf(suite, `Patient/${patientId}`, 'denied');
        expectTrue(read.some((item) => item['userId'] === sessions.doctor.claims.sub), 'no read event attributed to the treating doctor');
        expectTrue(denied.some((item) => item['userId'] === sessions.otherDoctor.claims.sub), 'no denied event attributed to the other doctor');
        expectTrue([...read, ...denied].every((item) => String(item['requestId']).length > 0), 'a read audit event carries no requestId (NFR-007)');
      },
    }
  );
}

/** Step 20-21: the admin reports and the audit journal show the activity (the audit is synced on an interval). */
export function reportSteps(suite: Suite): SmokeStep[] {
  return [analyticsStep(suite), ...auditSteps(suite)];
}

async function auditOf(suite: Suite, entity: string, action: string): Promise<readonly JsonObject[]> {
  const { api, sessions, config } = suite;
  return pollUntil(config, `the ${action} audit event of ${entity}`, async () => {
    const response = await api.get('/api/v1/admin/audit', { session: sessions.admin, query: { entity, pageSize: 100 } });
    const items = expectPage(response, AUDIT_EVENT_SHAPE).filter((item) => item['action'] === action);
    return items.length > 0 ? items : undefined;
  });
}
