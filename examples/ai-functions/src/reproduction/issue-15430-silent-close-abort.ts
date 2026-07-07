import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4StreamPart,
} from '@ai-sdk/provider';
import { streamText } from 'ai';

const startedAt = Date.now();
const t = () => `${Date.now() - startedAt}ms`;

function raceWithWatchdog<T>(promise: PromiseLike<T>, timeoutMs: number) {
  return Promise.race([
    Promise.resolve(promise).then(
      value => ({ status: 'resolved' as const, value }),
      error => ({ status: 'rejected' as const, error }),
    ),
    new Promise<{ status: 'watchdog'; error: Error }>(resolve =>
      setTimeout(
        () =>
          resolve({
            status: 'watchdog',
            error: new Error(`watchdog ${timeoutMs}ms - promise still pending`),
          }),
        timeoutMs,
      ),
    ),
  ]);
}

class StalledAfterBodyCancellationModel implements LanguageModelV4 {
  readonly specificationVersion = 'v4';
  readonly provider = 'reproduction';
  readonly modelId = 'issue-15430-silent-close';
  readonly supportedUrls = {};

  doGenerate = async () => {
    throw new Error('doGenerate is not used in this reproduction');
  };

  doStream = async ({ abortSignal }: LanguageModelV4CallOptions) => {
    const stream = new ReadableStream<LanguageModelV4StreamPart>({
      start(controller) {
        console.log(`[${t()}] model stream starts (headers/body available)`);
        controller.enqueue({ type: 'stream-start', warnings: [] });
        controller.enqueue({
          type: 'response-metadata',
          id: 'response-id',
          modelId: 'issue-15430-silent-close',
          timestamp: new Date(0),
        });
        controller.enqueue({ type: 'text-start', id: 'text-1' });
        controller.enqueue({
          type: 'text-delta',
          id: 'text-1',
          delta: 'partial text before abort',
        });

        setTimeout(() => {
          console.log(
            `[${t()}] inner fetch timeout fired; simulating lost terminal event with stream left open`,
          );
        }, 50);

        abortSignal?.addEventListener(
          'abort',
          () => {
            console.log(`[${t()}] outer streamText abortSignal fired`);
          },
          { once: true },
        );
      },
    });

    return {
      stream,
      request: { body: 'reproduction request' },
      response: { headers: {} },
    };
  };
}

async function main() {
  const outerAbortController = new AbortController();
  const outerAbortAfterMs = 100;
  const watchdogMs = 500;

  setTimeout(() => outerAbortController.abort(), outerAbortAfterMs);

  const result = streamText({
    model: new StalledAfterBodyCancellationModel(),
    prompt: 'Reproduce issue #15430',
    abortSignal: outerAbortController.signal,
    onError: event => {
      console.log(
        `[${t()}] onError: ${event.error instanceof Error ? event.error.message : String(event.error)}`,
      );
    },
    onStepFinish: step => {
      console.log(`[${t()}] onStepFinish finishReason=${step.finishReason}`);
    },
  });

  console.log(`[${t()}] awaiting result.text with ${watchdogMs}ms watchdog`);

  const textOutcome = await raceWithWatchdog(result.text, watchdogMs);
  if (textOutcome.status === 'resolved') {
    console.log(
      `[${t()}] result.text resolved length=${textOutcome.value.length}`,
    );
  } else if (textOutcome.status === 'rejected') {
    console.log(
      `[${t()}] result.text rejected: ${
        textOutcome.error instanceof Error
          ? textOutcome.error.message
          : String(textOutcome.error)
      }`,
    );
  } else {
    console.log(`[${t()}] result.text ${textOutcome.error.message}`);
  }

  const stepsOutcome = await raceWithWatchdog(result.steps, watchdogMs);
  if (stepsOutcome.status === 'resolved') {
    console.log(
      `[${t()}] result.steps resolved length=${stepsOutcome.value.length}`,
    );
  } else if (stepsOutcome.status === 'rejected') {
    console.log(
      `[${t()}] result.steps rejected: ${
        stepsOutcome.error instanceof Error
          ? stepsOutcome.error.message
          : String(stepsOutcome.error)
      }`,
    );
  } else {
    console.log(`[${t()}] result.steps ${stepsOutcome.error.message}`);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
