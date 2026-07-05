import 'dotenv/config';
import { createAnthropic } from '@ai-sdk/anthropic';
import { APICallError, streamText, tool } from 'ai';
import { z } from 'zod';

async function main() {
  const anthropic = createAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const model = anthropic(
    process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5-20251001',
  );

  const tools = {
    detectVoice: tool({
      description: 'Classify voice style',
      // This intentionally matches the issue report. In AI SDK v6 this property
      // was renamed to inputSchema, but the reported failure is that this call
      // shape sends an empty Anthropic input_schema and the provider rejects it.
      parameters: z.object({
        quadrant: z.string().describe('The voice quadrant'),
      }),
      execute: async (args: unknown) => ({ success: true, args }),
    } as any),
  };

  const result = streamText({
    model,
    messages: [{ role: 'user', content: 'Hello!' }],
    tools,
    maxOutputTokens: 16,
    maxRetries: 0,
    include: { requestBody: true },
  });

  let sawText = false;
  let requestBodyFromError: unknown;
  try {
    for await (const chunk of result.fullStream) {
      if (chunk.type === 'text-delta') {
        sawText = true;
        process.stdout.write(chunk.text);
      }

      if (chunk.type === 'error') {
        throw chunk.error;
      }
    }
  } catch (error) {
    if (APICallError.isInstance(error)) {
      requestBodyFromError = error.requestBodyValues;
      console.error('Anthropic API call failed.');
      console.error('Status code:', error.statusCode);
      console.error('Request body values:');
      console.error(JSON.stringify(error.requestBodyValues, null, 2));
      console.error('Response body:');
      console.error(error.responseBody);
    }

    if (requestBodyFromError != null) {
      assertSchemaWasPreserved(requestBodyFromError);
    }
    throw error;
  }

  const request = await result.request;
  assertSchemaWasPreserved(request.body);

  console.log(
    sawText
      ? '\nIssue #12020 did not reproduce: Anthropic accepted the tool schema request and streamed text.'
      : '\nIssue #12020 did not reproduce: Anthropic accepted the tool schema request.',
  );
}

function assertSchemaWasPreserved(requestBody: unknown) {
  const firstTool = (requestBody as { tools?: Array<{ input_schema?: any }> })
    ?.tools?.[0];
  const inputSchema = firstTool?.input_schema;
  const quadrantSchema = inputSchema?.properties?.quadrant;

  if (quadrantSchema?.type !== 'string') {
    throw new Error(
      `Issue #12020 reproduced: expected Anthropic input_schema.properties.quadrant to be preserved, but input_schema was ${JSON.stringify(
        inputSchema,
      )}`,
    );
  }

  if (
    !Array.isArray(inputSchema.required) ||
    !inputSchema.required.includes('quadrant')
  ) {
    throw new Error(
      `Issue #12020 reproduced: expected Anthropic input_schema.required to include "quadrant", but input_schema was ${JSON.stringify(
        inputSchema,
      )}`,
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
