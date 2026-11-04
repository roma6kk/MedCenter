# Package B-notify — progress (attempt 1)

Order: tz-matrix-02, tz-matrix-05, be-notification-outbox-01, -02, -03, -04, -06, -05, tz-matrix-04

- tz-matrix-02: done a51cb04 — appointment.noshow.v1 contract + outbox write in markNoShow + notification binding/mapper text (category appointment)
- tz-matrix-05: done c892572 — admin cancellation worded as the clinic's (mapper reads actorType)
- be-notification-outbox-01: done ab092c4 — notification consumer retries (12 deliveries, header x-notification-attempt) via shared libs/messaging attemptOf/deferDelivery; analytics adopted them, behaviour unchanged
- be-notification-outbox-02: done fa76a42 — AmqpEventPublisher publishes mandatory + handles basic.return (unroutable -> publish rejects, relay keeps the record pending); ADR-021 text updated
- be-notification-outbox-03: done 6d729b6 — notification-event.ts (parseNotificationEvent/InvalidEventError), mapper typed over the 5 contract events, invalid known type -> DLQ, unknown -> ack; validators stay local (analytics-event.ts not refactored)
- be-notification-outbox-04: done 3919bd2 — ReportThrottle (once/hour/record, cap 1000) in outbox-relay
- be-notification-outbox-06: done f940597 — parseFlag: unread other than true/false/empty -> 400 VALIDATION_ERROR (e2e cases added)
- be-notification-outbox-05: done 65a96fe — spec §8 (403 COMPARTMENT_VIOLATION, 400, no sender, category values), Swagger 403/category/examples, patient.registered patientId doc + fixture
- tz-matrix-04: done 5b41705 (backend part only) — 8.1 item has optional `kind` ('appointment.booked' | 'appointment.cancelled' | 'appointment.cancelled.by-admin' | 'appointment.noshow' | 'encounter.completed' | 'patient.registered') and `start` (UTC ISO instant, only appointment.booked); `text` stays the Russian fallback for old items without kind. FRONTEND PART (F-patient): render t('notifications.kinds.<kind>') with start via clinic-time helpers, fall back to item.text when kind is absent; add ru/en strings; category stays appointment|encounter|registration.

Notes (B-notify, attempt 1)
- tz-matrix-02: outbox-relay needs no per-type registration (routing key comes from the record's extension); analytics binds only its own three routing keys, so appointment.noshow.v1 never reaches it and the AnalyticsEvent union is unchanged. The frontend already invalidates the unread counter after a no-show (invalidation.ts).
- be-notification-outbox-02: with `mandatory`, an event type no queue is bound for stays pending (the relay stops the batch at it by design, ordering). All five event types have a notification queue, so this only matters on a fresh broker until notification-service has started.
- be-notification-outbox-01 follow-ups: changelog line went into its own commit d82050d; analytics-service now uses the shared attemptOf/deferDelivery (same header x-analytics-attempt, same behaviour).
- be-notification-outbox-03: the validators are local to notification-service (notification-event.ts); analytics-event.ts was not refactored onto shared guards in libs/contracts (outside the package, no behaviour gain).
- Two files that were CRLF in git history (consumer.service.ts, libs/messaging event-publisher.spec.ts) are LF now (the rest of apps/ and libs/ is LF), so their commits show whole-file diffs.
- bruno docs for 8.1/8.3 updated (5227f67, 2b6e150).
- FRONTEND PART OF tz-matrix-04 is NOT done (lane rule): F-patient renders `t('notifications.kinds.<kind>')` from the new optional `kind` + `start` of the 8.1 item, falls back to `text`; see the tz-matrix-04 line above for the exact values.

Status: done
