import assert from 'node:assert/strict';
import { tool } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { ToolLoopAgent } from '../src/agent/tool-loop-agent';
import { NoOutputGeneratedError } from '../src/error/no-output-generated-error';
import { Output, stepCountIs } from '../src/generate-text';
import { MockLanguageModelV4 } from '../src/test/mock-language-model-v4';

const usage = {
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

let modelCallCount = 0;

const model = new MockLanguageModelV4({
  doGenerate: async options => {
    modelCallCount++;

    assert.equal(
      options.responseFormat?.type,
      'json',
      'The structured Output.object responseFormat should be sent to every model call.',
    );

    // Simulate the reported provider behavior: even on the final allowed step,
    // the model returns another tool call with finishReason "tool-calls".
    return {
      content: [
        {
          type: 'tool-call' as const,
          toolCallType: 'function' as const,
          toolCallId: `call-${modelCallCount}`,
          toolName: modelCallCount === 1 ? 'searchTool' : 'evaluateTool',
          input: '{}',
        },
      ],
      finishReason: { unified: 'tool-calls' as const, raw: 'tool-calls' },
      usage,
      warnings: [],
    };
  },
});

const agent = new ToolLoopAgent({
  model,
  tools: {
    searchTool: tool({
      inputSchema: z.object({}),
      execute: async () => ({ results: ['supplier-a'] }),
    }),
    evaluateTool: tool({
      inputSchema: z.object({}),
      execute: async () => ({ accepted: true }),
    }),
  },
  stopWhen: stepCountIs(2),
  prepareStep: ({ stepNumber, messages }) => {
    if (stepNumber >= 1) {
      return {
        messages: [
          ...messages,
          {
            role: 'user' as const,
            content:
              'Please prepare a final structured response now, even if you were going to call more tools.',
          },
        ],
      };
    }

    return {};
  },
  output: Output.object({
    schema: z.object({
      summary: z.string(),
    }),
  }),
});

const result = await agent.generate({
  prompt: 'Find and evaluate suppliers, then return the structured output.',
});

assert.equal(
  result.finishReason,
  'tool-calls',
  'The final step should be a tool-call finish caused by hitting stepCountIs(2).',
);
assert.equal(modelCallCount, 2, 'The stop condition should stop after 2 steps.');

try {
  // This is the reported failure: a ToolLoopAgent configured with Output.object
  // reaches the stepCountIs limit after a tool call, so no final structured
  // output was parsed and accessing output throws AI_NoOutputGeneratedError.
  console.log(result.output);
  throw new Error(
    'Expected accessing result.output to throw AI_NoOutputGeneratedError, but it returned successfully.',
  );
} catch (error) {
  if (NoOutputGeneratedError.isInstance(error)) {
    console.error(
      `Reproduced issue #13075: final finishReason=${result.finishReason}; accessing result.output throws ${error.name}.`,
    );
    process.exit(1);
  }

  throw error;
}
