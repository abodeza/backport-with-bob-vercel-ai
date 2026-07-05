import { createAzure } from '@ai-sdk/azure';
import { generateText, type ModelMessage } from 'ai';

async function main() {
  let requestBody: any;

  const azure = createAzure({
    resourceName: 'issue-12687-reproduction',
    apiKey: 'test-api-key',
    fetch: async (_url, init) => {
      requestBody = JSON.parse(init?.body as string);

      return new Response(
        JSON.stringify({
          id: 'resp_issue_12687',
          created_at: 1,
          model: 'gpt-5-mini',
          output: [
            {
              type: 'message',
              id: 'msg_issue_12687',
              role: 'assistant',
              content: [
                {
                  type: 'output_text',
                  text: 'ok',
                  annotations: [],
                },
              ],
            },
          ],
          usage: {
            input_tokens: 1,
            output_tokens: 1,
          },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      );
    },
  });

  const messages: ModelMessage[] = [
    {
      role: 'user',
      content: [{ type: 'text', text: 'Initial question' }],
    },
    {
      role: 'assistant',
      content: [
        {
          type: 'reasoning',
          text: 'Prior encrypted reasoning summary',
          providerOptions: {
            azure: {
              itemId: 'rs_issue_12687',
              reasoningEncryptedContent: 'encrypted_reasoning_issue_12687',
            },
          },
        },
        { type: 'text', text: 'Prior answer' },
      ],
    },
    {
      role: 'user',
      content: [{ type: 'text', text: 'Follow up' }],
    },
  ];

  await generateText({
    model: azure.responses('gpt-5-mini'),
    messages,
    providerOptions: {
      azure: {
        store: false,
        forceReasoning: true,
      },
    },
  });

  const reasoningItem = requestBody?.input?.find(
    (item: any) => item.type === 'reasoning',
  );

  console.log(JSON.stringify({ store: requestBody?.store, reasoningItem }));

  if (reasoningItem == null) {
    throw new Error('No reasoning item was sent in the Azure request payload.');
  }

  if ('id' in reasoningItem) {
    throw new Error(
      `Reproduced issue #12687: store:false request reasoning item still includes id ${JSON.stringify(reasoningItem.id)}.`,
    );
  }

  console.log(
    'Could not reproduce issue #12687: reasoning item id was omitted.',
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
