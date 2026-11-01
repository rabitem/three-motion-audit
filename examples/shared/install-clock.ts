import { installVirtualClock } from 'three-motion-audit/clock';

// Imported first by each page, so the virtual clock replaces the timing globals before any animation code runs.
const mode = new URLSearchParams(location.search).get('clock');
if (mode === 'fast' || mode === 'play') installVirtualClock({ mode });
