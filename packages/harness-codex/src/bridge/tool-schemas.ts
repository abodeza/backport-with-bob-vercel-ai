import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

export type ToolSchema = {
  name: string;
  description?: string;
  inputSchema?: unknown;
};

export function toToolSchemas(tools: ReadonlyArray<ToolSchema>): ToolSchema[] {
  return tools.map(t => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  }));
}

export async function writeToolSchemasFile({
  bridgeStateDir,
  tools,
}: {
  bridgeStateDir: string;
  tools: ReadonlyArray<ToolSchema>;
}): Promise<string> {
  const path = `${bridgeStateDir}/tool-schemas-${randomUUID()}.json`;
  await writeFile(path, JSON.stringify(toToolSchemas(tools)), 'utf8');
  return path;
}

export function buildHarnessToolsMcpServerConfig({
  bootstrapDir,
  relayPort,
  toolSchemasPath,
}: {
  bootstrapDir: string;
  relayPort: number;
  toolSchemasPath: string;
}): Record<string, unknown> {
  return {
    enabled: true,
    command: 'node',
    args: [`${bootstrapDir}/host-tool-mcp.mjs`],
    env: {
      TOOL_SCHEMAS_PATH: toolSchemasPath,
      TOOL_RELAY_URL: `http://127.0.0.1:${relayPort}`,
    },
  };
}

export async function readToolSchemasFromEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<ToolSchema[]> {
  const raw =
    environment.TOOL_SCHEMAS_PATH != null &&
    environment.TOOL_SCHEMAS_PATH.length > 0
      ? await readFile(environment.TOOL_SCHEMAS_PATH, 'utf8')
      : environment.TOOL_SCHEMAS || '[]';
  return JSON.parse(raw) as ToolSchema[];
}
