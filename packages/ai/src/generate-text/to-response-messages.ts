import type {
  AssistantContent,
  AssistantModelMessage,
  ToolContent,
  ToolModelMessage,
} from '../prompt';
import { createToolModelOutput } from '../prompt/create-tool-model-output';
import type { ContentPart } from './content-part';
import type { ToolSet } from './tool-set';

/**
Converts the result of a `generateText` or `streamText` call to a list of response messages.
 */
export function toResponseMessages<TOOLS extends ToolSet>({
  content: inputContent,
  tools,
}: {
  content: Array<ContentPart<TOOLS>>;
  tools: TOOLS | undefined;
}): Array<AssistantModelMessage | ToolModelMessage> {
  const responseMessages: Array<AssistantModelMessage | ToolModelMessage> = [];
  const toolCallOrder = new Map<string, number>();

<<<<<<< HEAD
  const content: AssistantContent = inputContent
    .filter(part => part.type !== 'source')
    .filter(
      part =>
        (part.type !== 'tool-result' || part.providerExecuted) &&
        (part.type !== 'tool-error' || part.providerExecuted),
    )
    .filter(part => part.type !== 'text' || part.text.length > 0)
    .map(part => {
      switch (part.type) {
        case 'text':
          return {
            type: 'text',
            text: part.text,
            providerOptions: part.providerMetadata,
          };
        case 'reasoning':
          return {
            type: 'reasoning',
            text: part.text,
            providerOptions: part.providerMetadata,
          };
        case 'file':
          return {
            type: 'file',
            data: part.file.base64,
            mediaType: part.file.mediaType,
            providerOptions: part.providerMetadata,
          };
        case 'tool-call':
          return {
            type: 'tool-call',
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            input: part.input,
            providerExecuted: part.providerExecuted,
            providerOptions: part.providerMetadata,
          };
        case 'tool-result':
          return {
            type: 'tool-result',
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            output: createToolModelOutput({
              tool: tools?.[part.toolName],
              output: part.output,
              errorMode: 'none',
            }),
            providerExecuted: true,
            providerOptions: part.providerMetadata,
          };
        case 'tool-error':
          return {
            type: 'tool-result',
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            output: createToolModelOutput({
              tool: tools?.[part.toolName],
              output: part.error,
              errorMode: 'json',
            }),
            providerOptions: part.providerMetadata,
          };
=======
  const content: AssistantContent = [];
  for (const part of inputContent) {
    // Skip sources - they are response-only content that no provider expects back
    if (part.type === 'source') {
      continue;
    }

    // Skip non-provider-executed tool results/errors (they go in the tool message)
    if (
      (part.type === 'tool-result' || part.type === 'tool-error') &&
      !part.providerExecuted
    ) {
      continue;
    }

    // Skip empty text
    if (part.type === 'text' && part.text.length === 0) {
      continue;
    }

    switch (part.type) {
      case 'text':
        content.push({
          type: 'text',
          text: part.text,
          providerOptions: part.providerMetadata,
        });
        break;
      case 'custom':
        content.push({
          type: 'custom',
          kind: part.kind,
          providerOptions: part.providerMetadata,
        });
        break;
      case 'reasoning':
        content.push({
          type: 'reasoning',
          text: part.text,
          providerOptions: part.providerMetadata,
        });
        break;
      case 'file':
        content.push({
          type: 'file',
          data: part.file.base64,
          mediaType: part.file.mediaType,
          providerOptions: part.providerMetadata,
        });
        break;
      case 'reasoning-file':
        content.push({
          type: 'reasoning-file',
          data: part.file.base64,
          mediaType: part.file.mediaType,
          providerOptions: part.providerMetadata,
        });
        break;
      case 'tool-call':
        if (!toolCallOrder.has(part.toolCallId)) {
          toolCallOrder.set(part.toolCallId, toolCallOrder.size);
        }
        content.push({
          type: 'tool-call',
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          input:
            part.invalid && typeof part.input !== 'object' ? {} : part.input,
          providerExecuted: part.providerExecuted,
          providerOptions: part.providerMetadata,
        });
        break;
      case 'tool-result': {
        const output = await createToolModelOutput({
          toolCallId: part.toolCallId,
          input: part.input,
          tool: tools?.[part.toolName],
          output: part.output,
          errorMode: 'none',
        });
        content.push({
          type: 'tool-result',
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          output,
          providerOptions: part.providerMetadata,
        });
        break;
>>>>>>> ecfeb6f7b (fix: Parallel tool results are serialized in completion order, silently breaking provider prompt caching (#16578))
      }
    });

  if (content.length > 0) {
    responseMessages.push({
      role: 'assistant',
      content,
    });
  }

  const toolResultContent: ToolContent = inputContent
    .filter(part => part.type === 'tool-result' || part.type === 'tool-error')
    .filter(part => !part.providerExecuted)
    .map(toolResult => ({
      type: 'tool-result',
      toolCallId: toolResult.toolCallId,
      toolName: toolResult.toolName,
      output: createToolModelOutput({
        tool: tools?.[toolResult.toolName],
        output:
          toolResult.type === 'tool-result'
            ? toolResult.output
            : toolResult.error,
        errorMode: toolResult.type === 'tool-error' ? 'text' : 'none',
      }),
      ...(toolResult.providerMetadata != null
        ? { providerOptions: toolResult.providerMetadata }
        : {}),
    }));

  if (toolResultContent.length > 0) {
    responseMessages.push({
      role: 'tool',
      content: sortToolResultContentByToolCallOrder({
        toolResultContent,
        toolCallOrder,
      }),
    });
  }

  return responseMessages;
}

function sortToolResultContentByToolCallOrder({
  toolResultContent,
  toolCallOrder,
}: {
  toolResultContent: ToolContent;
  toolCallOrder: Map<string, number>;
}): ToolContent {
  const sortedToolResults = toolResultContent
    .filter(part => part.type === 'tool-result')
    .map((part, index) => ({ part, index }))
    .sort((a, b) => {
      const aOrder = toolCallOrder.get(a.part.toolCallId);
      const bOrder = toolCallOrder.get(b.part.toolCallId);

      if (aOrder == null && bOrder == null) {
        return a.index - b.index;
      }

      if (aOrder == null) {
        return 1;
      }

      if (bOrder == null) {
        return -1;
      }

      return aOrder - bOrder || a.index - b.index;
    })
    .map(({ part }) => part);

  let toolResultIndex = 0;

  return toolResultContent.map(part =>
    part.type === 'tool-result' ? sortedToolResults[toolResultIndex++] : part,
  );
}
