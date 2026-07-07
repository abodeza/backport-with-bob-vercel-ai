import 'dotenv/config';
import {
  type OpenAIResponsesProviderOptions,
  createOpenAI,
} from '@ai-sdk/openai';
import { APICallError, generateText, stepCountIs } from 'ai';

const iterations = Number(process.env.REPRO_ITERATIONS ?? 5);
const modelId = process.env.REPRO_MODEL ?? 'gpt-5-mini';

const openai = createOpenAI({
  fetch: async (url, options) => {
    const response = await fetch(url, options);
    const bodyText = await response.clone().text();

    console.log(
      JSON.stringify(
        {
          fetch: {
            url: String(url),
            status: response.status,
            contentType: response.headers.get('content-type'),
            bodyLength: bodyText.length,
            jsonParse: tryParseJson(bodyText).ok ? 'ok' : 'failed',
            bodyPrefix: bodyText.slice(0, 300),
          },
        },
        null,
        2,
      ),
    );

    return response;
  },
});

async function main() {
  console.log(
    `Running ${iterations} OpenAI Responses API attempt(s) with ${modelId}.`,
  );

  for (let attempt = 1; attempt <= iterations; attempt++) {
    let stepNumber = 0;

    console.log(`\n========== ATTEMPT ${attempt}/${iterations} ==========\n`);

    try {
      const result = await generateText({
        model: openai.responses(modelId),
        prompt:
          'What happened in tech news today? Search the web, open a few pages, look for the keyword pattern "vercel", and summarize the findings in 3 bullet points.',
        tools: {
          web_search: openai.tools.webSearch({
            searchContextSize: 'high',
          }),
        },
        providerOptions: {
          openai: {
            reasoningEffort: 'high',
          } satisfies OpenAIResponsesProviderOptions,
        },
        stopWhen: stepCountIs(5),
        onStepFinish({ request, response, toolCalls, toolResults }) {
          stepNumber++;
          console.log(`\n========== STEP ${stepNumber} ==========\n`);
          console.log(
            JSON.stringify(
              {
                request,
                responseBodyType: typeof response.body,
                responseBodyKeys:
                  response.body && typeof response.body === 'object'
                    ? Object.keys(response.body)
                    : undefined,
                toolCalls: toolCalls.map(toolCall => ({
                  toolName: toolCall.toolName,
                  providerExecuted: toolCall.providerExecuted,
                })),
                toolResults: toolResults.map(toolResult => ({
                  toolName: toolResult.toolName,
                  providerExecuted: toolResult.providerExecuted,
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
            status: 'completed',
            finishReason: result.finishReason,
            steps: result.steps.length,
            toolCalls: result.toolCalls.map(toolCall => ({
              toolName: toolCall.toolName,
              providerExecuted: toolCall.providerExecuted,
            })),
            toolResults: result.toolResults.map(toolResult => ({
              toolName: toolResult.toolName,
              providerExecuted: toolResult.providerExecuted,
            })),
            textPrefix: result.text.slice(0, 300),
          },
          null,
          2,
        ),
      );
    } catch (error) {
      console.error(
        JSON.stringify(
          {
            attempt,
            status: 'failed',
            error: serializeError(error),
          },
          null,
          2,
        ),
      );

      throw error;
    }
  }
}

function tryParseJson(text: string): { ok: true } | { ok: false } {
  try {
    JSON.parse(text);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

function serializeError(error: unknown) {
  if (APICallError.isInstance(error)) {
    return {
      name: error.name,
      message: error.message,
      statusCode: error.statusCode,
      url: error.url,
      responseBody: error.responseBody,
      cause:
        error.cause instanceof Error
          ? {
              name: error.cause.name,
              message: error.cause.message,
            }
          : error.cause,
    };
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      cause:
        error.cause instanceof Error
          ? {
              name: error.cause.name,
              message: error.cause.message,
            }
          : error.cause,
    };
  }

  return error;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
