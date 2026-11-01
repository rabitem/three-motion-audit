import { expect, type Page, type TestInfo } from '@playwright/test';
import { failureHeader, findings, formatAnomalies, type FindingFilter } from '../core/report.js';
import type { AnomalyCode, MotionReport } from '../core/types.js';
import { DEFAULT_BRIDGE_KEY, type BridgeStatus, type MotionAuditBridge } from '../scenario/expose.js';

export interface BridgeOptions {
  /** The `globalThis` key the page exposed its audit under. */
  key?: string;
  /**
   * How long to wait for the page to expose its audit, real ms. Defaults to the page's default
   * timeout (`actionTimeout`, or none when unset). A scenario run itself is bounded by its own wait
   * timeouts and the test timeout.
   */
  timeout?: number;
}

type Scope = Record<string, MotionAuditBridge | undefined>;

/** Waits until the page has exposed its audit, with or without scenarios; returns the bridge key. */
async function waitForBridge(page: Page, options: BridgeOptions): Promise<string> {
  const key = options.key ?? DEFAULT_BRIDGE_KEY;
  await page.waitForFunction((bridgeKey) => Boolean((globalThis as unknown as Scope)[bridgeKey]), key, { timeout: options.timeout });
  return key;
}

/** Waits until the page has exposed its audit (`exposeMotionAudit`) and registered at least one scenario. */
export async function waitForMotionAudit(page: Page, options: BridgeOptions = {}): Promise<string[]> {
  const key = options.key ?? DEFAULT_BRIDGE_KEY;
  await page.waitForFunction((bridgeKey) => {
    const bridge = (globalThis as unknown as Scope)[bridgeKey];
    return Boolean(bridge && bridge.scenarios().length > 0);
  }, key, { timeout: options.timeout });
  return page.evaluate((bridgeKey) => (globalThis as unknown as Scope)[bridgeKey]!.scenarios(), key);
}

/** Runs a scenario the page registered and returns its report. */
export async function runScenario(page: Page, name: string, options: BridgeOptions = {}): Promise<MotionReport> {
  const key = options.key ?? DEFAULT_BRIDGE_KEY;
  await waitForMotionAudit(page, options);
  return page.evaluate(([bridgeKey, scenario]) => (globalThis as unknown as Scope)[bridgeKey]!.run(scenario), [key, name] as const);
}

/** Waits for the bridge (no scenario needed), then returns the page audit's status: the running scenario, frames recorded, whether anything moves. */
export async function auditStatus(page: Page, options: BridgeOptions = {}): Promise<BridgeStatus> {
  const key = await waitForBridge(page, options);
  return page.evaluate((bridgeKey) => (globalThis as unknown as Scope)[bridgeKey]!.status(), key);
}

/** Fails the test when the report has errors or warnings (or what `filter` selects), listing each one. */
export function expectNoAnomalies(report: MotionReport, filter: FindingFilter = {}): void {
  const found = findings(report, filter);
  expect(found, `${failureHeader(report, found.length)}\n${formatAnomalies(found)}`).toEqual([]);
}

/** Fails the test unless the report has an anomaly with `code` (and `subject`, when given). */
export function expectAnomaly(report: MotionReport, code: AnomalyCode, subject?: string): void {
  const match = report.anomalies.find((anomaly) => anomaly.code === code && (subject === undefined || anomaly.subject === subject));
  const seen = report.anomalies.length > 0 ? formatAnomalies(report.anomalies) : 'none';
  expect(match, `Expected anomaly \`${code}\`${subject ? ` on ${subject}` : ''}. Found:\n${seen}`).toBeDefined();
}

/** Attaches the report to the test result as JSON, for the HTML reporter and CI artefacts. */
export async function attachReport(testInfo: TestInfo, report: MotionReport): Promise<void> {
  await testInfo.attach(`${report.scenario ?? 'motion-audit'}.json`, { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
}
