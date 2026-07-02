import { createAzure } from '../dist/index.js';

// Reproduction for https://github.com/vercel/ai/issues/12799
//
// The issue is reported for Bun, whose navigator.userAgent is "Bun/1.3.9".
// Node 22 also exposes navigator.userAgent, so overwrite it here to exercise
// the same provider-utils runtime user-agent code path deterministically.
Object.defineProperty(globalThis.navigator, 'userAgent', {
  value: 'Bun/1.3.9',
  configurable: true,
});

// RFC 9110 section 5.6.2 token characters:
// token = 1*tchar
// tchar = ALPHA / DIGIT / "!" / "#" / "$" / "%" / "&" / "'"
//       / "*" / "+" / "-" / "." / "^" / "_" / "`" / "|" / "~"
const rfc9110Token = /^[A-Za-z0-9!#$%&'*+\-.^_`|~]+$/;

function isInvalidProduct(product) {
  // User-Agent product = token [ "/" product-version ]
  // product-version = token
  const parts = product.split('/');
  return parts.length > 2 || parts.some(part => !rfc9110Token.test(part));
}

function isInvalidUserAgent(userAgent) {
  // This reproduction only needs to validate the SDK-generated product tokens.
  // The generated header does not contain comments.
  return userAgent.trim().split(/\s+/).some(isInvalidProduct);
}

const provider = createAzure({
  resourceName: 'test-resource',
  apiKey: 'test-api-key',
  fetch: async (_url, init) => {
    const userAgent = new Headers(init?.headers).get('user-agent') ?? '';

    if (isInvalidUserAgent(userAgent)) {
      // Azure OpenAI rejects this before handling the model request.
      return new Response(
        JSON.stringify({
          error: {
            message: `The format of value '${userAgent}' is invalid.`,
          },
        }),
        {
          status: 400,
          headers: { 'content-type': 'application/json' },
        },
      );
    }

    return new Response(
      JSON.stringify({
        id: 'resp_12799',
        object: 'response',
        created_at: 0,
        status: 'completed',
        model: 'test-deployment',
        output: [],
        usage: {
          input_tokens: 1,
          output_tokens: 0,
          total_tokens: 1,
        },
        incomplete_details: null,
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      },
    );
  },
});

await provider('test-deployment').doGenerate({
  prompt: [
    {
      role: 'user',
      content: [{ type: 'text', text: 'Hello' }],
    },
  ],
});

console.log('No invalid User-Agent header was generated.');
