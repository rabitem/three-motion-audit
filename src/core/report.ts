import type { Anomaly, AnomalyCode, MotionReport, Severity } from './types.js';

export interface FindingFilter {
  /** Severities that count. Defaults to errors and warnings. */
  severities?: readonly Severity[];
  /** Codes that never count. */
  ignore?: readonly AnomalyCode[];
}

/** The anomalies that fail a run under `filter`. */
export function findings(report: MotionReport, filter: FindingFilter = {}): Anomaly[] {
  const severities: readonly Severity[] = filter.severities ?? ['error', 'warn'];
  return report.anomalies.filter((anomaly) => severities.includes(anomaly.severity) && !filter.ignore?.includes(anomaly.code));
}

/** One line per anomaly: severity, code, time, frame and message, then `(xN)` when it happened N > 1 times. */
export function formatAnomalies(anomalies: readonly Anomaly[]): string {
  return anomalies
    .map((anomaly) => {
      const repeats = anomaly.count > 1 ? ` (x${anomaly.count})` : '';
      return `${anomaly.severity} ${anomaly.code} @${Math.round(anomaly.t)}ms frame ${anomaly.frame}: ${anomaly.message}${repeats}`;
    })
    .join('\n');
}

/** The first line of a failed no-anomalies check, the same in every runner. Internal: not exported from the package. */
export function failureHeader(report: MotionReport, count: number): string {
  const name = report.scenario ? `Scenario "${report.scenario}"` : 'The motion audit';
  return `${name} found ${count} anomal${count === 1 ? 'y' : 'ies'}:`;
}

/** Throws when the report has findings under `filter`. Works with any test runner. */
export function assertNoAnomalies(report: MotionReport, filter: FindingFilter = {}): void {
  const found = findings(report, filter);
  if (found.length === 0) return;
  throw new Error(`${failureHeader(report, found.length)}\n${formatAnomalies(found)}`);
}
