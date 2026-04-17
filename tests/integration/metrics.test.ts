import { describe, expect, it } from 'vitest';
import { metricsSnapshot, recordRequest } from '../../platform/observability/metrics';

describe('metrics collector', () => {
  it('tracks route, status and latency aggregates', () => {
    recordRequest('/api/health', 200, 10);
    recordRequest('/api/contact', 429, 25);

    const snapshot = metricsSnapshot();

    expect(snapshot.totalRequests).toBeGreaterThan(1);
    expect(snapshot.totalErrors).toBeGreaterThan(0);
    expect(snapshot.byRoute['/api/health']).toBeGreaterThan(0);
    expect(snapshot.byStatus['200']).toBeGreaterThan(0);
    expect(snapshot.avgLatencyMs).toBeGreaterThan(0);
  });
});
