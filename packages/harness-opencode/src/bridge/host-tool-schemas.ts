import { readFileSync } from 'node:fs';

export type ToolSchema = {
  name: string;
  description?: string;
  inputSchema?: JsonSchemaObject;
};

export type JsonSchemaObject = {
  type?: string | string[];
  description?: string;
  properties?: Record<string, JsonSchemaObject>;
  required?: string[];
  items?: JsonSchemaObject;
  enum?: unknown[];
  const?: unknown;
  oneOf?: JsonSchemaObject[];
  anyOf?: JsonSchemaObject[];
  additionalProperties?: boolean | JsonSchemaObject;
  nullable?: boolean;
};

export function serializeToolSchemas(
  tools: readonly {
    name: string;
    description?: string;
    inputSchema?: unknown;
  }[],
): string {
  return JSON.stringify(
    tools.map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  );
}

export function readToolSchemasFromEnvironment(
  environment: NodeJS.ProcessEnv,
): ToolSchema[] {
  const schemasPath =
    environment.TOOL_SCHEMAS_PATH ?? environment.TOOL_SCHEMAS_FILE;
  const schemasJson = schemasPath
    ? readFileSync(schemasPath, 'utf8')
    : (environment.TOOL_SCHEMAS ?? '[]');
  return JSON.parse(schemasJson) as ToolSchema[];
}
