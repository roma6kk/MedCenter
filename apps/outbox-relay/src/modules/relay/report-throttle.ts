export class ReportThrottle {
  private readonly reportedAt = new Map<string, number>();

  constructor(
    private readonly intervalMs: number,
    private readonly capacity: number,
  ) {}

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
