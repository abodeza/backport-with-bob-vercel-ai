import { google } from '@ai-sdk/google';
import { generateText, isStepCount, tool } from 'ai';
import { z } from 'zod/v4';

if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
  throw new Error(
    'GOOGLE_GENERATIVE_AI_API_KEY is required for this live reproduction.',
  );
}

const abort = new AbortController();
setTimeout(() => abort.abort(), 5_000);

let toolCalls = 0;
const started = Date.now();

try {
  const result = await generateText({
    model: google('gemini-2.0-flash'),
    prompt:
      'Call the slowTool exactly three times with different queries, then summarise. Do not skip any calls.',
    tools: {
      slowTool: tool({
        description: 'A tool that takes a while',
        inputSchema: z.object({ query: z.string() }),
        execute: async ({ query }) => {
          toolCalls++;
          await new Promise(resolve => setTimeout(resolve, 3_000));
          return { result: 'done', query };
        },
      }),
    },
    stopWhen: isStepCount(10),
    abortSignal: abort.signal,
  });

  const observation = {
    outcome: 'returned',
    finishReason: result.finishReason,
    steps: result.steps.length,
    signalAborted: abort.signal.aborted,
    toolCalls,
    elapsedMs: Date.now() - started,
  };
  console.log(JSON.stringify(observation, null, 2));

  if (abort.signal.aborted) {
    throw new Error('BUG: generateText returned normally after abortSignal.');
  }
} catch (error) {
  const observation = {
    outcome: 'threw',
    name: (error as Error)?.name,
    message: (error as Error)?.message,
    signalAborted: abort.signal.aborted,
    toolCalls,
    elapsedMs: Date.now() - started,
  };
  console.log(JSON.stringify(observation, null, 2));

  if ((error as Error)?.message === 'BUG: generateText returned normally after abortSignal.') {
    throw error;
  }

  if (!abort.signal.aborted) {
    throw error;
  }
}
