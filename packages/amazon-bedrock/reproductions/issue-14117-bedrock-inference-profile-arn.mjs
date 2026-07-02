#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createAmazonBedrock } from '../dist/index.js';
import { generateText } from '../../ai/dist/index.js';

const inferenceProfileArn =
  'arn:aws:bedrock:us-east-1:123456789012:application-inference-profile/abc123xyz';
const baseURL = 'https://bedrock-runtime.us-east-1.amazonaws.com';

let observedUrl;

const bedrock = createAmazonBedrock({
  region: 'us-east-1',
  // Use bearer-token auth plus a custom fetch so this reproduction isolates URL
  // construction without requiring AWS account credentials.
  apiKey: 'dummy-token-for-url-reproduction',
  fetch: async input => {
    observedUrl =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;

    return new Response(
      JSON.stringify({
        output: {
          message: {
            role: 'assistant',
            content: [{ text: 'hello' }],
          },
        },
        stopReason: 'end_turn',
        usage: {
          inputTokens: 1,
          outputTokens: 1,
          totalTokens: 2,
        },
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      },
    );
  },
});

await generateText({
  model: bedrock(inferenceProfileArn),
  prompt: 'Say hello',
});

const expectedUrl = `${baseURL}/model/${inferenceProfileArn}/converse`;
const incorrectlyEncodedUrl = `${baseURL}/model/${encodeURIComponent(
  inferenceProfileArn,
)}/converse`;

console.log(`Observed Bedrock Converse URL: ${observedUrl}`);
console.log(`Expected ARN-preserving URL: ${expectedUrl}`);

assert.notEqual(
  observedUrl,
  incorrectlyEncodedUrl,
  'Bug reproduced: the Bedrock provider encoded ARN delimiters with encodeURIComponent(modelId).',
);
assert.equal(
  observedUrl,
  expectedUrl,
  'Bedrock application inference profile ARN should be preserved in the URL path.',
);
