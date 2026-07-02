import assert from 'node:assert/strict';
import { inspect } from 'node:util';
import {
  isStepCount,
  jsonSchema,
  smoothStream,
  streamText,
  tool,
} from 'ai';
import {
  convertArrayToReadableStream,
  MockLanguageModelV4,
} from 'ai/test';

const usage = {
  inputTokens: { total: 1, noCache: 1 },
  outputTokens: { total: 1, text: 1 },
};

const firstStepText =
  'I will help you replace Sunny with Rainy in hello.txt. First, let me read the file. ';
const secondStepText =
  'Now I can see the file contents. I will replace Sunny with Rainy. Done!';

async function runScenario({ useSmoothStream }) {
  let modelCallCount = 0;
  const events = [];

  const model = new MockLanguageModelV4({
    doStream: async () => {
      modelCallCount++;

      if (modelCallCount === 1) {
        return {
          stream: convertArrayToReadableStream([
            {
              type: 'response-metadata',
              id: 'id-1',
              modelId: 'mock-model',
              timestamp: new Date(0),
            },
            { type: 'text-start', id: 'text-1' },
            { type: 'text-delta', id: 'text-1', delta: firstStepText },
            { type: 'text-end', id: 'text-1' },
            {
              type: 'tool-call',
              toolCallId: 'call-1',
              toolName: 'readFile',
              input: '{"path":"hello.txt"}',
            },
            {
              type: 'finish',
              finishReason: { unified: 'tool-calls', raw: 'tool-calls' },
              usage,
            },
          ]),
        };
      }

      if (modelCallCount === 2) {
        return {
          stream: convertArrayToReadableStream([
            {
              type: 'response-metadata',
              id: 'id-2',
              modelId: 'mock-model',
              timestamp: new Date(0),
            },
            { type: 'text-start', id: 'text-2' },
            { type: 'text-delta', id: 'text-2', delta: secondStepText },
            { type: 'text-end', id: 'text-2' },
            {
              type: 'finish',
              finishReason: { unified: 'stop', raw: 'stop' },
              usage,
            },
          ]),
        };
      }

      throw new Error(`Unexpected model call ${modelCallCount}`);
    },
  });

  const result = streamText({
    model,
    prompt: 'replace "Sunny" with "Rainy" in hello.txt',
    tools: {
      readFile: tool({
        inputSchema: jsonSchema({
          type: 'object',
          properties: { path: { type: 'string' } },
          required: ['path'],
          additionalProperties: false,
        }),
        execute: async input => {
          // This intentionally mimics a user tool that logs its input while the
          // caller is printing result.textStream with process.stdout.write(...).
          const text = inspect(input, { compact: true, breakLength: Infinity });
          events.push({ kind: 'tool-console-log', text });
          return 'One\nSunny\nDay';
        },
      }),
    },
    stopWhen: isStepCount(2),
    ...(useSmoothStream
      ? {
          experimental_transform: [
            smoothStream({ delayInMs: 20, chunking: 'word' }),
          ],
        }
      : {}),
  });

  let visibleText = '';

  for await (const text of result.textStream) {
    visibleText += text;
    events.push({ kind: 'text', text, visibleText });
  }

  await result.response;

  const toolLogIndex = events.findIndex(event => event.kind === 'tool-console-log');
  const firstStepCompleteIndex = events.findIndex(
    event => event.kind === 'text' && event.visibleText.includes(firstStepText),
  );

  return {
    useSmoothStream,
    events,
    toolLogIndex,
    firstStepCompleteIndex,
    transcript: events
      .map(event =>
        event.kind === 'text' ? event.text : `\n${event.text}\n`,
      )
      .join(''),
  };
}

const baseline = await runScenario({ useSmoothStream: false });
const smoothed = await runScenario({ useSmoothStream: true });

console.log('Without smoothStream event order:');
console.log(
  baseline.events.map((event, index) => [index, event.kind, event.text]),
);
console.log('\nWith smoothStream event order:');
console.log(
  smoothed.events.map((event, index) => [index, event.kind, event.text]),
);
console.log('\nWith smoothStream terminal-like transcript:');
console.log(smoothed.transcript);

assert.notEqual(
  baseline.toolLogIndex,
  -1,
  'baseline should execute the tool and record its console.log',
);
assert.ok(
  baseline.toolLogIndex > baseline.firstStepCompleteIndex,
  'baseline sanity check failed: without smoothStream, the tool log should appear after the first step text has been emitted',
);

assert.ok(
  smoothed.toolLogIndex > smoothed.firstStepCompleteIndex,
  [
    'Reproduced issue #13199: smoothStream lets a tool console.log appear before the already-generated first-step text has finished streaming.',
    `toolLogIndex=${smoothed.toolLogIndex}, firstStepCompleteIndex=${smoothed.firstStepCompleteIndex}`,
    'The terminal-like transcript above shows the tool input object interleaved mid-response.',
  ].join('\n'),
);
