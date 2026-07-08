import { createGoogle } from '@ai-sdk/google';
import { generateText, isStepCount, tool } from 'ai';
import { z } from 'zod';

type CapturedCall = {
  url: string;
  requestBody: unknown;
  responseStatus: number;
  responseBody: unknown;
};

type GoogleRequestBody = {
  contents?: Array<{
    parts?: Array<unknown>;
  }>;
};

function readRequestBody(init: RequestInit | undefined): unknown {
  if (typeof init?.body !== 'string') {
    return undefined;
  }

  return JSON.parse(init.body);
}

async function readResponseBody(response: Response): Promise<unknown> {
  const responseText = await response.clone().text();

  try {
    return JSON.parse(responseText);
  } catch {
    return responseText;
  }
}

function hasSerializedPdfTextPart(part: unknown): boolean {
  if (typeof part !== 'object' || part == null || !('text' in part)) {
    return false;
  }

  const text = (part as { text?: unknown }).text;

  return (
    typeof text === 'string' &&
    text.includes('"type":"file"') &&
    text.includes('"mediaType":"application/pdf"') &&
    text.includes('"data":{"type":"data"')
  );
}

async function main() {
  const pdfBase64 = Buffer.from(
    '%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n',
  ).toString('base64');
  const capturedCalls: Array<CapturedCall> = [];

  const wrappedFetch: typeof fetch = async (input, init) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const response = await globalThis.fetch(input, init);

    capturedCalls.push({
      url,
      requestBody: readRequestBody(init),
      responseStatus: response.status,
      responseBody: await readResponseBody(response),
    });

    return response;
  };

  const google = createGoogle({ fetch: wrappedFetch });

  const result = await generateText({
    model: google('gemini-flash-lite-latest'),
    prompt:
      'Call catalogSearch once, then say whether metadata was returned. Do not inspect the PDF.',
    tools: {
      catalogSearch: tool({
        description: 'Returns catalog metadata and a PDF page.',
        inputSchema: z.object({}),
        execute: async () => ({ metadata: 'metadata' }),
        toModelOutput: () => ({
          type: 'content',
          value: [
            { type: 'text', text: 'metadata' },
            {
              type: 'file',
              data: { type: 'data', data: pdfBase64 },
              mediaType: 'application/pdf',
              filename: 'catalog.pdf',
            },
          ],
        }),
      }),
    },
    prepareStep: ({ stepNumber }) =>
      stepNumber === 0
        ? { toolChoice: { type: 'tool', toolName: 'catalogSearch' } }
        : { toolChoice: 'none' },
    stopWhen: isStepCount(2),
    maxOutputTokens: 64,
  });

  const secondRequestBody = capturedCalls[1]?.requestBody as
    | GoogleRequestBody
    | undefined;
  const secondRequestParts = secondRequestBody?.contents?.at(-1)?.parts ?? [];
  const serializedPdfTextPart = secondRequestParts.find(
    hasSerializedPdfTextPart,
  );

  console.log(
    JSON.stringify(
      {
        reproduced: serializedPdfTextPart != null,
        calls: capturedCalls.length,
        finalText: result.text,
        secondRequestParts,
      },
      null,
      2,
    ),
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
