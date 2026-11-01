import { DEFAULT_BRIDGE_KEY, formatAnomalies, type MotionAuditBridge } from 'three-motion-audit';

/** A button that runs a scenario through the bridge and prints the findings, for trying the examples by hand. */
export function mountPanel(scenario: string): void {
  const panel = document.createElement('div');
  panel.className = 'panel';
  const button = document.createElement('button');
  button.textContent = 'Run scenario';
  const output = document.createElement('pre');
  output.textContent = 'Press the button to play the animation under the audit.';
  panel.append(button, output);
  document.body.append(panel);

  button.addEventListener('click', async () => {
    const bridge = (globalThis as unknown as Record<string, unknown>)[DEFAULT_BRIDGE_KEY] as MotionAuditBridge;
    button.disabled = true;
    output.textContent = 'Running…';
    const report = await bridge.run(scenario);
    output.textContent = report.passed
      ? `Clean: ${report.frames} frames, no anomalies.`
      : `${report.anomalies.length} anomal${report.anomalies.length === 1 ? 'y' : 'ies'}:\n${formatAnomalies(report.anomalies)}`;
    button.disabled = false;
  });
}
