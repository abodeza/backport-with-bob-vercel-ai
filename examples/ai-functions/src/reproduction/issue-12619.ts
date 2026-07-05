import { generateText, isStepCount, tool } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod';

const usage = {
  inputTokens: {
    total: 0,
    noCache: 0,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: {
    total: 0,
    text: 0,
    reasoning: undefined,
  },
};

const objectIdHex = '507f1f77bcf86cd799439011';

// Minimal ObjectId-like value: JSON.stringify serializes it to the hex string,
// but structural cloning / generic object cloning does not preserve that JSON
// representation.
class ObjectIdLike {
  toJSON() {
    return objectIdHex;
  }
}

async function main() {
  let responseCount = 0;

  const result = await generateText({
    model: new MockLanguageModelV4({
      doGenerate: async () => {
        switch (responseCount++) {
          case 0:
            return {
              content: [
                {
                  type: 'tool-call',
                  toolCallType: 'function',
                  toolCallId: 'call-1',
                  toolName: 'lookupRecord',
                  input: '{}',
                },
              ],
              finishReason: { unified: 'tool-calls', raw: 'tool-calls' },
              usage,
              warnings: [],
            };
          case 1:
            return {
              content: [{ type: 'text', text: 'done' }],
              finishReason: { unified: 'stop', raw: 'stop' },
              usage,
              warnings: [],
            };
          default:
            throw new Error(`Unexpected model call #${responseCount}`);
        }
      },
    }),
    prompt: 'look up the record',
    stopWhen: isStepCount(2),
    tools: {
      lookupRecord: tool({
        inputSchema: z.object({}),
        execute: async () => ({
          id: new ObjectIdLike(),
        }),
      }),
    },
  });

  const toolMessage = result.steps[0].response.messages.find(
    message => message.role === 'tool',
  );
  const observed = (toolMessage?.content[0] as any)?.output?.value;
  const expected = JSON.parse(JSON.stringify({ id: new ObjectIdLike() }));

  console.log('Expected JSON-serialized tool output:', expected);
  console.log('Observed generateText response.messages tool output:', observed);

  if (JSON.stringify(observed) !== JSON.stringify(expected)) {
    throw new Error(
      `Issue #12619 reproduced: tool output was not JSON-serialized before cloning. Expected ${JSON.stringify(
        expected,
      )}, got ${JSON.stringify(observed)}.`,
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
