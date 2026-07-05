import {
  AbstractChat,
  type ChatInit,
  type ChatState,
  type ChatStatus,
  type ChatTransport,
  type UIMessage,
  type UIMessageChunk,
} from 'ai';

class ReproductionChatState implements ChatState<UIMessage> {
  status: ChatStatus = 'ready';
  messages: UIMessage[];
  error: Error | undefined;

  constructor(messages: UIMessage[] = []) {
    this.messages = messages;
  }

  pushMessage = (message: UIMessage) => {
    this.messages = [...this.messages, message];
  };

  popMessage = () => {
    this.messages = this.messages.slice(0, -1);
  };

  replaceMessage = (index: number, message: UIMessage) => {
    this.messages = [
      ...this.messages.slice(0, index),
      message,
      ...this.messages.slice(index + 1),
    ];
  };

  snapshot = <T>(value: T): T => structuredClone(value);
}

class ReproductionChat extends AbstractChat<UIMessage> {
  constructor(init: ChatInit<UIMessage>) {
    super({
      ...init,
      state: new ReproductionChatState(init.messages),
    });
  }
}

function createResponseStream(): ReadableStream<UIMessageChunk> {
  const chunks: UIMessageChunk[] = [
    { type: 'start' },
    { type: 'start-step' },
    { type: 'text-start', id: 'text-1' },
    { type: 'text-delta', id: 'text-1', delta: 'hello' },
    { type: 'text-end', id: 'text-1' },
    { type: 'finish-step' },
    { type: 'finish', finishReason: 'stop' },
  ];

  return new ReadableStream<UIMessageChunk>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

const transport: ChatTransport<UIMessage> = {
  async sendMessages() {
    return createResponseStream();
  },
  async reconnectToStream() {
    return null;
  },
};

async function main() {
  const finishError = new Error('issue-12175 onFinish error');
  const loggedErrors: unknown[] = [];
  const originalConsoleError = console.error;

  console.error = (...args: unknown[]) => {
    loggedErrors.push(args[0]);
    originalConsoleError(...args);
  };

  let rejectedWith: unknown;

  try {
    const chat = new ReproductionChat({
      id: 'issue-12175',
      generateId: (() => {
        let id = 0;
        return () => `id-${id++}`;
      })(),
      transport,
      onFinish: () => {
        throw finishError;
      },
    });

    await chat.sendMessage({ text: 'trigger onFinish' });
  } catch (error) {
    rejectedWith = error;
  } finally {
    console.error = originalConsoleError;
  }

  if (rejectedWith !== finishError) {
    throw new Error(
      [
        'Expected chat.sendMessage() to reject with the error thrown by onFinish.',
        rejectedWith == null
          ? 'Observed: chat.sendMessage() resolved instead.'
          : `Observed: chat.sendMessage() rejected with ${String(rejectedWith)}.`,
        `console.error received onFinish error: ${loggedErrors.includes(
          finishError,
        )}.`,
      ].join('\n'),
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
