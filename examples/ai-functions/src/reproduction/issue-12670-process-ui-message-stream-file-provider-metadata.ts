import {
  createStreamingUIMessageState,
  processUIMessageStream,
} from '../../../../packages/ai/src/ui/process-ui-message-stream';
import type { UIMessageChunk } from '../../../../packages/ai/src/ui-message-stream/ui-message-chunks';
import type { UIMessage } from '../../../../packages/ai/src/ui/ui-messages';

function readableStreamFromArray<T>(items: T[]): ReadableStream<T> {
  return new ReadableStream<T>({
    start(controller) {
      for (const item of items) {
        controller.enqueue(item);
      }
      controller.close();
    },
  });
}

async function consumeStream<T>(stream: ReadableStream<T>): Promise<void> {
  const reader = stream.getReader();

  while (true) {
    const { done } = await reader.read();
    if (done) {
      return;
    }
  }
}

async function main() {
  const chunks: UIMessageChunk[] = [
    { type: 'start', messageId: 'msg-12670' },
    { type: 'start-step' },
    {
      type: 'file',
      mediaType: 'image/png',
      url: 'data:image/png;base64,iVBORw0KGgo=',
      providerMetadata: {
        customBackend: {
          fileId: 'file-12670',
        },
      },
    },
    { type: 'finish-step' },
    { type: 'finish' },
  ];

  const state = createStreamingUIMessageState<UIMessage>({
    messageId: 'msg-12670',
    lastMessage: undefined,
  });

  await consumeStream(
    processUIMessageStream({
      stream: readableStreamFromArray(chunks),
      runUpdateMessageJob: async job => {
        await job({
          state,
          write: () => {},
        });
      },
      onError: error => {
        throw error;
      },
    }),
  );

  const filePart = state.message.parts.find(part => part.type === 'file');

  if (filePart == null) {
    throw new Error('Expected processUIMessageStream to create a file part.');
  }

  const actualFileId = filePart.providerMetadata?.customBackend?.fileId;
  if (actualFileId !== 'file-12670') {
    throw new Error(
      `Expected file providerMetadata.customBackend.fileId to be preserved, but got ${JSON.stringify(
        filePart.providerMetadata,
      )}.`,
    );
  }

  console.log(
    'processUIMessageStream preserved file providerMetadata:',
    JSON.stringify(filePart.providerMetadata),
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
