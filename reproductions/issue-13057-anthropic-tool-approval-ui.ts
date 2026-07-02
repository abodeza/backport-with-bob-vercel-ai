// Import built workspace packages directly so this script can run from the
// repository root without adding @ai-sdk/anthropic as a root dependency.
import { anthropic } from '../packages/anthropic/dist/index.js';
import {
  createAgentUIStream,
  jsonSchema,
  tool,
  ToolLoopAgent,
} from '../packages/ai/dist/index.js';

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error(
    'Missing ANTHROPIC_API_KEY. Set it to run the live Anthropic reproduction.',
  );
  process.exit(2);
}

const modelId = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-5-20250929';
const executeCalls: unknown[] = [];

const createIssue = tool({
  description: 'Create an issue in the tracker.',
  inputSchema: jsonSchema({
    type: 'object',
    properties: {
      title: { type: 'string' },
    },
    required: ['title'],
    additionalProperties: false,
  }),
  needsApproval: true,
  execute: async input => {
    executeCalls.push(input);
    return { id: '123', title: (input as { title: string }).title };
  },
});

const agent = new ToolLoopAgent({
  model: anthropic(modelId),
  tools: { createIssue },
  maxOutputTokens: 32,
});

// This is the UIMessage state produced after a client calls addToolApprovalResponse()
// for a needsApproval tool call. convertToModelMessages turns it into:
//   assistant: tool-call + tool-approval-request
//   tool:      tool-approval-response
// The Anthropic provider currently drops the tool-approval-response, so Anthropic
// receives a tool_use with no immediately following tool_result.
const uiMessages = [
  {
    id: 'user-1',
    role: 'user' as const,
    parts: [
      {
        type: 'text' as const,
        text: 'Create an issue titled "UI approval repro".',
      },
    ],
  },
  {
    id: 'assistant-1',
    role: 'assistant' as const,
    parts: [
      { type: 'step-start' as const },
      {
        type: 'tool-createIssue' as const,
        toolCallId: 'toolu_01A2B3C4D5E6F7G8H9J0K1L2',
        state: 'approval-responded' as const,
        input: { title: 'UI approval repro' },
        approval: {
          id: 'approval-13057',
          approved: true,
        },
      },
    ],
  },
];

async function main() {
  console.log(
    `Running issue #13057 reproduction against Anthropic model ${modelId}...`,
  );
  const stream = await createAgentUIStream({ agent, uiMessages });

  for await (const chunk of stream) {
    console.log('chunk', JSON.stringify(chunk));
  }

  if (executeCalls.length === 0) {
    console.error(
      'Reproduction inconclusive: stream completed, but the approved tool execute() was never called.',
    );
    process.exit(1);
  }

  console.log(
    'No failure observed: the approved tool was executed by the SDK.',
    executeCalls,
  );
}

main().catch(error => {
  const message = error instanceof Error ? error.message : String(error);
  const cause =
    error instanceof Error && error.cause instanceof Error
      ? error.cause.message
      : '';
  console.error('Caught error:', message);
  if (cause) console.error('Cause:', cause);
  console.error('Tool execute() calls before error:', executeCalls.length);

  if (
    `${message}\n${cause}`.includes(
      'tool_use ids were found without tool_result',
    )
  ) {
    console.error(
      'Reproduced issue #13057: Anthropic rejected the UI API approval response request.',
    );
    process.exit(1);
  }

  throw error;
});
