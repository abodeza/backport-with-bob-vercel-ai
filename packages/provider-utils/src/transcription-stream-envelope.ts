import type {
  Experimental_TranscriptionModelV4StreamPart as TranscriptionModelV4StreamPart,
  JSONObject,
} from '@ai-sdk/provider';

/**
 * Experimental transcription-stream WebSocket envelope (v1): the standard
 * serialization of `TranscriptionModelV4.doStream` over a WebSocket. Clients
 * (e.g. the `@ai-sdk/gateway` provider) encode with this module and servers
 * (e.g. AI Gateway) decode with it, so the two sides cannot drift.
 *
 * Envelope rules:
 *
 * 1. The client sends exactly one `transcription-stream.start` TEXT frame
 *    first, describing the audio format and pass-through options.
 * 2. Audio rides BINARY frames containing raw bytes in the declared
 *    `inputAudioFormat`; base64 string chunks from the model-facing API are
 *    decoded to bytes before sending.
 * 3. The client signals end of audio with the
 *    `transcription-stream.audio-done` TEXT frame; a plain close without it
 *    is an abort.
 * 4. Every server→client TEXT frame is one JSON-serialized
 *    `TranscriptionModelV4StreamPart` (flattened, no wrapper — part types
 *    cannot collide with the namespaced client frame names).
 * 5. The server closes with code 1000 after the `finish` part; on failure it
 *    sends an `error` part and then closes with a non-1000 code. A close
 *    without a prior `finish` is an error.
 * 6. Unknown frame/part types are ignored in both directions (forward
 *    compatibility).
 * 7. Connection establishment (URL, auth) is transport-specific and out of
 *    scope (e.g. `@ai-sdk/gateway` carries auth in WebSocket subprotocols).
 *
 * Serialization contract: parts are serialized with `JSON.stringify`, so
 * `Date` values (`response-metadata.timestamp`) become ISO 8601 strings via
 * `Date#toJSON`; `parseTranscriptionStreamPart` revives them back to `Date`.
 *
 * The envelope validates frame shape only. Server policy concerns — which
 * audio format types are accepted, whether `rate` is required, size limits —
 * are layered on top by implementations.
 */

/**
 * Type of the first client TEXT frame, sent once after the WebSocket opens.
 */
export const TRANSCRIPTION_STREAM_START_FRAME_TYPE =
  'transcription-stream.start';

/**
 * Type of the client TEXT frame that signals the end of the audio input.
 */
export const TRANSCRIPTION_STREAM_AUDIO_DONE_FRAME_TYPE =
  'transcription-stream.audio-done';

/**
 * The client's session start frame: the first frame after the WebSocket
 * opens. Optional keys are omitted when undefined (never serialized as
 * `null`/`undefined`).
 */
export type Experimental_TranscriptionStreamStartFrame = {
  type: typeof TRANSCRIPTION_STREAM_START_FRAME_TYPE;

  /**
   * The audio format of the binary audio frames, passed through verbatim
   * from the `doStream` options.
   */
  inputAudioFormat: {
    /**
     * Audio format type, e.g. `audio/pcm`, `audio/pcmu`, or `audio/pcma`.
     */
    type: string;

    /**
     * Sample rate in Hz. Only applicable for formats that require a rate.
     */
    rate?: number;
  };

  /**
   * Provider-specific options, passed through verbatim.
   */
  providerOptions?: Record<string, JSONObject>;

  /**
   * When true, the server should include `raw` parts in the stream.
   */
  includeRawChunks?: boolean;
};

/**
 * Server-side classification of a client TEXT frame.
 */
export type Experimental_TranscriptionStreamClientFrame =
  | {
      type: 'start';
      frame: Experimental_TranscriptionStreamStartFrame;
    }
  | {
      type: 'audio-done';
    }
  | {
      /**
       * Malformed JSON or a recognized frame with an invalid shape.
       */
      type: 'invalid';
      message: string;
    }
  | {
      /**
       * Well-formed JSON with an unrecognized frame type. Ignore for forward
       * compatibility.
       */
      type: 'unknown';
    };

