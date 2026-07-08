import {
  openai,
  type OpenAILanguageModelResponsesOptions,
} from '@ai-sdk/openai';
import { generateText } from 'ai';

async function main() {
  const result = await generateText({
    model: openai.responses('gpt-4.1-nano'),
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Read the CSV file and reply with exactly the names, separated by commas.',
          },
          {
            type: 'file',
            filename: 'names.csv',
            mediaType: 'text/csv',
            data: Buffer.from('name,role\nAda,engineer\nGrace,scientist\n'),
          },
        ],
      },
    ],
    providerOptions: {
      openai: {
        passThroughUnsupportedFiles: true,
      } satisfies OpenAILanguageModelResponsesOptions,
    },
  });

  console.log(
    JSON.stringify(
      {
        text: result.text,
        response: result.response,
        usage: result.usage,
      },
      null,
      2,
    ),
  );
}

await main();
