import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  readToolSchemasFromEnvironment,
  serializeToolSchemas,
} from './host-tool-schemas';

const tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

describe('host tool schemas', () => {
  it('serializes only the schema fields needed by the MCP bridge', () => {
    expect(
      serializeToolSchemas([
        {
          name: 'lookup',
          description: 'Lookup a value.',
          inputSchema: {
            type: 'object',
            properties: { query: { type: 'string' } },
            required: ['query'],
          },
        },
      ]),
    ).toBe(
      JSON.stringify([
        {
          name: 'lookup',
          description: 'Lookup a value.',
          inputSchema: {
            type: 'object',
            properties: { query: { type: 'string' } },
            required: ['query'],
          },
        },
      ]),
    );
  });

  it('reads schemas from TOOL_SCHEMAS_PATH before falling back to inline schemas', () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), 'opencode-tools-'));
    tempDirs.push(tempDir);
    const schemasPath = path.join(tempDir, 'tools.json');
    writeFileSync(
      schemasPath,
      JSON.stringify([
        {
          name: 'from-file',
          inputSchema: { type: 'object' },
        },
      ]),
    );

    expect(
      readToolSchemasFromEnvironment({
        TOOL_SCHEMAS_PATH: schemasPath,
        TOOL_SCHEMAS: JSON.stringify([{ name: 'inline' }]),
      }),
    ).toEqual([{ name: 'from-file', inputSchema: { type: 'object' } }]);
    expect(
      readToolSchemasFromEnvironment({
        TOOL_SCHEMAS: JSON.stringify([{ name: 'inline' }]),
      }),
    ).toEqual([{ name: 'inline' }]);
  });
});
