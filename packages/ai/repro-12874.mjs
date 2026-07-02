import { streamText, tool, stepCountIs } from 'ai';
import { z } from 'zod';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const aiPackage = require('ai/package.json');

const mode = process.argv[2] ?? 'stream-error-before-finish';

const usage = {
  inputTokens: { total: 0, noCache: 0 },
  outputTokens: { total: 0, text: 0 },
};

function createCrashingModel() {
  return {
    specificationVersion: 'v4',
    provider: 'mock',
    modelId: 'mock',
    get supportedUrls() {
      return {};
    },
    doGenerate: async () => {
      throw new Error('not implemented');
    },
    doStream: async () => ({
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue({
            type: 'response-metadata',
            id: 'resp-1',
            modelId: 'mock',
            timestamp: new Date(),
          });
          controller.enqueue({
            type: 'tool-call',
            toolCallId: 'call_1',
            toolName: 'slow_tool_a',
            input: '{"q":"a"}',
          });
          controller.enqueue({
            type: 'tool-call',
            toolCallId: 'call_2',
            toolName: 'slow_tool_b',
            input: '{"q":"b"}',
          });

          if (mode === 'error-after-finish') {
            controller.enqueue({
              type: 'finish',
              finishReason: { unified: 'tool-calls', raw: undefined },
              usage,
            });
          }

          // Error the model stream while tools are (or, in AI SDK v7's
          // refactored execution path, would have been) outstanding.
          setTimeout(() => {
            controller.error(new Error('simulated LLM stream error'));
          }, 50);
        },
      }),
    }),
  };
}

async function main() {
  let controllerClosedCrash = false;
  const unexpectedUnhandled = [];
  const seenChunks = [];
  const toolStarts = [];

  function recordUnhandled(kind, err) {
    const message = err?.message ?? String(err);
    console.error(`${kind}:`, message);
    if (message.includes('Controller is already closed')) {
      controllerClosedCrash = true;
    } else {
      unexpectedUnhandled.push({ kind, message });
    }
  }

  process.on('unhandledRejection', err =>
    recordUnhandled('unhandledRejection', err),
  );
  process.on('uncaughtException', err =>
    recordUnhandled('uncaughtException', err),
  );

  const result = streamText({
    model: createCrashingModel(),
    messages: [{ role: 'user', content: 'test' }],
    tools: {
      slow_tool_a: tool({
        description: 'Slow tool A',
        inputSchema: z.object({ q: z.string() }),
        execute: () =>
          new Promise(resolve => {
            toolStarts.push('slow_tool_a');
            setTimeout(() => resolve({ ok: true, tool: 'a' }), 2000);
          }),
      }),
      slow_tool_b: tool({
        description: 'Slow tool B',
        inputSchema: z.object({ q: z.string() }),
        execute: () =>
          new Promise(resolve => {
            toolStarts.push('slow_tool_b');
            setTimeout(() => resolve({ ok: true, tool: 'b' }), 3000);
          }),
      }),
    },
    toolChoice: 'auto',
    stopWhen: stepCountIs(10),
    onError: () => {},
  });

  let iteratorError;
  try {
    for await (const chunk of result.fullStream) {
      seenChunks.push(chunk.type);
    }
  } catch (error) {
    iteratorError = error;
    console.error('fullStream threw:', error?.message ?? String(error));
  }

  await new Promise(resolve => setTimeout(resolve, 4000));

  console.log(
    JSON.stringify(
      {
        aiVersion: aiPackage.version,
        mode,
        controllerClosedCrash,
        iteratorError: iteratorError?.message ?? null,
        unexpectedUnhandled,
        seenChunks,
        toolStarts,
      },
      null,
      2,
    ),
  );

  if (controllerClosedCrash) {
    console.error('Bug reproduced: Controller is already closed was unhandled.');
    process.exitCode = 1;
  } else if (unexpectedUnhandled.length > 0) {
    console.error('Unexpected unhandled error observed.');
    process.exitCode = 2;
  } else {
    console.log('No Controller is already closed crash observed.');
  }
}

main().catch(error => {
  console.error('repro harness failed:', error);
  process.exit(3);
});