const knownStreamPartTypes = new Set<TranscriptionModelV4StreamPart['type']>([
  'error',
  'finish',
  'raw',
  'response-metadata',
  'stream-start',
  'transcript-delta',
  'transcript-final',
  'transcript-partial',
]);

/**
 * Server-side: parse a client TEXT frame. Validates the envelope shape only
 * (it does not restrict audio format types or require `rate` — server policy
 * layers on top). Never throws: malformed input yields an `invalid` frame,
 * and unrecognized frame types yield `unknown`.
 */
export function parseTranscriptionStreamClientFrame(
  text: string,
): Experimental_TranscriptionStreamClientFrame {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { type: 'invalid', message: 'malformed JSON' };
  }

  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return { type: 'invalid', message: 'frame must be a JSON object' };
  }

  const frame = value as Record<string, unknown>;

  if (typeof frame.type !== 'string') {
    return { type: 'invalid', message: 'frame type must be a string' };
  }

  switch (frame.type) {
    case TRANSCRIPTION_STREAM_START_FRAME_TYPE: {
      const inputAudioFormat = frame.inputAudioFormat as
        | Record<string, unknown>
        | null
        | undefined;
      if (
        inputAudioFormat == null ||
        typeof inputAudioFormat !== 'object' ||
        Array.isArray(inputAudioFormat) ||
        typeof inputAudioFormat.type !== 'string'
      ) {
        return {
          type: 'invalid',
          message:
            'start frame must have an inputAudioFormat object with a string type',
        };
      }
      if (
        inputAudioFormat.rate !== undefined &&
        typeof inputAudioFormat.rate !== 'number'
      ) {
        return {
          type: 'invalid',
          message: 'inputAudioFormat.rate must be a number when present',
        };
      }
      if (
        frame.providerOptions !== undefined &&
        (frame.providerOptions == null ||
          typeof frame.providerOptions !== 'object' ||
          Array.isArray(frame.providerOptions))
      ) {
        return {
          type: 'invalid',
          message: 'providerOptions must be an object when present',
        };
      }
      if (
        frame.includeRawChunks !== undefined &&
        typeof frame.includeRawChunks !== 'boolean'
      ) {
        return {
          type: 'invalid',
          message: 'includeRawChunks must be a boolean when present',
        };
      }
      return {
        type: 'start',
        frame: frame as Experimental_TranscriptionStreamStartFrame,
      };
    }

    case TRANSCRIPTION_STREAM_AUDIO_DONE_FRAME_TYPE:
      return { type: 'audio-done' };

    default:
      return { type: 'unknown' };
  }
}

/**
 * Server-side: serialize a transcription stream part as one TEXT frame.
 * Uses `JSON.stringify`, so `Date` values (`response-metadata.timestamp`)
 * become ISO 8601 strings via `Date#toJSON` — the documented wire format
 * that `parseTranscriptionStreamPart` revives.
 */
export function serializeTranscriptionStreamPart(
  part: TranscriptionModelV4StreamPart,
): string {
  return JSON.stringify(part);
}

/**
 * Client-side: parse a server TEXT frame into a transcription stream part.
 * Returns `undefined` for malformed JSON and for unknown part types
 * (forward compatibility). Part internals are intentionally not validated
 * beyond a known `type`; `response-metadata.timestamp` is revived from its
 * ISO string serialization to a `Date`.
 */
export function parseTranscriptionStreamPart(
  text: string,
): TranscriptionModelV4StreamPart | undefined {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return undefined;
  }

  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const part = value as TranscriptionModelV4StreamPart;

  if (!knownStreamPartTypes.has(part.type)) {
    return undefined;
  }

  if (part.type === 'response-metadata') {
    return {
      ...part,
      timestamp: part.timestamp != null ? new Date(part.timestamp) : undefined,
    };
  }

  return part;
}
