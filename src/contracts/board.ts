/** Spatial / structural state used for evaluation heuristics. */
export interface Board {
  clone(): Board;
  hash(): string;
}
