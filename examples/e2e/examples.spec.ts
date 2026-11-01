import { expect, test } from '@playwright/test';
import { attachReport, expectAnomaly, expectNoAnomalies, runScenario } from 'three-motion-audit/playwright';

// Each page plays the same scene on the virtual clock, frames back to back.
for (const example of ['three', 'r3f']) {
  test.describe(example, () => {
    test('a clean slide has no anomalies', async ({ page }, testInfo) => {
      await page.goto(`/${example}/?clock=fast`);
      const report = await runScenario(page, 'slide');
      await attachReport(testInfo, report);
      expectNoAnomalies(report);
      expect(report.frames).toBeGreaterThan(90);
    });

    test('the seeded pop is caught as a teleport', async ({ page }, testInfo) => {
      await page.goto(`/${example}/?clock=fast&pop`);
      const report = await runScenario(page, 'slide');
      await attachReport(testInfo, report);
      expectAnomaly(report, 'teleport', 'box');
      expect(report.passed).toBe(false);
    });
  });
}
