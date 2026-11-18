const DURATION_BUCKETS: readonly number[] = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
const KNOWN_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);

function escapeLabel(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"');
}

function labelText(labels: Readonly<Record<string, string>>): string {
  const pairs = Object.entries(labels).map(([name, value]) => `${name}="${escapeLabel(value)}"`);
  return pairs.length === 0 ? '' : `{${pairs.join(',')}}`;
}

interface HistogramSeries {
  readonly buckets: number[];
  sum: number;
  count: number;
}

export class MetricsRegistry {
  private readonly counters = new Map<string, { labels: Record<string, string>; value: number }>();
  private readonly histograms = new Map<string, { labels: Record<string, string>; series: HistogramSeries }>();
  private readonly startedAt = Date.now();

  constructor(private readonly service: string) {}

  observeRequest(method: string, route: string, status: number, seconds: number): void {
    const labels = {
      method: KNOWN_METHODS.has(method.toUpperCase()) ? method.toUpperCase() : 'OTHER',
      route,
      status_class: `${Math.floor(status / 100)}xx`,
    };
    const key = JSON.stringify(labels);
    const counter = this.counters.get(key) ?? { labels, value: 0 };
    counter.value += 1;
    this.counters.set(key, counter);

    const entry = this.histograms.get(key) ?? {
      labels,
      series: { buckets: DURATION_BUCKETS.map(() => 0), sum: 0, count: 0 },
    };
    DURATION_BUCKETS.forEach((bound, index) => {
      if (seconds <= bound) {
        entry.series.buckets[index] += 1;
      }
    });
    entry.series.sum += seconds;
    entry.series.count += 1;
    this.histograms.set(key, entry);
  }

  render(): string {
    const base = { service: this.service };
    const lines: string[] = [
      '# HELP http_requests_total HTTP requests served, by method, route template and status class.',
      '# TYPE http_requests_total counter',
    ];
    for (const { labels, value } of this.counters.values()) {
      lines.push(`http_requests_total${labelText({ ...base, ...labels })} ${value}`);
    }
    lines.push(
      '# HELP http_request_duration_seconds HTTP request duration in seconds.',
      '# TYPE http_request_duration_seconds histogram',
    );
    for (const { labels, series } of this.histograms.values()) {
      DURATION_BUCKETS.forEach((bound, index) => {
        lines.push(
          `http_request_duration_seconds_bucket${labelText({ ...base, ...labels, le: String(bound) })} ${series.buckets[index]}`,
        );
      });
      lines.push(
        `http_request_duration_seconds_bucket${labelText({ ...base, ...labels, le: '+Inf' })} ${series.count}`,
        `http_request_duration_seconds_sum${labelText({ ...base, ...labels })} ${series.sum}`,
        `http_request_duration_seconds_count${labelText({ ...base, ...labels })} ${series.count}`,
      );
    }
    const memory = process.memoryUsage();
    const svc = labelText(base);
    lines.push(
      '# HELP process_uptime_seconds Seconds since the process started.',
      '# TYPE process_uptime_seconds gauge',
      `process_uptime_seconds${svc} ${(Date.now() - this.startedAt) / 1000}`,
      '# HELP process_resident_memory_bytes Resident set size.',
      '# TYPE process_resident_memory_bytes gauge',
      `process_resident_memory_bytes${svc} ${memory.rss}`,
      '# HELP nodejs_heap_used_bytes V8 heap in use.',
      '# TYPE nodejs_heap_used_bytes gauge',
      `nodejs_heap_used_bytes${svc} ${memory.heapUsed}`,
    );
    return `${lines.join('\n')}\n`;
  }
}
