export interface DomainEventBase {
  readonly v: 1;
  readonly eventId: string;
  readonly occurredAt: string;
}