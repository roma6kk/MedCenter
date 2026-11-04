import { MetricsRegistry } from './metrics';
import { routeTemplate } from './apply-observability';

describe('MetricsRegistry', () => {
  it('should count and time requests by method, route template and status class', () => {
    const registry = new MetricsRegistry('svc');

    registry.observeRequest('get', '/api/v1/appointments/:id', 200, 0.03);
    registry.observeRequest('GET', '/api/v1/appointments/:id', 404, 0.2);

    const text = registry.render();
    expect(text).toContain('http_requests_total{service="svc",method="GET",route="/api/v1/appointments/:id",status_class="2xx"} 1');
    expect(text).toContain('status_class="4xx"} 1');
    expect(text).toContain('http_request_duration_seconds_bucket{service="svc",method="GET",route="/api/v1/appointments/:id",status_class="2xx",le="0.05"} 1');
    expect(text).toContain('le="+Inf"} 1');
    expect(text).toContain('process_uptime_seconds{service="svc"}');
  });

  it('should keep the label set bounded: a raw id never becomes a label and odd methods collapse', () => {
    const registry = new MetricsRegistry('svc');

    registry.observeRequest('BREW', 'unmatched', 404, 0.001);

    expect(registry.render()).toContain('method="OTHER",route="unmatched"');
  });
});

describe('routeTemplate', () => {
  it('should be the matched template, or unmatched', () => {
    expect(routeTemplate({ method: 'GET', baseUrl: '', route: { path: '/api/v1/x/:id' } })).toBe('/api/v1/x/:id');
    expect(routeTemplate({ method: 'GET' })).toBe('unmatched');
  });
});
