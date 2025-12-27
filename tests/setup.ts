import { getClarinetVitestsArgv } from '@stacks/clarinet-sdk/vitest';
import { initSimnet } from '@stacks/clarinet-sdk';

// Run at module level (top-level await is supported in Vitest setup files)
const options = await getClarinetVitestsArgv();

(global as any).options = {
  clarinet: options,
};

// initSimnet loads Clarinet.toml and Simnet.toml (including accounts)
(global as any).simnet = await initSimnet(options.manifestPath);

(global as any).coverageReports = [];
(global as any).costsReports = [];
