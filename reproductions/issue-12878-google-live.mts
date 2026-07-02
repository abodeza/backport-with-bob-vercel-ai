import { spawnSync } from 'node:child_process';

const result = spawnSync(
  'pnpm',
  ['tsx', 'src/reproductions/issue-12878-google-live.ts'],
  {
    cwd: new URL('../examples/ai-functions', import.meta.url),
    stdio: 'inherit',
    env: process.env,
  },
);

process.exit(result.status ?? 1);
