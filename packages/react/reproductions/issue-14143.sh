#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

pnpm exec tsc \
  --noEmit \
  --pretty false \
  --strict \
  --skipLibCheck \
  --esModuleInterop \
  --module ESNext \
  --moduleResolution Bundler \
  --target ES2020 \
  --jsx react-jsx \
  --types node \
  reproductions/issue-14143.ts
