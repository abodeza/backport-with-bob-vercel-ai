import assert from 'node:assert/strict';
import {
  lastAssistantMessageIsCompleteWithToolCalls,
  type UIMessage,
} from 'ai';

async function main() {
  const messages: UIMessage[] = [
    {
      id: 'user-2',
      role: 'user',
      parts: [{ type: 'text', text: 'get from docs aws templates' }],
    },
    {
      id: 'assistant-2',
      role: 'assistant',
      parts: [
        { type: 'reasoning', text: 'Searching...' },
        { type: 'step-start' },
        {
          type: 'tool-Docs',
          toolCallId: 'call-1',
          state: 'output-available',
          input: { query: 'some query' },
          output: {
            success: true,
            queryResult: 'huge data result ...',
          },
        },
        { type: 'text', text: 'Prompt is too long' },
      ],
    },
  ];

  const actual = lastAssistantMessageIsCompleteWithToolCalls({ messages });
  console.log(
    `lastAssistantMessageIsCompleteWithToolCalls returned: ${actual}`,
  );

  assert.equal(
    actual,
    false,
    'expected no automatic chat resume after a backend tool output is followed by an error text response',
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
