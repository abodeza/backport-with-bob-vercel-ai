import {
  AbstractChat,
  convertToModelMessages,
  generateText,
  MissingToolResultsError,
  type ChatState,
  type ChatStatus,
  type ChatTransport,
  type UIMessage,
} from 'ai';
import type { LanguageModelV4 } from '@ai-sdk/provider';
import type { UIMessageChunk } from 'ai';

class InMemoryChatState implements ChatState<UIMessage> {
  status: ChatStatus = 'ready';
  error: Error | undefined;
  messages: UIMessage[] = [];

  pushMessage(message: UIMessage) {
    this.messages = [...this.messages, message];
  }

  popMessage() {
    this.messages = this.messages.slice(0, -1);
  }

  replaceMessage(index: number, message: UIMessage) {
    this.messages = [
      ...this.messages.slice(0, index),
      structuredClone(message),
      ...this.messages.slice(index + 1),
    ];
  }

  snapshot<T>(thing: T): T {
    return structuredClone(thing);
  }
}

class LocalChat extends AbstractChat<UIMessage> {
  constructor(transport: ChatTransport<UIMessage>) {
    let id = 0;
    super({
      id: 'issue-12093',
      generateId: () => `message-${id++}`,
      state: new InMemoryChatState(),
      transport,
    });
  }
}

const usage = {
  inputTokens: {
    total: 0,
    noCache: 0,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

const localModel: LanguageModelV4 = {
  specificationVersion: 'v4',
  provider: 'local-reproduction',
  modelId: 'issue-12093',
  supportedUrls: {},
  async doGenerate() {
    return {
      content: [{ type: 'text', text: 'ok' }],
      finishReason: { unified: 'stop', raw: 'stop' },
      usage,
      warnings: [],
    };
  },
  async doStream() {
    return {
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue({ type: 'stream-start', warnings: [] });
          controller.enqueue({
            type: 'finish',
            finishReason: { unified: 'stop', raw: 'stop' },
            usage,
          });
          controller.close();
        },
      }),
    };
  },
};

function streamFromChunks(
  chunks: UIMessageChunk[],
): ReadableStream<UIMessageChunk> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

class ReproductionTransport implements ChatTransport<UIMessage> {
  calls: UIMessage[][] = [];

  async sendMessages({
    messages,
  }: Parameters<ChatTransport<UIMessage>['sendMessages']>[0]) {
    this.calls.push(structuredClone(messages));

    if (this.calls.length === 1) {
      // Simulate an API route that streams a frontend tool call requiring user input.
      return streamFromChunks([
        { type: 'start' },
        { type: 'start-step' },
        {
          type: 'tool-input-available',
          toolCallId: 'pick-option-call',
          toolName: 'pickOption',
          input: { options: ['A', 'B'] },
        },
        { type: 'finish-step' },
        { type: 'finish', finishReason: 'tool-calls' },
      ]);
    }

    // This mirrors the common server route shape:
    // streamText({ model, messages: await convertToModelMessages(messages) }).
    // The unresolved frontend tool call from the previous assistant message is
    // still in `messages`, so prompt validation throws MissingToolResultsError.
    const modelMessages = await convertToModelMessages(messages);
    await generateText({ model: localModel, messages: modelMessages });

    return streamFromChunks([
      { type: 'text-start', id: '0' },
      { type: 'text-delta', id: '0', delta: 'ok' },
      { type: 'text-end', id: '0' },
      { type: 'finish', finishReason: 'stop' },
    ]);
  }

  async reconnectToStream() {
    return null;
  }
}

async function main() {
  const transport = new ReproductionTransport();
  const chat = new LocalChat(transport);

  await chat.sendMessage({ text: 'Please make me pick one option.' });
  console.log('After first response:', JSON.stringify(chat.messages, null, 2));

  // Reproduce the reported user behavior: send another message without
  // providing addToolOutput for the pending pickOption frontend tool.
  await chat.sendMessage({ text: 'Never mind, answer something else.' });

  if (MissingToolResultsError.isInstance(chat.error)) {
    console.error('Reproduced issue #12093:', chat.error.message);
    throw chat.error;
  }

  if (chat.error) {
    throw new Error(
      `Unexpected chat error: ${chat.error.name}: ${chat.error.message}`,
    );
  }

  console.log(
    'Could not reproduce: second message completed without a missing tool result error.',
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
