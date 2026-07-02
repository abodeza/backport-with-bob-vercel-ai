import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  type ChatTransport,
  type UIMessage,
  type UIMessageChunk,
} from 'ai';
import { afterEach, describe, expect, it } from 'vitest';
import { Chat } from './chat.react';
import { useChat } from './use-chat';

function convertArrayToReadableStream<T>(chunks: T[]): ReadableStream<T> {
  return new ReadableStream<T>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

describe('issue #8597 reproduction', () => {
  afterEach(() => {
    cleanup();
  });

  it('forwards transient data parts to useChat onData when a shared Chat instance is passed', async () => {
    const contextLevelOnDataCalls: unknown[] = [];
    const hookLevelOnDataCalls: unknown[] = [];

    const chunks: UIMessageChunk[] = [
      { type: 'start', messageId: 'assistant-message' },
      { type: 'start-step' },
      {
        type: 'data-test',
        data: 'transient payload from server',
        transient: true,
      },
      { type: 'finish-step' },
      { type: 'finish', finishReason: 'stop' },
    ];

    const transport: ChatTransport<UIMessage> = {
      async sendMessages() {
        return convertArrayToReadableStream(chunks);
      },
      async reconnectToStream() {
        return null;
      },
    };

    // This mirrors the shared chat context from the issue reproduction app:
    // the Chat instance itself has an onData callback, and a component later
    // calls useChat({ chat, onData }) with the same shared Chat instance.
    const chat = new Chat<UIMessage>({
      id: 'issue-8597',
      generateId: () => 'generated-id',
      transport,
      onData: data => {
        contextLevelOnDataCalls.push(data);
      },
    });

    function TestComponent() {
      const { sendMessage } = (useChat as any)({
        chat,
        onData: (data: unknown) => {
          hookLevelOnDataCalls.push(data);
        },
      });

      return (
        <button
          data-testid="send"
          onClick={() => {
            sendMessage({ text: 'trigger data' });
          }}
        >
          send
        </button>
      );
    }

    render(<TestComponent />);

    await userEvent.click(screen.getByTestId('send'));

    await waitFor(() => {
      expect(contextLevelOnDataCalls).toStrictEqual([
        {
          type: 'data-test',
          data: 'transient payload from server',
          transient: true,
        },
      ]);
    });

    // This is the behavior reported in #8597: the shared Chat's onData fires,
    // but the component-level useChat onData is never invoked.
    expect(hookLevelOnDataCalls).toStrictEqual([
      {
        type: 'data-test',
        data: 'transient payload from server',
        transient: true,
      },
    ]);
  });
});
