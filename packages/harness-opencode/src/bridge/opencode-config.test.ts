import { describe, expect, it } from 'vitest';
import {
  buildHostToolMcpEnvironment,
  buildOpenCodePermissionConfig,
} from './opencode-config';

describe('OpenCode bridge config helpers', () => {
  it('passes host tool schemas by path instead of inlining them in the MCP environment', () => {
    expect(
      buildHostToolMcpEnvironment({
        relayPort: 4111,
        toolSchemasPath: '/work/.agent-runs/s1/host-tool-schemas.json',
      }),
    ).toEqual({
      TOOL_SCHEMAS_PATH: '/work/.agent-runs/s1/host-tool-schemas.json',
      TOOL_RELAY_URL: 'http://127.0.0.1:4111',
    });
  });

  it('allows OpenCode builtin permissions when the harness runs in allow-all mode', () => {
    expect(
      buildOpenCodePermissionConfig({
        permissionMode: 'allow-all',
        inactiveToolNames: [],
      }),
    ).toMatchObject({
      edit: 'allow',
      bash: 'allow',
      external_directory: 'allow',
      webfetch: 'allow',
      doom_loop: 'allow',
      task: 'allow',
    });
  });

  it('keeps filtered tools gated even in allow-all mode', () => {
    expect(
      buildOpenCodePermissionConfig({
        permissionMode: 'allow-all',
        inactiveToolNames: ['bash', 'ls', 'agent'],
      }),
    ).toMatchObject({
      bash: 'ask',
      list: 'ask',
      task: 'ask',
      edit: 'allow',
    });
  });
});
