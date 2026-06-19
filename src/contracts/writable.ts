/** Strip `readonly` for rollout scratch states that are mutated in place. */
export type Writable<T> = {
  -readonly [K in keyof T]: T[K];
};
