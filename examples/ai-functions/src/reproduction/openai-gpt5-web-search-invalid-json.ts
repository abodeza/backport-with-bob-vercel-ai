import { createOpenAI } from '@ai-sdk/openai';
import { generateText, stepCountIs } from 'ai';

type FetchTrace = {
  attempt: number;
  requestBodyPreview?: string;
  responseContentType: string | null;
  responsePreview: string;
  status: number;
};

const traces: FetchTrace[] = [];
let currentAttempt = 0;

const openai = createOpenAI({
  fetch: async (url, options) => {
    const response = await fetch(url, options);
    let responsePreview = '<unavailable>';

    try {
      responsePreview = (await response.clone().text()).slice(0, 2000);
    } catch (error) {
      responsePreview = `<failed to read response clone: ${String(error)}>`;
    }

    traces.push({
      attempt: currentAttempt,
      requestBodyPreview:
        typeof options?.body === 'string'
          ? options.body.slice(0, 2000)
          : undefined,
      responseContentType: response.headers.get('content-type'),
      responsePreview,
      status: response.status,
    });

    return response;
  },
});

async function runAttempt(attempt: number) {
  currentAttempt = attempt;
  let stepNumber = 0;

  const result = await generateText({
    model: openai.responses('gpt-5-mini'),
    prompt:
      'What happened in tech news today? Use web search with a high search context, open a few relevant pages, and look for mentions of Vercel or the AI SDK. Return a concise summary.',
    tools: {
      web_search: openai.tools.webSearch({
        searchContextSize: 'high',
      }),
    },
    providerOptions: {
      openai: {
        reasoningEffort: 'high',
      },
    },
    stopWhen: stepCountIs(5),
    onStepFinish({ finishReason, request, response, toolCalls }) {
      stepNumber++;
      console.log(
        `\n========== ATTEMPT ${attempt} STEP ${stepNumber} ==========`,
      );
      console.log(
        JSON.stringify(
          {
            finishReason,
            request,
            responseBody: response.body,
            toolCalls: toolCalls.map(toolCall => ({
              toolName: toolCall.toolName,
              providerExecuted: toolCall.providerExecuted,
            })),
          },
          null,
          2,
        ),
      );
    },
  });

  console.log(
    JSON.stringify(
      {
        attempt,
        finishReason: result.finishReason,
        steps: result.steps.length,
        toolCalls: result.toolCalls.length,
        toolResults: result.toolResults.length,
        textPreview: result.text.slice(0, 500),
      },
      null,
      2,
    ),
  );
}

async function main() {
  const iterations = Number(process.env.REPRO_ITERATIONS ?? '5');
  console.log(
    `Running ${iterations} OpenAI Responses API attempt(s) with gpt-5-mini and web_search.`,
  );

  for (let attempt = 1; attempt <= iterations; attempt++) {
    try {
      await runAttempt(attempt);
    } catch (error) {
      console.error(`Attempt ${attempt} failed.`);
      console.error(error);
      console.error(
        JSON.stringify(
          {
            recentFetchTraces: traces.filter(
              trace => trace.attempt === attempt,
            ),
          },
          null,
          2,
        ),
      );

      if (
        error instanceof Error &&
        error.name === 'AI_APICallError' &&
        error.message.includes('Invalid JSON response')
      ) {
        console.error('Reproduced AI_APICallError: Invalid JSON response.');
      }

      process.exitCode = 1;
      return;
    }
  }

  console.log(
    `Completed ${iterations} attempt(s) without AI_APICallError: Invalid JSON response.`,
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
