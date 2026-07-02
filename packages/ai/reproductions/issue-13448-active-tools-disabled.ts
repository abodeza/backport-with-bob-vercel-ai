import { streamText, tool, simulateReadableStream, stepCountIs } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { z } from 'zod';

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};

let executed = false;

const model = new MockLanguageModelV3({
  doStream: async () => ({
    stream: simulateReadableStream({
      initialDelayInMs: 0,
      chunkDelayInMs: 0,
      chunks: [
        {
          type: 'tool-call',
          toolCallId: 'call_1',
          toolName: 'weather',
          input: JSON.stringify({ location: 'Basel' }),
        },
        {
          type: 'finish',
          finishReason: { unified: 'tool-calls', raw: undefined },
          usage,
        },
      ],
    }),
  }),
});

const result = streamText({
  model,
  prompt: 'test',
  tools: {
    weather: tool({
      inputSchema: z.object({ location: z.string() }),
      execute: async ({ location }) => {
        executed = true;
        return `weather for ${location}`;
      },
    }),
  },
  activeTools: [],
  stopWhen: stepCountIs(1),
});

await result.consumeStream();

const toolCalls = await result.toolCalls;
const toolResults = await result.toolResults;

console.log({
  executed,
  toolCalls,
  toolResults,
});

if (executed || toolResults.length > 0) {
  throw new Error(
    'Issue #13448 reproduced: activeTools: [] still allowed and executed the disabled weather tool.',
  );
}
