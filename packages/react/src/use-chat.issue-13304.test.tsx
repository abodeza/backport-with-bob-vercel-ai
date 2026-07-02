import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ChatTransport, type UIMessageChunk } from 'ai';
import React, { act, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useChat } from './use-chat';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

describe('issue #13304: useChat id change during streaming', () => {
  it('aborts the library-created previous Chat stream when id changes', async () => {
    const abortSignals: AbortSignal[] = [];
    let streamController: ReadableStreamDefaultController<UIMessageChunk>;

    const transport: ChatTransport = {
      sendMessages: vi.fn(async ({ abortSignal }) => {
        abortSignals.push(abortSignal);

        return new ReadableStream<UIMessageChunk>({
          start(controller) {
            streamController = controller;
          },
        });
      }),
      reconnectToStream: vi.fn(),
    };

    function TestComponent() {
      const [chatId, setChatId] = useState('chat-a');
      const { id, sendMessage, status } = useChat({
        id: chatId,
        transport,
      });

      return (
        <div>
          <div data-testid="id">{id}</div>
          <div data-testid="status">{status}</div>
          <button
            type="button"
            data-testid="send"
            onClick={() =>
              sendMessage({
                role: 'user',
                parts: [{ type: 'text', text: 'hello' }],
              })
            }
          />
          <button
            type="button"
            data-testid="switch-chat"
            onClick={() => setChatId('chat-b')}
          />
        </div>
      );
    }

    render(<TestComponent />);

    await userEvent.click(screen.getByTestId('send'));

    await waitFor(() => {
      expect(transport.sendMessages).toHaveBeenCalledTimes(1);
    });

    act(() => {
      streamController.enqueue({ type: 'text-start', id: '0' });
      streamController.enqueue({ type: 'text-delta', id: '0', delta: 'hi' });
    });

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('streaming');
    });

    await userEvent.click(screen.getByTestId('switch-chat'));

    await waitFor(() => {
      expect(screen.getByTestId('id')).toHaveTextContent('chat-b');
    });

    let assertionError: unknown;
    try {
      expect(abortSignals[0].aborted).toBe(true);
    } catch (error) {
      assertionError = error;
    } finally {
      act(() => {
        streamController.enqueue({ type: 'text-end', id: '0' });
        streamController.enqueue({ type: 'finish', finishReason: 'stop' });
        streamController.close();
      });
    }

    if (assertionError) {
      throw assertionError;
    }
  });
});
