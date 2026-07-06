import { anthropic } from '@ai-sdk/anthropic';
import { streamText, tool } from 'ai';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

async function main() {
  let executed = false;
  const rawChunks: string[] = [];
  const streamChunks: unknown[] = [];

  const result = streamText({
    model: anthropic('claude-haiku-4-5'),
    include: { rawChunks: true },
    tools: {
      sayHello: tool({
        description: 'Say hello',
        inputSchema: z.object({}),
        execute: async ({}) => {
          executed = true;
          console.log('Executing sayHello tool');
          return 'Hello!';
        },
      }),
    },
    toolChoice: {
      type: 'tool',
      toolName: 'sayHello',
    },
    prompt: 'Say hello!',
  });

  for await (const chunk of result.fullStream) {
    streamChunks.push(chunk);
    console.log(JSON.stringify(chunk));
    if (chunk.type === 'raw') {
      rawChunks.push(JSON.stringify(chunk.rawValue));
    }
  }

  fs.mkdirSync('output', { recursive: true });
  fs.writeFileSync(
    path.join('output', 'issue-11674.1.chunks.txt'),
    rawChunks.join('\n'),
  );

  const finish = streamChunks.find(
    chunk =>
      typeof chunk === 'object' &&
      chunk != null &&
      'type' in chunk &&
      chunk.type === 'finish',
  );
  const toolCalls = streamChunks.filter(
    chunk =>
      typeof chunk === 'object' &&
      chunk != null &&
      'type' in chunk &&
      chunk.type === 'tool-call',
  );

  if (!executed || toolCalls.length === 0) {
    throw new Error(
      `Issue #11674 reproduced: forced empty-schema tool was not executed. toolCalls=${toolCalls.length}; finish=${JSON.stringify(finish)}`,
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
