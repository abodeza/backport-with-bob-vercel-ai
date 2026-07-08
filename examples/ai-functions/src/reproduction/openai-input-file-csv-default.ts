import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';

async function main() {
  try {
    await generateText({
      model: openai.responses('gpt-4.1-nano'),
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'What names appear in the CSV? Reply with just the names.',
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
      maxOutputTokens: 40,
      providerOptions: {
        openai: {
          store: false,
        },
      },
    });

    console.log(
      JSON.stringify({
        issueReproduced: false,
        observed: 'The CSV file was accepted by the AI SDK.',
      }),
    );
  } catch (error) {
    console.log(
      JSON.stringify(
        {
          issueReproduced: true,
          observed: error instanceof Error ? error.message : String(error),
          expected:
            'OpenAI-supported text/csv files should be sent as input_file without an unsupported functionality error.',
        },
        null,
        2,
      ),
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
