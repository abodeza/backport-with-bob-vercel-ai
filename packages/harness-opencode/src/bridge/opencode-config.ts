import type { StartMessage } from '../opencode-bridge-protocol';

type PermissionMode = StartMessage['permissionMode'];

export function buildOpenCodePermissionConfig({
  permissionMode,
  inactiveToolNames,
}: {
  permissionMode: PermissionMode;
  inactiveToolNames: ReadonlyArray<string>;
}): Record<string, 'allow' | 'ask'> {
  const allowAll = !permissionMode || permissionMode === 'allow-all';
  const allowEdits = allowAll || permissionMode === 'allow-edits';
  const permission: Record<string, 'allow' | 'ask'> = {
    read: 'allow',
    glob: 'allow',
    grep: 'allow',
    list: 'allow',
    webfetch: 'allow',
    edit: allowEdits ? 'allow' : 'ask',
    bash: allowAll ? 'allow' : 'ask',
    external_directory: allowAll ? 'allow' : 'ask',
    doom_loop: allowAll ? 'allow' : 'ask',
    task: allowAll ? 'allow' : 'ask',
  };

  for (const toolName of inactiveToolNames) {
    const permissionName = toPermissionToolName(toolName);
    if (permissionName === 'ls') {
      permission.list = 'ask';
    } else if (permissionName === 'agent') {
      permission.task = 'ask';
    } else {
      permission[permissionName] = 'ask';
    }
  }

  return permission;
}

export function buildHostToolMcpEnvironment({
  relayPort,
  toolSchemasPath,
}: {
  relayPort: number;
  toolSchemasPath: string;
}): Record<string, string> {
  return {
    TOOL_SCHEMAS_PATH: toolSchemasPath,
    TOOL_RELAY_URL: `http://127.0.0.1:${relayPort}`,
  };
}

function toPermissionToolName(action: string): string {
  const normalized = action.toLowerCase();
  if (normalized.includes('bash') || normalized.includes('shell'))
    return 'bash';
  if (normalized.includes('edit')) return 'edit';
  if (normalized.includes('write')) return 'write';
  if (normalized.includes('webfetch')) return 'webfetch';
  if (normalized.includes('task') || normalized.includes('agent'))
    return 'agent';
  if (normalized.includes('list')) return 'ls';
  if (normalized.includes('grep')) return 'grep';
  if (normalized.includes('glob')) return 'glob';
  if (normalized.includes('read')) return 'read';
  return normalized;
}
