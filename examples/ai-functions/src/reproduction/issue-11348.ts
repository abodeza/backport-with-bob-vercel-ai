import type { LanguageModelV4 } from '@ai-sdk/provider';
import { generateText, NoOutputGeneratedError, Output } from 'ai';
import { z } from 'zod/v4';

const schema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      value: z.boolean(),
    }),
  ),
});

const validJsonText = JSON.stringify({
  items: [
    { id: 'a', value: true },
    { id: 'b', value: false },
  ],
});

const modelWithUndefinedFinishReason: LanguageModelV4 = {
  specificationVersion: 'v4',
  provider: 'issue-11348-reproduction',
  modelId: 'undefined-finish-reason',
  supportedUrls: {},
  async doGenerate() {
    return {
      content: [{ type: 'text', text: validJsonText }],
      finishReason: {
        // Simulates a gateway/proxy response where the unified finish reason is
        // missing even though the response text contains complete valid JSON.
        unified: undefined,
        raw: undefined,
      } as any,
      usage: {
        inputTokens: {
          total: 1,
          noCache: 1,
          cacheRead: undefined,
          cacheWrite: undefined,
        },
        outputTokens: {
          total: 1,
          text: 1,
          reasoning: undefined,
        },
      },
      warnings: [],
    };
  },
  async doStream() {
    throw new Error('This reproduction only exercises generateText.');
  },
};

async function main() {
  const result = await generateText({
    model: modelWithUndefinedFinishReason,
    messages: [{ role: 'user', content: 'Generate items' }],
    output: Output.object({ schema }),
  });

  console.log('result.finishReason:', result.finishReason);
  console.log('result.text:', result.text);
  console.log(
    'Expected: result.output should parse the valid JSON text even when finishReason is undefined.',
  );

  try {
    console.log('result.output:', result.output);
  } catch (error) {
    if (NoOutputGeneratedError.isInstance(error)) {
      console.error('Observed NoOutputGeneratedError from result.output.');
    }
    throw error;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
