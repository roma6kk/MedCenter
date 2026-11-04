/**
 * Lets a report through once per `intervalMs` for each key. A record the relay cannot read stays `pending` for good
 * and every poll reads it again, so its warning would repeat every couple of seconds and push the useful lines out
 * of the container log. At most `capacity` keys are remembered: the one reported longest ago is forgotten first.
 */
export class ReportThrottle {
  /** Insertion order is report order: a key is re-inserted when it is reported again. */
  private readonly reportedAt = new Map<string, number>();

  constructor(
    private readonly intervalMs: number,
    private readonly capacity: number,
  ) {}

  /** `true` when `key` was not reported within the interval; the call then counts as the report. */
  shouldReport(key: string, now: number = Date.now()): boolean {
    const last = this.reportedAt.get(key);
    if (last !== undefined && now - last < this.intervalMs) {
      return false;
    }
    this.reportedAt.delete(key);
    this.reportedAt.set(key, now);
    if (this.reportedAt.size > this.capacity) {
      const oldest = this.reportedAt.keys().next();
      if (oldest.done !== true) {
        this.reportedAt.delete(oldest.value);
      }
    }
    return true;
  }
}
