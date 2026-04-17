export interface MetricsSnapshot {
  totalRequests: number;
  totalErrors: number;
  byRoute: Record<string, number>;
  byStatus: Record<string, number>;
  avgLatencyMs: number;
}

interface CounterState {
  totalRequests: number;
  totalErrors: number;
  totalLatencyMs: number;
  byRoute: Map<string, number>;
  byStatus: Map<number, number>;
}

const state: CounterState = {
  totalRequests: 0,
  totalErrors: 0,
  totalLatencyMs: 0,
  byRoute: new Map<string, number>(),
  byStatus: new Map<number, number>(),
};

export function recordRequest(route: string, status: number, latencyMs: number): void {
  state.totalRequests += 1;
  state.totalLatencyMs += Math.max(0, latencyMs);

  if (status >= 400) {
    state.totalErrors += 1;
  }

  const routeCount = state.byRoute.get(route) ?? 0;
  state.byRoute.set(route, routeCount + 1);

  const statusCount = state.byStatus.get(status) ?? 0;
  state.byStatus.set(status, statusCount + 1);
}

export function metricsSnapshot(): MetricsSnapshot {
  const byRoute: Record<string, number> = {};
  for (const [route, count] of state.byRoute.entries()) {
    byRoute[route] = count;
  }

  const byStatus: Record<string, number> = {};
  for (const [status, count] of state.byStatus.entries()) {
    byStatus[String(status)] = count;
  }

  return {
    totalRequests: state.totalRequests,
    totalErrors: state.totalErrors,
    byRoute,
    byStatus,
    avgLatencyMs: state.totalRequests > 0 ? Number((state.totalLatencyMs / state.totalRequests).toFixed(2)) : 0,
  };
}
