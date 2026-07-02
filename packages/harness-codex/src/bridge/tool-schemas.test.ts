import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { describe, expect, test } from 'vitest';
import {
  buildHarnessToolsMcpServerConfig,
  readToolSchemasFromEnvironment,
  writeToolSchemasFile,
} from './tool-schemas';

describe('tool schema file transport', () => {
  test('stores schemas in a file and keeps the MCP config small', async () => {
    const dir = await mkdtemp(`${tmpdir()}/harness-codex-tool-schemas-`);
    try {
      const tools = [
        {
          name: 'large_tool',
          description: 'large schema description',
          inputSchema: {
            type: 'object',
            properties: {
              field: {
                type: 'string',
                description: 'x'.repeat(200_000),
              },
            },
          },
        },
      ];

      const toolSchemasPath = await writeToolSchemasFile({
        bridgeStateDir: dir,
        tools,
      });
      const mcpConfig = buildHarnessToolsMcpServerConfig({
        bootstrapDir: '/tmp/harness/codex',
        relayPort: 4319,
        toolSchemasPath,
      });

      expect(
        await readToolSchemasFromEnvironment({
          TOOL_SCHEMAS_PATH: toolSchemasPath,
        }),
      ).toEqual(tools);
      expect(await readFile(toolSchemasPath, 'utf8')).toContain(
        'large schema description',
      );
      expect(JSON.stringify(mcpConfig)).toContain('TOOL_SCHEMAS_PATH');
      expect(JSON.stringify(mcpConfig)).not.toContain(
        'large schema description',
      );
      expect(JSON.stringify(mcpConfig).length).toBeLessThan(1_000);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('keeps TOOL_SCHEMAS as a fallback for older bridge launches', async () => {
    const tools = [{ name: 'fallback_tool', inputSchema: { type: 'object' } }];

    await expect(
      readToolSchemasFromEnvironment({ TOOL_SCHEMAS: JSON.stringify(tools) }),
    ).resolves.toEqual(tools);
  });
});
