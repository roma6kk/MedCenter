Status: done

Examined:
- apps/notification-service: consumer.service.ts, deduplication.service.ts, redis-dedup.store.ts, notification.bindings.ts, communication.mapper.ts, clinic-time.ts (run on sample instants: Minsk time correct), notifications.service.ts, notifications.controller.ts, patient-reference.ts, dto + swagger doc, main.ts, app.module.ts, module wiring
- apps/outbox-relay: relay.service.ts (lock, dispatch loop, markSent If-Match, stale warning, purge + expunge), relay.config.ts, redis-lock.ts, relay.module.ts, main.ts, health
- libs/messaging (topology.ts, event-publisher.ts + spec), libs/contracts/src/lib/events/* (+ spec), libs/fhir outbox.ts, fhir-transaction.ts, fhir-client.provider.ts (search/operation/error mapping)
- comparison: analytics-service delivery.processor.ts, analytics.worker.ts, analytics-event.ts
- producers: appointment-service book/cancel, encounter-service completion, auth-service patient-events
- spec/ops: architect §4.4 + ADR-021, api-designer §8; docker-compose (relay, notification, hapi, rabbitmq), traefik route, stack-smoke notification steps, frontend notification-api/logic (contract match only)
- Targeted tests run, all green: relay specs (17), notification-service notifications specs (78), libs/messaging specs

Findings written (6): 01 no retries in notification consumer (analytics has them), 02 unroutable events lost (no mandatory), 03 no payload validation / silent drop of known events, 04 poison-record log spam in relay, 05 docs drift (spec §8 / swagger / contract fixture), 06 unread query param leniency

Not duplicated on purpose (already filed by tz-matrix): tz-matrix-02 noshow notification, -04 EN locale texts, -05 admin cancel wording, -06 readiness, -07 structured logs, -12 email channel.

Remaining: nothing planned. Relay, dedup lease, retention/expunge, ordering, lock and contract optional fields were read end to end and match ADR-021; no further defects found.
