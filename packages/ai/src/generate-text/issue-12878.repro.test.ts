import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { generateText, isStepCount, tool } from 'ai';
import { z } from 'zod/v4';

const testUsage = {
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
};

function waitForAbort(signal: AbortSignal | undefined): Promise<never> {
  return new Promise((_, reject) => {
    const abortError = () =>
      reject(new DOMException('The operation was aborted.', 'AbortError'));

    if (signal?.aborted) {
      abortError();
      return;
    }

    signal?.addEventListener('abort', abortError, { once: true });
  });
}

describe('issue #12878 reproduction', () => {
  it('propagates AbortError from a later model call in a multi-step tool loop', async () => {
    const abort = new AbortController();
    let doGenerateCalls = 0;

    const model = new MockLanguageModelV4({
      doGenerate: async ({ abortSignal }) => {
        switch (doGenerateCalls++) {
          case 0:
            return {
              finishReason: { unified: 'tool-calls', raw: 'tool-calls' },
              usage: testUsage,
              warnings: [],
              content: [
                {
                  type: 'tool-call',
                  toolCallType: 'function',
                  toolCallId: 'call-1',
                  toolName: 'slowTool',
                  input: JSON.stringify({ query: 'first' }),
                },
              ],
            };

          case 1:
            setTimeout(() => abort.abort(), 20);
            return await waitForAbort(abortSignal);

          default:
            throw new Error(`Unexpected doGenerate call ${doGenerateCalls}`);
        }
      },
    });

    await expect(
      generateText({
        model,
        prompt:
          'Call the slow tool multiple times with different queries, then summarise.',
        tools: {
          slowTool: tool({
            inputSchema: z.object({ query: z.string() }),
            execute: async () => {
              await new Promise(resolve => setTimeout(resolve, 50));
              return { result: 'done' };
            },
          }),
        },
        stopWhen: isStepCount(10),
        abortSignal: abort.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });

    expect(abort.signal.aborted).toBe(true);
    expect(doGenerateCalls).toBe(2);
  });
});
