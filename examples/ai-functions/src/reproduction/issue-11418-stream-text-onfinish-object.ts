import assert from 'node:assert/strict';
import { Output, streamText } from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV3 } from 'ai/test';
import { z } from 'zod';

async function main() {
  let onFinishEvent: Record<string, unknown> | undefined;

  const result = streamText({
    model: new MockLanguageModelV3({
      doStream: async () => ({
        stream: convertArrayToReadableStream([
          { type: 'text-start', id: '0' },
          { type: 'text-delta', id: '0', delta: '{ ' },
          { type: 'text-delta', id: '0', delta: '"content": ' },
          { type: 'text-delta', id: '0', delta: '"Hello, ' },
          { type: 'text-delta', id: '0', delta: 'world' },
          { type: 'text-delta', id: '0', delta: '!"' },
          { type: 'text-delta', id: '0', delta: ' }' },
          { type: 'text-end', id: '0' },
          {
            type: 'finish',
            finishReason: { raw: undefined, unified: 'stop' },
            logprobs: undefined,
            usage: {
              inputTokens: {
                total: 3,
                noCache: 3,
                cacheRead: undefined,
                cacheWrite: undefined,
              },
              outputTokens: {
                total: 10,
                text: 10,
                reasoning: undefined,
              },
            },
          },
        ]),
      }),
    }),
    output: Output.object({
      schema: z.object({ content: z.string() }),
    }),
    prompt: 'Return a JSON object with a content property.',
    onFinish: async event => {
      onFinishEvent = event as unknown as Record<string, unknown>;
    },
  });

  await result.consumeStream();

  const parsedOutput = await result.output;
  assert.deepEqual(parsedOutput, { content: 'Hello, world!' });
  assert.ok(onFinishEvent, 'Expected streamText onFinish to be called.');

  console.log('result.output:', parsedOutput);
  console.log('onFinish event keys:', Object.keys(onFinishEvent).sort());

  assert.deepEqual(
    onFinishEvent.object,
    parsedOutput,
    'Expected streamText onFinish event to expose an `object` property with the full parsed structured output, matching the v5 streamObject onFinish shape.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
