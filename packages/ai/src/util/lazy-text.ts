const textStates = new WeakMap<
  object,
  {
    chunks: string[];
    value: string | undefined;
  }
>();

/**
 * Defines an enumerable `.text` accessor that lazily joins appended text chunks.
 * This keeps streaming accumulation from flattening the full text on every
 * append while preserving the public `.text` string property.
 */
export function withLazyText<T extends object>(
  object: T,
  initialText = '',
): T & { text: string } {
  const state = {
    chunks: initialText.length === 0 ? [] : [initialText],
    value: initialText,
  };

  Object.defineProperty(object, 'text', {
    enumerable: true,
    configurable: true,
    get() {
      if (state.value == null) {
        state.value = state.chunks.join('');
        state.chunks = state.value.length === 0 ? [] : [state.value];
      }

      return state.value;
    },
    set(value: string) {
      state.chunks = value.length === 0 ? [] : [value];
      state.value = value;
    },
  });

  textStates.set(object, state);

  return object as T & { text: string };
}

export function appendToLazyText(object: { text: string }, text: string) {
  const state = textStates.get(object);

  if (state == null) {
    object.text = `${object.text}${text}`;
    return;
  }

  if (text.length === 0) {
    return;
  }

  state.chunks.push(text);
  state.value = undefined;
}
