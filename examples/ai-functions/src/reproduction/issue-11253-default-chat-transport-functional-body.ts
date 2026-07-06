import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { DefaultChatTransport, type UIMessage } from 'ai';

async function readRequestBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  let rawBody = '<request not received>';
  let parsedBody: unknown;

  const server = createServer(
    async (req: IncomingMessage, res: ServerResponse) => {
      if (req.method !== 'POST' || req.url !== '/api/chat') {
        res.writeHead(404);
        res.end('not found');
        return;
      }

      rawBody = await readRequestBody(req);

      try {
        parsedBody = JSON.parse(rawBody);
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end(
          `req.json() failed because the request body was not valid JSON. rawBody=${JSON.stringify(
            rawBody,
          )}`,
        );
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.end();
    },
  );

  await new Promise<void>(resolve => {
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Expected server to listen on a TCP port.');
  }

  const editorRef = { current: { documentId: 'doc-from-ref' } };

  const transport = new DefaultChatTransport<UIMessage>({
    api: `http://127.0.0.1:${address.port}/api/chat`,
    prepareSendMessagesRequest({ messages, body }) {
      return {
        // This mirrors the issue report's runtime shape. It is cast because the
        // TypeScript type currently declares prepareSendMessagesRequest.body as
        // an object, but JavaScript users can return this function shape.
        body: (() => ({
          documentId: editorRef.current?.documentId || '',
          messages,
          ...body,
        })) as unknown as object,
      };
    },
  });

  try {
    await transport.sendMessages({
      chatId: 'chat-11253',
      messageId: 'msg-11253',
      trigger: 'submit-message',
      messages: [
        {
          id: 'msg-11253',
          role: 'user',
          parts: [{ type: 'text', text: 'Hello' }],
        },
      ],
      abortSignal: new AbortController().signal,
    });
  } finally {
    server.close();
  }

  const body = parsedBody as { documentId?: unknown; messages?: unknown };

  if (body.documentId !== 'doc-from-ref' || !Array.isArray(body.messages)) {
    throw new Error(
      `Expected functional prepareSendMessagesRequest body to be executed and serialized, but received rawBody=${JSON.stringify(
        rawBody,
      )} parsedBody=${JSON.stringify(parsedBody)}`,
    );
  }

  console.log('Functional prepareSendMessagesRequest body was serialized.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
