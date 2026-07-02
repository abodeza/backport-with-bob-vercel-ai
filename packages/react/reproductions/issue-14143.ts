import type {
  UIDataTypes,
  UIMessage as AiUIMessage,
  UITools,
} from 'ai';
import { useChat } from '@ai-sdk/react';
import { z } from 'zod';

type Brand<T, BRAND extends string> = T & { readonly __brand: BRAND };

type Message = {
  id: Brand<string, 'message-id'>;
};

const SomeMessageMetadata = z
  .object({
    source: z.string(),
  })
  .nullish();

const SomeMessageMetadataWithoutNullish = z.object({
  source: z.string(),
});

const someDataSchemas = {} satisfies UIDataTypes;

type SomeUIMessage = AiUIMessage<
  z.infer<typeof SomeMessageMetadata>,
  typeof someDataSchemas
>;

type BrandedUIMessage<
  METADATA = unknown,
  DATA_PARTS extends UIDataTypes = UIDataTypes,
  TOOLS extends UITools = UITools,
> = AiUIMessage<METADATA, DATA_PARTS, TOOLS> & {
  id: Message['id'];
};

type SomeBrandedUIMessage = BrandedUIMessage<
  z.infer<typeof SomeMessageMetadata>,
  typeof someDataSchemas
>;

type SomeBrandedUIMessageWithoutNullish = BrandedUIMessage<
  z.infer<typeof SomeMessageMetadataWithoutNullish>,
  typeof someDataSchemas
>;

// Baseline from the issue report: the regular AI SDK UIMessage accepts a
// nullish metadata schema.
export function useSomeChatWithRegularId() {
  return useChat<SomeUIMessage>({
    dataPartSchemas: someDataSchemas,
    messageMetadataSchema: SomeMessageMetadata,
  });
}

// Reporter's workaround: the branded-id message accepts the same schema once
// `.nullish()` is removed.
export function useSomeChatWithBrandedIdAndNonNullishMetadata() {
  return useChat<SomeBrandedUIMessageWithoutNullish>({
    dataPartSchemas: someDataSchemas,
    messageMetadataSchema: SomeMessageMetadataWithoutNullish,
  });
}

// Reproduction for #14143: only the combination of a branded `id` intersection
// and a nullish metadata schema fails TypeScript assignability.
export function useSomeChatWithBrandedIdAndNullishMetadata() {
  return useChat<SomeBrandedUIMessage>({
    dataPartSchemas: someDataSchemas,
    messageMetadataSchema: SomeMessageMetadata,
  });
}
