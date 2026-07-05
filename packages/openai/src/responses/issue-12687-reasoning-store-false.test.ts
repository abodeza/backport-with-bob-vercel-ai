import type { ToolNameMapping } from '../../../provider-utils/src/create-tool-name-mapping';
import { describe, expect, it } from 'vitest';
import { convertToOpenAIResponsesInput } from './convert-to-openai-responses-input';

const testToolNameMapping: ToolNameMapping = {
  toProviderToolName: (customToolName: string) => customToolName,
  toCustomToolName: (providerToolName: string) => providerToolName,
};

describe('issue #12687', () => {
  it('omits reasoning item ids for Azure when store is false', async () => {
    const result = await convertToOpenAIResponsesInput({
      toolNameMapping: testToolNameMapping,
      prompt: [
        {
          role: 'assistant',
          content: [
            {
              type: 'reasoning',
              text: 'Prior encrypted reasoning summary',
              providerOptions: {
                azure: {
                  itemId: 'rs_issue_12687',
                  reasoningEncryptedContent:
                    'encrypted_reasoning_issue_12687',
                },
              },
            },
          ],
        },
      ],
      systemMessageMode: 'system',
      providerOptionsName: 'azure',
      store: false,
    });

    expect(result.input).toEqual([
      {
        type: 'reasoning',
        encrypted_content: 'encrypted_reasoning_issue_12687',
        summary: [
          {
            type: 'summary_text',
            text: 'Prior encrypted reasoning summary',
          },
        ],
      },
    ]);
  });
});
