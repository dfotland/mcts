# MCTS Component Specification

## 1. Purpose

Build a **game-agnostic Monte Carlo Tree Search (MCTS)** library in TypeScript. Search runs as a **single-threaded loop** inside a Web Worker. The **MCTSEngine** accepts a **`SearchParameters`** instance and a **stop signal** it polls at **`stopPollInterval`** iterations (not every iteration). **Time limits, UI pacing, multi-phase chaining, and cancellation policy** live in the **coordinator** — not in the core search loop beyond poll cadence.

This component is intended to replace or augment heuristic AI (e.g. the current Quarto `ai.ts`) with principled search while remaining reusable across other board games in the Smart Games SPA family.

### Goals

- Generic over any turn-based game that fits the `GameState` / `Board` / `Move` contracts, including **multi-phase turns** (Quarto, Arimaa, etc.).
- Runnable as **single-threaded search per worker**; coordinator may run several workers in parallel (v1: typically one worker).
- **`SearchParameters.seed`** drives the rollout RNG for that search. Each worker (or parallel slot) receives its own `SearchParameters` with a **distinct seed**, so runs are independent and still **reproducible** when the same seed is reused.
- Serializable messages between main thread and worker (structured clones / JSON-safe payloads).
- Tunable strength via `SearchParameters` (exploration, rollout depth, iteration ceiling, etc.).

### Non-goals

**Permanent architecture constraints (all versions)**

- **No locking or shared mutable state between workers.** Each worker runs an isolated `MCTSEngine` search with its own tree, RNG (`SearchParameters.seed`), and memory. Workers never read or write another worker's data.
- **No cross-worker tree merge inside workers or `MCTSEngine`.** When multiple workers search the same position, the **coordinator** on the main thread collects their results and combines them (e.g. pick move with highest visits / win rate across workers).

**v1 will not include**

- Neural network policies or value heads.
- Opening books.
- Transposition tables (within a search or across searches).

**Other non-goals (v1)**

- Automatic game discovery or reflection-based adapters.

---

## 2. High-level Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                         Main Thread (game app)                       │
│  ┌─────────────┐   ┌─────────────────────────┐   ┌──────────────┐   │
│  │ Game UI /   │   │ MCTSSearchCoordinator   │   │ Worker port  │   │
│  │ useAIController│ computeMove(state)       │──▶│ (1 search    │   │
│  │             │   │  • thinking delay       │   │  per call)   │   │
│  └─────────────┘   │  • time budget          │   └──────┬───────┘   │
│        ▲           │  • multi-phase loop ───────────────┘           │
│        │           │    (N worker searches)  │  postMessage × N      │
│        └───────────│  • combine → moves[]  │                         │
│                    └─────────────────────────┘                         │
└────────────────────────────────────────────────────────────────────┘
                                    │ each search: single-threaded loop
┌───────────────────────────────────┼────────────────────────────────┐
│              Worker Thread        │                                │
│                    ┌──────────────▼──────────────┐                 │
│                    │ MCTSWorker (one search/run) │                 │
│                    │  StopSignal → MCTSEngine    │                 │
│                    └─────────────────────────────┘                 │
└────────────────────────────────────────────────────────────────────┘
```

| Layer | Responsibility |
|-------|----------------|
| **Contracts** (`src/contracts/`) | Interfaces and types shared by main thread and worker. No game logic. |
| **Core MCTS** (`src/mcts/`) | `MCTSEngine`, `SearchParameters`, `StopSignal`. Algorithm only. |
| **Coordinator** (`src/coordinator/`) | `MCTSSearchCoordinator` — game-facing `computeMove`, multi-phase loop, **combines results from multiple workers** (no worker-to-worker data path). |
| **Worker** (`src/worker/`) | One isolated single-threaded `MCTSEngine.search` per `search` message; no shared state with other workers. |
| **Worker port** (`src/worker-port/`) | Optional minimal `postMessage` helpers. |
| **Game coordinator adapter** (`src/games/<name>/` or app) | `GameCoordinatorAdapter` — turn completion, `applyMove` on main thread for chaining. |
| **Game adapters** (`src/games/<name>/`) | Worker-side `GameEngine` + registered `SearchFunctions` heuristics. |

The **core library must not import any specific game**. Games plug in via adapters.

---

## 3. Core Concepts

### 3.1 Player identity

```ts
/** Zero-based player index. v1: 0 = first player, 1 = second player. */
type PlayerId = 0 | 1;
```

**Convention:** Internal indices in this library are **zero-based**. `PlayerId`, phase step indices (e.g. Arimaa `0 | 1 | 2 | 3`), array indexing, and worker/coordinator payloads all follow this rule.

Game apps that use one-based player labels in UI (e.g. QuAIto `1 | 2`) **map at the adapter boundary** — in `serialize` / `deserialize`, `GameCoordinatorAdapter`, and worker `createState` — not inside `src/mcts/` or `src/contracts/` consumers.

Games with more than two players are out of scope for v1 unless `PlayerId` and outcome semantics are extended later.

### 3.2 Phase identity

```ts
/**
 * Opaque phase id within a turn. Game-defined.
 * Examples: 'place' | 'give' (Quarto), 0 | 1 | 2 | 3 (Arimaa step index), 'main' (chess/go).
 */
type PhaseId = string | number;
```

A **turn** (what a human player often calls "my move") may span one or more **phases**. Each phase has its own legal moves. The MCTS tree always expands on **atomic moves** — one legal action in one phase — not on composite full-turn bundles.

| Game | Phases per turn (typical) | Atomic move example |
|------|---------------------------|---------------------|
| Chess / Go | 1 (`main`) | place stone, move piece |
| Quarto | 2 (`place`, `give`) | place staged piece; give piece to opponent |
| Arimaa | 4 (step 0–3) | each step is one atomic move |

### 3.3 Move

An **atomic move** is one action in one phase by the player who is to act. It is **game-defined** (payload) but must include **phase** and **player**, be **serializable**, and be **comparable** for use as a tree-node key.

```ts
interface Move {
  /** Player who makes this action. Must match state.currentPlayer at generation time. */
  readonly player: PlayerId;

  /** Phase this action belongs to. Must match state.currentPhase at generation time. */
  readonly phase: PhaseId;

  /**
   * Stable string key for maps / node children.
   * Must be unique per distinct atomic move (recommend encoding player + phase + action).
   */
  readonly key: string;

  /**
   * Rough win-rate estimate for playing this move from the position where it was generated.
   * Set by `generateMoves` when the move is created. Range [0, 1].
   * Used for expansion ordering and optional UCT move priors (tree only — rollouts use `generateRolloutMove`).
   */
  heuristicValue: number;
}
```

Games extend `Move` with phase-specific payload (e.g. `QuartoPlaceMove`, `QuartoGiveMove`, `ArimaaStepMove`). The MCTS core uses `key`, `player`, `phase`, and `heuristicValue` for tree structure and ordering; all rule logic stays in the adapter.

**Key construction (recommended)**

```
key = `${phase}:${player}:${actionDescriptor}`
```

Example Quarto keys: `place:0:2:3`, `give:0:h-red-round-flat`.

**Turn vs ply**

- **Ply** — one atomic move (one tree edge). Tree expansion uses `makeMove`; rollout plies use `applyMove` on a scratch copy.
- **Turn** — sequence of plies until the same player is to act again at the start of their next turn, or game ends. Quarto: 2 plies per turn. Arimaa: 4 plies per turn. Chess: 1 ply per turn.

Search at the root always returns the best **atomic move for the current phase** at the root state. Apps that need a full human turn (e.g. Quarto place + give) either run search twice as phases advance, or apply the first atomic move and re-search if the turn continues under the same player.

### 3.4 Board

Represents the spatial / structural state used for evaluation. May be embedded in `GameState` or derived from it.

```ts
interface Board {
  /** Deep clone for simulation branches. */
  clone(): Board;

  /** Optional stable hash for debugging; not used for transposition tables in v1. */
  hash(): string;
}
```

Not every game needs a separate `Board` type if `GameState` alone is sufficient, but the contract exists so `evaluatePosition` heuristics can depend on board geometry without full game metadata.

### 3.5 GameState

Complete state needed to generate legal moves and detect terminal outcomes.

```ts
interface GameState<B extends Board = Board> {
  readonly board: B;

  /** Player who must act in the current phase. */
  readonly currentPlayer: PlayerId;

  /** Which step within the current turn is active. */
  readonly currentPhase: PhaseId;

  clone(): GameState<B>;

  /** JSON-safe snapshot for worker messages. */
  serialize(): SerializedGameState;

  /** Reconstruct from serialized form (used in worker). */
  static deserialize?(payload: SerializedGameState): GameState<B>;
}

type SerializedGameState = Record<string, unknown>;
```

**Requirements**

- `clone()` must be deep enough that `makeMove` on a copy does not mutate the original.
- `serialize()` / `deserialize()` must round-trip faithfully. All data needed for search must be in the serialized payload (including `currentPlayer` and `currentPhase`).
- After `makeMove`, the new state advances `currentPhase` and/or `currentPlayer` per game rules (next phase in same turn, opponent's turn, or terminal).

### 3.6 Game outcome

```ts
type Outcome = -1 | 0 | 1;
// From the perspective of the player being optimized for:
//   1  = win
//   0  = draw
//  -1  = loss
```

Terminal detection and outcome from `GameEngine` use an explicit `perspectivePlayer`. **Search results** returned to the client are converted to the **search root player's** perspective. **Inside the tree**, each node's `wins` count accumulates values for the **player to move at that node** (`node.state.currentPlayer`), with sign inversion on each backup step (see §5.1, §5.2).

---

## 4. Game Engine Contract

The **game engine** (adapter) encapsulates **terminal detection and exact outcomes**. Tree move generation, rollout move generation, move application, and heuristics are **`SearchFunctions`** (see §6).

```ts
interface GameEngine<
  S extends GameState = GameState,
  M extends Move = Move,
> {
  /** Factory: build state from serialized payload (worker entry). */
  createState(payload: SerializedGameState): S;

  /** True if no moves remain or win/draw condition met. */
  isTerminal(state: S): boolean;

  /**
   * Outcome for `perspectivePlayer` when state is terminal.
   * Throws or returns 0 if called on non-terminal state (implementation choice; document one).
   */
  getOutcome(state: S, perspectivePlayer: PlayerId): Outcome;

  /** Player to act in the current phase. Must match state.currentPlayer. */
  getCurrentPlayer(state: S): PlayerId;

  /** Active phase within the current turn. Must match state.currentPhase. */
  getCurrentPhase(state: S): PhaseId;

  /**
   * Optional: convert move key back to move object when reconstructing best move.
   * Required if legal moves cannot be recovered from key alone.
   */
  getMoveByKey?(state: S, key: string): M | undefined;
}
```

**Not on GameEngine**: `generateMoves`, `generateRolloutMove`, `makeMove`, `applyMove`, `evaluatePosition` — those are **`SearchFunctions`**. Move-level heuristics for tree expansion are stored on each `Move.heuristicValue` when `generateMoves` runs (see §6.2).

---

## 5. MCTS Algorithm (v1)

Standard **UCT** (Upper Confidence bounds applied to Trees) with configurable exploration constant **C**.

### 5.1 Search node

Each node holds a **copy** of the game state at that position in the tree. The tree is built by `makeMove` when linking parent → child. Nodes do not share mutable state.

```ts
interface MCTSNode<
  S extends GameState = GameState,
  M extends Move = Move,
> {
  /** Deep copy of position at this node. Root uses a copy of the search root state. */
  state: S;

  /** Edge label from parent; null at root. */
  move: M | null;

  parent: MCTSNode<S, M> | null;
  children: Map<string, MCTSNode<S, M>>;  // keyed by move.key
  visits: number;

  /**
   * Sum of backed-up rollout values in [0, 1] for the player to move at this node
   * (`state.currentPlayer`). Not the root player — see backpropagation in §5.2.
   */
  wins: number;

  /**
   * Atomic moves not yet expanded as children. Populated via generateMoves when
   * this node is first selected for expansion; moves are removed as children are created.
   */
  untriedMoves: M[];
}
```

The root node is created with `state: input.state.clone()` (or equivalent copy from `createState`). Every child node receives `state` from `functions.makeMove(parent.state, move)` — a **new copy**, never a reference to the parent's state.

**Value storage**

Each node's `wins` / `visits` encode the win rate for **`state.currentPlayer`** at that node — the player who would call `generateMoves` when expanding from this node.

Rollout produces an initial value `v ∈ [0, 1]` = estimated win probability for the **player to move at the rollout-start node** (the expanded child, or the selected leaf):

- Terminal: map `getOutcome(rolloutState, playerToMove)` to `[0, 1]`
- Depth limit: `evaluatePosition(rolloutState, playerToMove)`
- Outcome mapping: `1` → `1.0`, `0` → `0.5`, `-1` → `0.0`

**Backpropagation** walks from rollout-start node to root. At each node, add `v` to `wins` and increment `visits`. Before moving to the parent, **invert `v` only when side to move changes** between the current node and its parent (`getCurrentPlayer(node.state) !== getCurrentPlayer(parent.state)`). In alternating two-player games (chess, tic-tac-toe) this flips every edge. In multi-phase games (Quarto place→give, Arimaa steps) `currentPlayer` can stay the same across consecutive tree edges — do **not** flip there.

```ts
let v = rolloutValue; // win rate for getCurrentPlayer(rolloutStartNode.state)
let node = rolloutStartNode;
while (node !== null) {
  node.visits++;
  node.wins += v;
  if (node.parent !== null) {
    const atNode = getCurrentPlayer(node.state);
    const atParent = getCurrentPlayer(node.parent.state);
    if (atNode !== atParent) v = 1 - v;
  }
  node = node.parent;
}
```

`wins` is never stored from a single global (root) perspective inside the tree.

### 5.2 Core loop (non-recursive)

The MCTS implementation uses **loops only** — no recursive tree walks or recursive rollouts. Selection, expansion, rollout, and backpropagation are separate `while` / `for` phases in each iteration.

**Functions used at nodes** (from `SearchInput.functions`):

| Function | Role in core loop |
|----------|-------------------|
| `generateMoves` | Tree expansion only: list legal moves from `node.state`; **set `heuristicValue` on each move** |
| `generateRolloutMove` | Rollout only: pick **one** legal move from `rolloutState` (see §6.2) |
| `evaluatePosition` | Rollout value when ply limit reached |
| `makeMove` | Tree expansion: returns **new state copy** for child nodes |
| `applyMove` | Rollout only: mutates a scratch copy (`rolloutStartNode.state.clone()`) in place |

`GameEngine` supplies **terminal checks and exact outcomes** (`isTerminal`, `getOutcome`) on `node.state` — not move generation or heuristics.

#### Single iteration (four phases, all iterative)

1. **Selection** — Start at root. `while` the current node is fully expanded and non-terminal, descend to the UCT-best child:

   ```
   UCT(child) = (child.wins / child.visits) + C * sqrt(ln(parent.visits) / child.visits)
   ```

   `child.wins / child.visits` is the win rate for **the player to move at `child.state`** (not the root player). When selecting from a parent, if `child.state.currentPlayer` differs from `parent.state.currentPlayer`, use **`1 - child.wins / child.visits`** for the exploitation term (zero-sum two-player game).

   Optional: add `move.heuristicValue` as a prior bonus during selection (`movePriorWeight`). Stop at a node with untried moves, terminal `node.state`, or a leaf.

   **UCT tie-breaking:** When multiple children share the maximum UCT score, pick **uniformly at random** among the tied children using the **search PRNG** (see §5.6). Do not use `Math.random()` — reproducibility requires a single seedable generator per search.

2. **Expansion** — If the selected node is non-terminal:
   - If `untriedMoves` is empty: `untriedMoves = generateMoves(node.state, rootPlayer)` (each move has `heuristicValue`).
   - Sort `untriedMoves` by `heuristicValue` descending (expansion order).
   - Pop one untried move.
   - `childState = makeMove(node.state, move)` → **new copy**.
   - Create child node `{ state: childState, move, parent, untriedMoves: [] }`, register in `node.children`.
   - The expanded node for rollout is this child (or the selected node if terminal / no expansion).

3. **Simulation (rollout)** — Let `rolloutStartNode` be the expanded child (or selected leaf). Let `playerToMove = getCurrentPlayer(rolloutStartNode.state)`. Start from `rolloutState = rolloutStartNode.state.clone()` (one copy). `while` not terminal and under `maxRolloutPlies`:
   - `move = generateRolloutMove(rolloutState, rootPlayer, rng)` — one legal move from the game's rollout policy; `rng` is the search PRNG (§5.6). Returns `null` when no legal moves remain.
   - If `move` is `null`, exit the rollout loop.
   - `applyMove(rolloutState, move)` — in-place update on the scratch copy only
   - On ply limit while still non-terminal: `v = evaluatePosition(rolloutState, playerToMove)`
   - On terminal: `v = map(getOutcome(rolloutState, playerToMove))` to `[0, 1]`

4. **Backpropagation** — From `rolloutStartNode` to root (see value storage above): increment `visits`, add `v` to `wins`, then flip `v` only when `currentPlayer` changes between child and parent; `node = node.parent`.

```
┌─ iteration ─────────────────────────────────────────────────┐
│  selection:   while (fully expanded) node = bestUCT(child)  │
│  expansion:   generateMoves (sets heuristicValue) → makeMove → child │
│  rollout:     while (plies) generateRolloutMove → applyMove          │
│  backprop:    while (node) wins+=v; flip v if player changed; node=parent │
└─────────────────────────────────────────────────────────────┘
         no recursive calls between these phases
```

At each **new node**, the core pattern is: **generateMoves (with per-move heuristic) → choose → makeMove → (optional) create child node with state copy**.

### 5.3 Search termination

The **MCTSEngine** runs a single-threaded iteration loop. It stops when **any** condition is true:

| Condition | Source |
|-----------|--------|
| Stop signal | `stopSignal.shouldStop()` at poll boundaries every `params.stopPollInterval` iterations |
| Iteration ceiling | `params.maxIterations` from the `SearchParameters` instance |

There is **no wall-clock time limit inside MCTSEngine or the worker**. The game app's coordinator enforces time budgets (e.g. `setTimeout` → `postStop`) and any other policy (user clicked undo, new game started, phase changed).

Default `SearchParameters.maxIterations`: `Number.MAX_SAFE_INTEGER` or a very large value so **stop from the app** is the normal way to end search. Apps may set a lower ceiling as a safety backstop.

### 5.4 MCTSEngine

```ts
class MCTSEngine<
  S extends GameState = GameState,
  M extends Move = Move,
> {
  constructor(gameEngine: GameEngine<S, M>);

  /**
   * Run one single-threaded search until stopSignal or maxIterations.
   * `input.functions` supplies tree move generation, rollout move generation, and heuristics for this run.
   */
  search(
    input: SearchInput<S, M>,
    stopSignal: StopSignal,
  ): SearchOutcome<M>;
}

interface StopSignal {
  /**
   * Checked at poll boundaries (every params.stopPollInterval iterations).
   * When true, search exits cleanly after the current iteration completes.
   */
  shouldStop(): boolean;
}

interface SearchOutcome<M extends Move = Move> {
  bestMove: M | null;
  iterations: number;
  children: Array<{
    move: M;
    visits: number;
    winRate: number;
  }>;
}
```

The engine does not measure elapsed time or post messages. The worker wraps `search()`, records `elapsedMs` if needed for diagnostics, and sends the outcome to the main thread.

### 5.5 Move selection after search

| Mode | Rule |
|------|------|
| `robust` (default) | Child with highest `visits` |
| `maxValue` | Child with highest win rate **for the root player** |

Because child `wins`/`visits` are for `child.state.currentPlayer`, convert when picking `maxValue` at the root:

```ts
function childWinRateForRoot(child: MCTSNode, rootPlayer: PlayerId): number {
  const rate = child.wins / child.visits;
  const playerAtChild = getCurrentPlayer(child.state);
  return playerAtChild === rootPlayer ? rate : 1 - rate;
}
```

Pick the child with highest `childWinRateForRoot` (equivalently: lowest child win rate when the opponent is to move at the child).

**Ties:** When multiple children tie on the chosen metric (`visits` or root win rate), break **uniformly at random** among tied children using the search PRNG (§5.6).

Return the chosen **atomic move** for `rootState.currentPhase` (with `player` and `phase` on the move object), plus summary stats per child. `winRate` in `SearchOutcome.children` should be expressed in **root player's perspective** for the UI (apply the same conversion when `currentPlayer` at the child ≠ `rootPlayer`).

Root children always correspond to legal moves in the root phase only — not to full multi-phase turns.

### 5.6 Random number generation

Each search creates **one PRNG instance** from `SearchParameters.seed` and reuses it for the entire run:

| Use | Source |
|-----|--------|
| Rollout move selection | Search PRNG passed to `generateRolloutMove` (policy lives in the game adapter) |
| UCT tie-breaking | Search PRNG (uniform among max-UCT children) |
| Post-search ties (`robust` / `maxValue`) | Search PRNG (uniform among tied best children) |

**Algorithm:** **mulberry32** — fast 32-bit integer generator, adequate quality for MCTS rollouts and tie breaks. Implement in `src/mcts/prng.ts`. Do **not** use `Math.random()` in `MCTSEngine`.

```ts
/** Returns a function yielding values in [0, 1). Same seed → same sequence. */
function createPrng(seed: number): () => number;
```

One instance per `search()` call; never allocate a new generator per iteration (see performance rules).

### 5.7 Principal variation and diagnostics

`SearchOutcome.principalVariation` is the **robust principal variation**: at each ply from the root, the highest-visit child (move-key tie-break: lexicographic ascending).

Each `PrincipalVariationStep` includes:

| Field | Meaning |
|-------|---------|
| `moveKey`, `player`, `phase` | Atomic move label; `player` is the actor (giver/placer), not necessarily who moves next |
| `sideToMoveAfter` | `getCurrentPlayer` in the position **after** the move |
| `visits`, `wins` | Node stats; `wins` is the backed-up total for **`sideToMoveAfter`** |
| `sideToMoveWinRate` | `wins / visits` — win rate for the player to move at that node |
| `winRate` | Same line converted to **root (searching) player** perspective |

**Console PV format** (when `SearchParameters.logPrincipalVariation` is true):

```
give:0:… (give, giver=p0, toMove=p1) visits=… wins=… winRate=p0:99.5% rootWinRate=99.5%
```

- `winRate=pX:…` — win rate for the player who made the move (`player` on the step)
- `rootWinRate` — searching player's view (useful at the root; deep PV lines can look similar on winning lines)

`logPrincipalVariation` defaults to `true` in the library; apps should set it `false` for normal play and enable it only when AI debug logging is on.

### 5.8 Search profiling

When `SearchParameters.profileSearch` is `true`, the engine records per-phase wall time and counters into `SearchStatistics.profile`:

| Phase | Counters |
|-------|----------|
| `selection` | UCT descent loops |
| `expansion` | New child creation |
| `rollout` | `plies`, `generateRolloutMoveCalls`, `generateRolloutMoveMs`, `applyMoveCalls`, `applyMoveMs` |
| `backprop` | `steps` (nodes visited) |
| `buildOutcome` | Tree stats + PV extraction |

Profiling is diagnostic only — it does not affect move choice. Default: `false`. Worker and `ConsoleSearchLogger` emit a formatted summary when enabled.

Target from §12.2: ≥ 1 000 iterations/sec for Quarto on a modern browser worker thread. Use `profile.rollout.share` to confirm rollout dominates before optimizing adapters.

---

## 6. Search input

Starting a search requires a **`SearchInput`**: the position, **parameters** that shape the algorithm, and **functions** (`generateMoves`, `generateRolloutMove`, `evaluatePosition`, `makeMove`, `applyMove`) that drive the non-recursive node loop.

### 6.1 `SearchInput`

```ts
interface SearchInput<
  S extends GameState = GameState,
  M extends Move = Move,
> {
  /** Position to search from. */
  state: S;

  /** Algorithm tuning (exploration, seed, iteration ceiling, etc.). */
  params: SearchParameters;

  /**
   * Move generation, evaluation, and state transition for this search.
   * In the worker: live function references from a registered heuristic bundle.
   * From the main thread: identified by `params.heuristicId` (see §6.5).
   */
  functions: SearchFunctions<S, M>;
}
```

### 6.2 `SearchFunctions`

Five functions per search. Tree expansion uses **`generateMoves`** (all legal moves with **`Move.heuristicValue`**) and **`makeMove`** (returns a new state copy). Rollouts use **`generateRolloutMove`** (one move per ply) and **`applyMove`** (mutates the rollout scratch copy in place). Move-level win-rate estimates for the tree live on **`Move.heuristicValue`**, populated inside **`generateMoves`** — not via a separate call from the MCTS core.

```ts
interface SearchFunctions<
  S extends GameState = GameState,
  M extends Move = Move,
> {
  /**
   * Generate all legal atomic moves for state.currentPlayer in state.currentPhase.
   * Empty if terminal. Must not return moves for other phases or players.
   * Used for tree expansion only — not during rollout simulation.
   *
   * **Must set `heuristicValue` on every returned move** — rough win-rate estimate [0, 1]
   * for playing that move from `state`. Implementations call their move-evaluation logic
   * here (inline or via a private helper); the MCTS core never calls a separate move evaluator.
   */
  generateMoves(state: S, perspectivePlayer: PlayerId): M[];

  /**
   * Pick one legal atomic move for rollout simulation from state.currentPlayer in
   * state.currentPhase. Returns null when no legal moves remain. Must not mutate `state`.
   *
   * Use `rng` (the search PRNG from §5.6) for stochastic choice — do not use Math.random().
   * Rollout policy may differ from tree expansion: e.g. uniform random among legal moves,
   * heuristic-biased sampling without enumerating all moves, or a cheaper scoring pass than
   * `generateMoves`. The MCTS core does not inspect or re-rank the returned move.
   */
  generateRolloutMove(
    state: S,
    perspectivePlayer: PlayerId,
    rng: () => number,
  ): M | null;

  /**
   * Position evaluation: rough win-rate estimate for perspectivePlayer.
   * Range [0, 1]. Used at rollout depth limit on non-terminal positions.
   * Do not call on terminal states; use GameEngine.getOutcome instead.
   */
  evaluatePosition(state: S, perspectivePlayer: PlayerId): number;

  /**
   * Apply move and return a **new deep copy** of the game state.
   * Used when creating child nodes only. Must not mutate `state`.
   * Must produce the same resulting position as applying the move via shared game rules
   * (typically `state.clone()` then in-place apply — see `applyMove`).
   */
  makeMove(state: S, move: M): S;

  /**
   * Apply move to `state` **in place**. Used only on rollout scratch copies
   * (`rolloutStartNode.state.clone()` at rollout start); tree nodes always use `makeMove`.
   * Must not mutate any state other than the passed-in scratch copy.
   * Must apply the same transition as `makeMove` would on an equivalent copy.
   */
  applyMove(state: S, move: M): void;
}
```

`perspectivePlayer` is the search root player (`params.rootPlayer` or state's current player). Move heuristics in `generateMoves` are always from that player's perspective.

**Why separate rollout move generation**

Tree expansion must enumerate every legal move with `heuristicValue` for UCT child ordering and optional move priors. Rollouts run many plies per iteration and often need a **different, cheaper move picker** — uniform random, partial enumeration, or game-specific fast sampling — without building a full scored move list each ply.

**Why separate `makeMove` and `applyMove`**

Both apply the same game transition; they differ only in **copy semantics**:

| Function | Mutates input? | Returns | Used where |
|----------|----------------|---------|------------|
| `makeMove` | No — leaves `state` unchanged | New state copy | Tree child creation |
| `applyMove` | Yes — updates `state` in place | `void` | Rollout scratch copy (cloned once per rollout) |

Game adapters typically implement a private in-place helper and call it from both: `makeMove` = `clone()` + in-place apply; `applyMove` = in-place apply only. This avoids allocating a new state object on every rollout ply.

**Implementing move evaluation inside `generateMoves`**

Game adapters typically structure tree generation as:

```ts
generateMoves(state, perspectivePlayer) {
  const legal = listLegalMovesFromRules(state);
  for (const move of legal) {
    move.heuristicValue = this.scoreMove(state, move, perspectivePlayer);
  }
  return legal;
}

// Private helper — not part of SearchFunctions or MCTS core API
private scoreMove(state, move, perspectivePlayer): number { ... }
```

**Implementing rollout move selection**

Rollout move pickers are **separate code paths** from `generateMoves` — not a wrapper that calls `generateMoves` and returns one element. They should be **much faster and simpler**: no `heuristicValue` scoring, no tactical analysis, and ideally **no full legal-move array** (pick one random legal action in O(board) or O(1) work).

Share only low-level primitives with tree code where useful (`createPlaceMove`, `applyMoveInPlace`, board scans) — **not** `scoreMove`, `listLegalMoves` used by `generateMoves`, or other expansion helpers.

```ts
// Example: tic-tac-toe — reservoir-sample one empty cell, build one Move
generateRolloutMove(state, _perspectivePlayer, rng) {
  let chosen: { row: number; col: number } | null = null;
  let emptyCount = 0;
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      if (state.board.get(row, col) !== null) continue;
      emptyCount++;
      if (rng() < 1 / emptyCount) chosen = { row, col };
    }
  }
  if (chosen === null) return null;
  return createMove(state.currentPlayer, chosen.row, chosen.col);
}
```

```ts
// Example: Quarto place — win if possible, else uniform random; no board clone
generateRolloutMove(state, _perspectivePlayer, rng) {
  if (state.currentPhase === 'place' && state.stagedPiece !== null) {
    for (const { row, col } of eachEmptyCell(state.board)) {
      if (wouldCompleteLine(state.board, state.stagedPiece, row, col)) {
        return createPlaceMove(state.currentPlayer, row, col);
      }
    }
    // reservoir-sample one empty cell (no move array, no board copy)
    ...
  }
  ...
}
```

```ts
// Example: Quarto give — prefer non-losing pieces, else uniform; no board clone
generateRolloutMove(state, _perspectivePlayer, rng) {
  if (state.currentPhase === 'give') {
    const safe: QuartoPiece[] = [];
    for (const piece of state.availablePieces) {
      if (!opponentCanWinWithPiece(state.board, piece)) safe.push(piece);
    }
    const pool = safe.length > 0 ? safe : state.availablePieces;
    const piece = pool[Math.floor(rng() * pool.length)]!;
    return createGiveMove(state.currentPlayer, piece);
  }
  ...
}
```

`wouldCompleteLine` / `opponentCanWinWithPiece` are **read-only** checks on the current board — they must not call `board.clone()`, `board.withCell()`, or `state.clone()`. Tic-tac-toe v1 remains uniform random among empty cells (see §6.3). Other games define their own rollout policy; all must stay cheaper than full `generateMoves` scoring.

**Implementing `makeMove` and `applyMove`**

Share one in-place transition helper:

```ts
function applyMoveInPlace(state: S, move: M): void { ... }

makeMove(state, move) {
  const next = state.clone() as S;
  applyMoveInPlace(next, move);
  return next;
}

applyMove(state, move) {
  applyMoveInPlace(state, move);
}
```

**Default bundle** (`uniform` heuristic): `generateMoves` lists legal moves with `heuristicValue = 0.5` on each; `generateRolloutMove` uses each game's v1 rollout policy from §6.3 (tic-tac-toe: uniform empty cell; Quarto: tactical fast path); `evaluatePosition` returns `0.5`; `makeMove` and `applyMove` share the same in-place rules helper (`makeMove` clones first).

### 6.3 v1 heuristics

In **v1**, position and move heuristics are **simple hand-written logic** (material counts, immediate threats, safe-piece tallies, etc.). Move scores for the tree are assigned in `generateMoves`; position scores in `evaluatePosition`; rollout plies use **`generateRolloutMove`** with game-specific fast policies (see table — not a subset of `generateMoves`).

| Game | `evaluatePosition` (v1) | `Move.heuristicValue` in `generateMoves` (v1) | `generateRolloutMove` (v1) |
|------|-------------------------|-----------------------------------------------|------------------------------|
| Quarto | Safe-piece count / threat balance | Immediate win, block win, safe-piece delta | **Place:** first winning empty cell, else uniform random empty cell. **Give:** uniform random among pieces that do not lose immediately; if all lose, uniform random among all. Read-only board checks only — no clone/`withCell`. |
| Tic-tac-toe | Line completion potential | Win now, block opponent win | Uniform random among legal moves |
| Chess (future) | Piece values + mobility (simple) | Capture value, check bonus | Uniform random among legal moves |

Neural networks and opening books are explicitly out of v1 scope (see Non-goals).

### 6.4 `SearchParameters`

Algorithm settings for **one** search run. A **class** (not a plain config object) so game apps can subclass, attach presets, and build instances in coordinators.

```ts
class SearchParameters {
  /** UCT exploration constant. Typical range: 0.5 – 2.0. Default: √2. */
  explorationConstant: number;

  /**
   * Hard iteration ceiling for this run.
   * Default: very large; app normally ends search via stop signal before this.
   */
  maxIterations: number;

  /** Max atomic moves (plies) per rollout before heuristic cutoff. Default: 200. */
  maxRolloutPlies: number;

  /** Post-search move pick strategy. Default: 'robust'. */
  selectionPolicy: 'robust' | 'maxValue';

  /** Weight for `move.heuristicValue` in expansion ordering / UCT selection priors. Default: 0. */
  movePriorWeight: number;

  /**
   * MCTS iterations between stop-signal polls.
   * Stop is only checked at these boundaries (not every iteration). Default: 32.
   */
  stopPollInterval: number;

  /**
   * RNG seed for this search run only.
   * Assigned per worker / per parallel slot via SearchParameters so multiple
   * workers can search the same position with different rollout streams.
   * Same state + same SearchParameters (including seed) → same result.
   */
  seed: number;

  /** Player to optimize for (root perspective). Default: state's currentPlayer. */
  rootPlayer?: PlayerId;

  /**
   * Selects which SearchFunctions bundle the worker uses for this search.
   * Resolved in the worker registry (functions are not sent over postMessage). Default: 'uniform'.
   */
  heuristicId: string;

  constructor(options?: Partial<SearchParameters>);
  // Defaults include stopPollInterval 32, seed 0 (coordinator overrides seed per worker)

  /** JSON-safe snapshot for worker messages. */
  serialize(): SerializedSearchParameters;

  /** Reconstruct in worker. */
  static deserialize(payload: SerializedSearchParameters): SearchParameters;
}

type SerializedSearchParameters = Record<string, unknown>;
```

### 6.5 Delivering functions to the worker

Functions cannot be structured-cloned in `postMessage`. Flow:

1. Game adapter **registers** named `SearchFunctions` bundles in the worker at startup (e.g. `quarto-basic`, `quarto-brutal`).
2. `SearchParameters.heuristicId` in the search request selects the bundle.
3. Worker builds `SearchInput { state, params, functions: registry.get(heuristicId) }` and calls `MCTSEngine.search`.

The coordinator sends `params.serialize()` (includes `heuristicId`); the worker attaches the matching functions locally.

```ts
interface SearchRequest {
  type: 'search';
  requestId: string;
  gameId: string;
  state: SerializedGameState;
  params: SerializedSearchParameters;  // includes heuristicId
}
```

On the main thread, `ComputeMoveRequest` sets `params.heuristicId` (or uses a `SearchParameters` subclass that sets it in the constructor).

### 6.6 What is not in SearchParameters

These stay in the coordinator (not algorithm params):

- `timeLimitMs`, thinking delay, animation pacing
- When to send `stop`
- Whether to chain another search after a multi-phase ply
- Difficulty names (`easy` / `hard`) — map to `SearchParameters` + `heuristicId` in the app

### 6.7 Example app subclass

```ts
class QuartoSearchParameters extends SearchParameters {
  constructor(difficulty: AIDifficulty) {
    super({
      explorationConstant: difficulty === 'brutal' ? 1.4 : 1.0,
      maxIterations: 1_000_000,
      seed: deriveSeedForWorker(workerIndex),
      heuristicId: difficulty === 'easy' ? 'quarto-basic' : 'quarto-standard',
    });
    this.difficulty = difficulty;
  }
  readonly difficulty: AIDifficulty;
}
```

---

## 7. Game-facing coordinator API

The **game app** (UI, hooks, controllers) never talks to the worker directly. It calls **`MCTSSearchCoordinator.computeMove()`** once per AI decision. The coordinator runs **one single-threaded worker search per phase**, applies intermediate moves, and returns a **combined result** — an ordered list of atomic moves that complete the current turn (or stop early on terminal).

### 7.1 Call flow

```
Game                          Coordinator                         Worker
  │                                │                                │
  │ computeMove(state, options)    │                                │
  │───────────────────────────────▶│                                │
  │                                │ [optional thinking delay]        │
  │                                │                                │
  │                                │ runSingleSearch(state, phase₀)   │
  │                                │───────────────────────────────▶│ MCTSEngine loop
  │                                │◀───────────────────────────────│ atomic move₀
  │                                │ applyMove → state₁               │
  │                                │                                │
  │                                │ if turn incomplete:              │
  │                                │   runSingleSearch(state₁, …)     │
  │                                │───────────────────────────────▶│
  │                                │◀───────────────────────────────│ atomic move₁
  │                                │                                │
  │◀───────────────────────────────│ CoordinatorMoveResult          │
  │   { moves: [move₀, move₁] }    │                                │
```

- **Chess / Go**: one worker search → `moves.length === 1`.
- **Quarto**: two searches (place, give) → `moves.length === 2` (or one if placement wins).
- **Arimaa**: up to four searches per turn → `moves.length` ≤ 4.

### 7.2 Types

```ts
/** What the game passes in. */
interface ComputeMoveRequest {
  /** Serialized position at the start of the AI decision. */
  state: SerializedGameState;

  /**
   * Search shaping params + heuristicId (selects generateMoves / generateRolloutMove / evaluatePosition / makeMove / applyMove in worker).
   */
  params: SearchParameters;

  /** Wall-clock budget for the entire computeMove (all phases). Coordinator splits across searches. */
  timeLimitMs?: number;

  /** Delay before the first worker search (UI "thinking" time). Default: 0. */
  thinkingDelayMs?: number;

  /** Player the AI is playing as. Default: state's currentPlayer. */
  rootPlayer?: PlayerId;
}

/** One atomic move from a single worker search. */
interface AtomicMoveResult {
  move: SerializedMove;
  moveKey: string;
  player: PlayerId;
  phase: PhaseId;
  iterations: number;
  stopped: boolean;       // worker ended due to stop signal
  elapsedMs: number;
}

/** What the game receives — full AI decision. */
interface CoordinatorMoveResult {
  /** Atomic moves in play order. Length 1 for single-phase games. */
  moves: AtomicMoveResult[];

  /** State after applying all moves (coordinator applies via adapter). */
  resultingState: SerializedGameState;

  totalIterations: number;
  totalElapsedMs: number;

  /** True if computeMove was interrupted via stop() before turn completed. */
  interrupted: boolean;
}

type ProgressHandler = (progress: CoordinatorProgress) => void;

interface CoordinatorProgress {
  /** Which atomic move in the turn is being searched (0-based). */
  phaseIndex: number;
  phase: PhaseId;
  iterations: number;
}
```

### 7.3 `MCTSSearchCoordinator` (primary game API)

Shipped in the mcts package. Constructed with a **worker port** and a **game-specific adapter**.

```ts
class MCTSSearchCoordinator {
  constructor(
    workerPort: MCTSWorkerPort,
    adapter: GameCoordinatorAdapter,
  );

  /** Resolves when the worker has sent `ready`. */
  readonly ready: Promise<void>;

  /**
   * Primary entry point for game apps.
   * Runs one or more single-threaded worker searches, combines atomic moves,
   * returns when the turn is complete or the game is terminal.
   */
  computeMove(request: ComputeMoveRequest): Promise<CoordinatorMoveResult>;

  /**
   * Stop the current worker search and abort the multi-phase loop.
   * Returned result has interrupted: true and partial moves[].
   */
  stop(): void;

  /** Optional: throttled progress for UI (coordinator may aggregate worker progress). */
  onProgress(handler: ProgressHandler): void;

  dispose(): void;
}
```

**Game usage (generic)**

```ts
const coordinator = new MCTSSearchCoordinator(workerPort, quartoCoordinatorAdapter);

// In useAIController or equivalent:
const result = await coordinator.computeMove({
  state: gameState.serialize(),
  params: new QuartoSearchParameters(difficulty),
  timeLimitMs: 3000,
  thinkingDelayMs: 500,
});

for (const atomic of result.moves) {
  applyAtomicMoveToUI(atomic.move);
}
```

The game applies `result.moves` to its React state / board. It does **not** call the worker or run additional searches for follow-on phases.

### 7.4 `GameCoordinatorAdapter`

Per-game plugin that tells the coordinator when a turn is finished and how to advance state between worker calls. Lives alongside the worker `GameEngine` (shared rules module recommended).

```ts
interface GameCoordinatorAdapter {
  readonly gameId: string;

  /** Max atomic moves per turn (safety cap). Quarto: 2, Arimaa: 4, chess: 1. */
  readonly maxPliesPerTurn: number;

  /** Read current phase from serialized state. */
  getCurrentPhase(state: SerializedGameState): PhaseId;

  /** Read current player from serialized state. */
  getCurrentPlayer(state: SerializedGameState): PlayerId;

  /** Apply one atomic move on the main thread; must match worker `SearchFunctions.makeMove`. */
  applyMove(state: SerializedGameState, move: SerializedMove): SerializedGameState;

  isTerminal(state: SerializedGameState): boolean;

  /**
   * After applying an atomic move, is the AI's visible turn complete?
   * Quarto: false after place (need give), true after give or winning place.
   * Chess: always true after one move.
   */
  isTurnComplete(
    stateBefore: SerializedGameState,
    stateAfter: SerializedGameState,
  ): boolean;

  /**
   * Optional: split timeLimitMs across remaining plies in the turn.
   * Default: equal split among maxPliesPerTurn.
   */
  timeLimitForPly?(
    plyIndex: number,
    totalTimeLimitMs: number,
    state: SerializedGameState,
  ): number;
}
```

### 7.5 Coordinator `computeMove` algorithm

Pseudocode — implemented in `MCTSSearchCoordinator`:

```ts
async computeMove(request): Promise<CoordinatorMoveResult> {
  await this.ready;
  if (request.thinkingDelayMs > 0) await delay(request.thinkingDelayMs);

  const moves: AtomicMoveResult[] = [];
  let state = request.state;
  let totalIterations = 0;
  let totalElapsedMs = 0;
  const startMs = now();

  for (let plyIndex = 0; plyIndex < adapter.maxPliesPerTurn; plyIndex++) {
    if (adapter.isTerminal(state)) break;

    const remainingMs = request.timeLimitMs != null
      ? request.timeLimitMs - (now() - startMs)
      : undefined;
    if (remainingMs != null && remainingMs <= 0) break;

    const plyTimeLimit = adapter.timeLimitForPly?.(plyIndex, request.timeLimitMs, state)
      ?? remainingMs;

    const atomic = await this.runSingleSearch({
      state,
      params: withRootPlayer(request.params, request.rootPlayer),
      timeLimitMs: plyTimeLimit,
      plyIndex,
    });

    if (this.aborted) return partialResult(moves, interrupted: true);

    moves.push(atomic);
    totalIterations += atomic.iterations;
    totalElapsedMs += atomic.elapsedMs;

    const stateBefore = state;
    state = adapter.applyMove(state, atomic.move);

    if (adapter.isTurnComplete(stateBefore, state) || adapter.isTerminal(state)) {
      break;
    }
  }

  return {
    moves,
    resultingState: state,
    totalIterations,
    totalElapsedMs,
    interrupted: false,
  };
}
```

### 7.6 `runSingleSearch` (coordinator → worker, internal)

One call = one **single-threaded** `MCTSEngine.search` in the worker. Not exposed to game apps.

```ts
/** Internal — one worker search for the current phase. */
private runSingleSearch(options: {
  state: SerializedGameState;
  params: SearchParameters;
  timeLimitMs?: number;
  plyIndex: number;
}): Promise<AtomicMoveResult>;
```

Steps:

1. `workerPort.postSearch({ gameId, state, params: options.params.serialize() })`
2. If `timeLimitMs` set: `setTimeout(() => workerPort.postStop(), timeLimitMs)`
3. Await worker `result`
4. Clear stop timer; map to `AtomicMoveResult`

Each `runSingleSearch` is independent — fresh tree, no carry-over from prior phase.

### 7.7 Parallel workers and result merging

When the coordinator dispatches **multiple workers** for the same phase, each worker is fully independent:

- Separate worker thread, separate tree, separate `SearchParameters` (including **distinct `seed`**).
- **No locks, atomics, `SharedArrayBuffer`, or postMessage between workers.**

The coordinator alone merges outcomes on the main thread after all workers finish (or stop):

```ts
// Coordinator — sole place that combines parallel worker results
const seeds = [101, 202, 303, 404];
const results = await Promise.all(
  workers.map((port, i) =>
    runSingleSearchOn(port, { ...params, seed: seeds[i] }),
  ),
);
const bestMove = mergeAtomicResults(results); // e.g. sum visits per moveKey, pick robust child
```

`mergeAtomicResults` is coordinator logic (or a small helper in `src/coordinator/`). It never runs inside a worker and never requires workers to share data.

### 7.8 Game-specific parameter classes

Difficulty presets and app-only fields stay in the game app as `SearchParameters` subclasses. The coordinator passes them through to each worker search and assigns **distinct seeds** for parallel workers (see §7.7).

```ts
class QuartoSearchParameters extends SearchParameters {
  static forDifficulty(d: AIDifficulty): QuartoSearchParameters { ... }
}
```

### 7.9 Coordinator responsibilities vs worker responsibilities

| Concern | Owner |
|---------|--------|
| `computeMove` API | `MCTSSearchCoordinator` |
| Multi-phase loop, combine `moves[]` | Coordinator |
| Time budget across plies | Coordinator (+ optional `timeLimitForPly`) |
| Thinking delay before search | Coordinator |
| `stop()` / interrupted partial turn | Coordinator |
| Progress aggregation for UI | Coordinator |
| Merge parallel worker results | Coordinator (main thread only) |
| UCT / rollouts / tree | Worker `MCTSEngine` (isolated per worker) |
| Poll stop flag | Worker, every `params.stopPollInterval` iterations |

**Separation rule**: Clocks, turn completion, and combining phases → coordinator. Tree search → worker.

---

## 8. Worker Protocol

All messages are discriminated unions with a `type` field. Payloads must be structured-cloneable.

### 8.1 Main → Worker

#### `search`

Start a new search. Clears any previous stop flag. Runs synchronously in the worker until `stop` or `maxIterations`.

```ts
interface SearchRequest {
  type: 'search';
  requestId: string;
  gameId: string;
  state: SerializedGameState;
  params: SerializedSearchParameters;  // includes heuristicId
}
```

(Defined in §6.5; repeated here for worker protocol reference.)

#### `stop`

Set the stop flag for the current (or matching `requestId`) search. The worker polls this flag at **`stopPollInterval`** boundaries via `StopSignal.shouldStop()`. Does not interrupt mid-iteration.

```ts
interface StopRequest {
  type: 'stop';
  requestId?: string;          // if omitted, stop current search
}
```

#### `ping`

Health check.

```ts
interface PingRequest {
  type: 'ping';
}
```

### 8.2 Worker → Main

#### `ready`

Sent once when worker and game adapters are loaded.

```ts
interface ReadyMessage {
  type: 'ready';
  gameIds: string[];
}
```

#### `progress` (optional)

Emitted during search at the worker's natural iteration cadence (not throttled by the library). The **game app coordinator** throttles or ignores these for UI.

```ts
interface ProgressMessage {
  type: 'progress';
  requestId: string;
  iterations: number;
}
```

No `elapsedMs` in progress — the coordinator tracks wall time if needed.

#### `result`

```ts
interface SearchResult {
  type: 'result';
  requestId: string;
  bestMove: SerializedMove;     // includes player, phase, key, and game payload
  bestMoveKey: string;
  bestMovePlayer: PlayerId;
  bestMovePhase: PhaseId;
  iterations: number;
  stopped: boolean;             // true if ended due to stop signal (vs maxIterations)
  elapsedMs: number;            // worker wall time for diagnostics
  children: Array<{
    moveKey: string;
    move: SerializedMove;
    player: PlayerId;
    phase: PhaseId;
    visits: number;
    winRate: number;
  }>;
}

/** JSON-safe move; must include at least key, player, phase; includes heuristicValue when from search. */
type SerializedMove = Record<string, unknown>;
```

#### `error`

```ts
interface ErrorMessage {
  type: 'error';
  requestId?: string;
  message: string;
  code: 'UNKNOWN_GAME' | 'INVALID_STATE' | 'SEARCH_FAILED' | 'INTERNAL';
}
```

#### `pong`

Response to `ping`.

### 8.3 Worker stop polling

The worker holds a boolean flag cleared on each `search` and set on `stop`. `MCTSEngine` checks it only every `params.stopPollInterval` iterations:

```ts
const stopSignal: StopSignal = {
  shouldStop: () => workerContext.stopRequested,
};

let iterations = 0;
while (iterations < params.maxIterations) {
  runIteration();
  iterations++;

  if (iterations % params.stopPollInterval === 0 && stopSignal.shouldStop()) {
    break;
  }
}
```

**Stop latency** is bounded by roughly `stopPollInterval × iteration time` (typically a few ms to tens of ms). Polling every iteration adds unnecessary overhead in the hot loop; the interval is tunable per search via `SearchParameters`.

No `SharedArrayBuffer` or async interruption required in v1. Workers never share memory with each other.

---

## 9. Worker port (optional thin helper)

The mcts package may ship a minimal helper for `postMessage` wiring. It does **not** implement timing, promises with timeouts, or coordination — that stays in the game app's coordinator.

```ts
class MCTSWorkerPort {
  constructor(workerUrl: string | URL);

  waitUntilReady(): Promise<void>;

  /** Fire-and-forget; result arrives via onResult callback or returned promise per call site. */
  postSearch(request: SearchRequest): void;

  postStop(requestId?: string): void;

  onResult(handler: (msg: SearchResult) => void): void;
  onProgress(handler: (msg: ProgressMessage) => void): void;
  onError(handler: (msg: ErrorMessage) => void): void;

  dispose(): void;
}
```

Apps may use `MCTSWorkerPort` inside their coordinator or talk to `Worker` directly.

---

## 10. Game Adapter Registration (Worker)

Inside the worker, adapters are registered by `gameId`:

```ts
interface GameAdapter<
  S extends GameState = GameState,
  M extends Move = Move,
> {
  gameId: string;
  engine: GameEngine<S, M>;
  /** Named SearchFunctions bundles for this game (v1: simple heuristics). */
  heuristics: Record<string, SearchFunctions<S, M>>;
}

function registerGame(adapter: GameAdapter): void;

function resolveSearchFunctions(
  gameId: string,
  heuristicId: string,
): SearchFunctions;
```

Each game module exports `registerQuarto(registry)` registering e.g. `heuristics: { 'quarto-basic': ..., 'quarto-standard': ... }`. The worker entry file imports game bundles and registers them. **Tree shaking**: apps import only the games they need when building the worker bundle.

---

## 11. Multi-phase games (reference patterns)

### 11.1 Simple turns (chess, Go)

One phase per turn; one atomic move completes the turn.

```ts
type ChessPhase = 'main';

interface ChessMove extends Move {
  player: PlayerId;
  phase: 'main';
  key: string;
  from: Square;
  to: Square;
  promotion?: PieceType;
}

// makeMove: currentPhase stays 'main'; currentPlayer switches to opponent.
```

MCTS root children are the usual legal chess moves. One `computeMove` → one worker search → `moves.length === 1`.

### 11.2 Quarto (two phases per turn)

From the **human player's** perspective, one turn is: place the staged piece, then give a piece to the opponent. For MCTS that is **two atomic plies** (same `currentPlayer`, two phases).

```ts
type QuartoPhase = 'place' | 'give';

interface QuartoPlaceMove extends Move {
  player: PlayerId;
  phase: 'place';
  key: string;
  row: number;
  col: number;
}

interface QuartoGiveMove extends Move {
  player: PlayerId;
  phase: 'give';
  key: string;
  piece: PieceAttributes;
}
```

**State**

```ts
interface QuartoState extends GameState<QuartoBoard> {
  board: QuartoBoard;
  currentPlayer: PlayerId;
  currentPhase: QuartoPhase;
  availablePieces: PieceAttributes[];
  stagedPiece: PieceAttributes | null;
}
```

**Phase transitions (`makeMove`)**

| Phase | Atomic move | Next phase | Next player |
|-------|-------------|------------|-------------|
| `place` | `QuartoPlaceMove` | `give` if no win; terminal if win | same player |
| `give` | `QuartoGiveMove` | `place` | opponent |
| (no staged piece, game start) | — | `give` only | same player |

`generateMoves` (in `SearchFunctions`, tree expansion):

- `currentPhase === 'place'` and `stagedPiece !== null` → all empty cells as `QuartoPlaceMove`.
- `currentPhase === 'give'` → all `availablePieces` as `QuartoGiveMove`.

`generateRolloutMove` (in `SearchFunctions`, rollout) — **separate fast code** from `generateMoves`; read-only board access only (no `state.clone()`, `board.clone()`, or `board.withCell()`):

**Place** (`currentPhase === 'place'`, `stagedPiece !== null`):

1. Scan empty cells. If placing `stagedPiece` at a cell completes a Quarto line, return the **first** such `QuartoPlaceMove`.
2. Otherwise return one **uniformly random** empty cell (reservoir sample while scanning — no full move list).

**Give** (`currentPhase === 'give'`):

1. Let **safe pieces** be those where giving the piece does **not** let the opponent win on their next placement (immediately losing gives).
2. Return a **uniformly random** `QuartoGiveMove` from safe pieces.
3. If every available piece loses immediately, return a **uniformly random** piece from all `availablePieces`.

Use read-only helpers (e.g. `wouldCompleteLine(board, piece, row, col)`, `opponentCanWinWithPiece(board, piece)`) that inspect lines through candidate cells without copying the board.

**`GameEngine` responsibilities**

- `isTerminal`, `getOutcome`.

**`SearchFunctions` responsibilities**

- `generateMoves` (sets `heuristicValue` on each move), `generateRolloutMove` (Quarto rollout policy above; read-only, no board copy), `makeMove` (clone + apply), `applyMove` (in-place on rollout scratch), `evaluatePosition` (v1 simple heuristics).

**Integration with QuAIto**

`useAIController` calls the coordinator once per AI turn:

```ts
const result = await quartoCoordinator.computeMove({
  state: serializeQuartoState(board, stagedPiece, availablePieces, currentPlayer, gamePhase),
  params: QuartoSearchParameters.forDifficulty(basicAIDifficulty),
  timeLimitMs: QUARTO_AI_TIME_MS[basicAIDifficulty],
  thinkingDelayMs: AI_THINKING_DELAY_MS,
});

if (result.interrupted) return;

const placeMove = result.moves.find(m => m.phase === 'place');
const giveMove = result.moves.find(m => m.phase === 'give');

if (placeMove) applyPlacement(placeMove.move);
if (giveMove) applyGive(giveMove.move);
```

The controller does **not** invoke the worker for the give phase separately — the coordinator already ran both single-threaded searches and returned `result.moves`.

On new game or AI toggle mid-think: `quartoCoordinator.stop()`.

Do **not** bundle place + give into one worker tree edge; the coordinator chains two worker searches instead.

### 11.3 Arimaa (four phases per turn)

Each turn allows up to four steps (piece moves/pushes/pulls). Each step is one atomic move sharing the same `currentPlayer` until four steps are consumed or the player passes remaining steps.

```ts
type ArimaaPhase = 0 | 1 | 2 | 3;

interface ArimaaStepMove extends Move {
  player: PlayerId;
  phase: ArimaaPhase;   // step index within the turn
  key: string;
  action: ArimaaAction; // game-specific: directional move, push, pull, etc.
}
```

`makeMove`: increment phase (or wrap to opponent at phase 0) per Arimaa rules. `computeMove` runs up to four single-threaded worker searches; `result.moves` has one entry per step taken this turn.

---

## 12. Serialization & Performance

### 12.1 Serialization

- Worker messages use plain objects (no class instances).
- `GameState.serialize()` and `SearchParameters.serialize()` on the main thread; worker reconstructs via `createState` / `SearchParameters.deserialize`.
- Prefer compact representations for large boards (e.g. flat arrays vs nested objects).

### 12.2 Performance expectations

- Target: ≥ 1 000 iterations/sec for small games (e.g. Quarto) in a modern browser on worker thread.
- Avoid allocating in hot paths where possible: reuse RNG, pool states if profiling shows pressure (optimization pass, not v1 requirement).

### 12.3 Memory

- Tree is discarded after each `search` request (no persistent tree in v1).
- Node count bounded by `maxIterations` and branching factor.

---

## 13. Error Handling

| Situation | Behavior |
|-----------|----------|
| Unknown `gameId` | `error` with `UNKNOWN_GAME` |
| `deserialize` / `createState` fails | `error` with `INVALID_STATE` |
| No legal moves at root | `result` with `bestMove: null` and empty children |
| Exception during iteration | `error` with `SEARCH_FAILED`, include message; worker stays alive |
| `stop` mid-search | `result` with `stopped: true` and partial tree stats |

---

## 14. Testing Strategy

| Layer | Tests |
|-------|-------|
| **Contracts** | Type-only / compile tests |
| **MCTS core** | Unit tests: `MCTSEngine.search(SearchInput, stopSignal)` in-process with mock `SearchFunctions` |
| **Coordinator** | Multi-phase `computeMove` with mock worker; toy game adapter `maxPliesPerTurn: 1` |
| **Evaluator** | Optional heuristic sanity tests per `SearchFunctions` bundle |
| **Worker** | Integration test: spawn worker (Vitest `pool: 'forks'` or dedicated worker test helper), run search on toy game |
| **Client** | Mock worker message exchange for `MCTSWorkerPort` |

No browser-only APIs in `MCTSEngine` — seedable PRNG for rollouts. Worker tests use real worker thread.

---

## 15. Package & Build

```text
mcts/
  specification.md          (this file)
  package.json
  tsconfig.json
  src/
    contracts/
    mcts/
    coordinator/            MCTSSearchCoordinator + GameCoordinatorAdapter types
    worker/                   thin MCTSWorker message loop
    worker-port/              optional thin postMessage helper
    games/
      quarto/               (later)
    index.ts                (main-thread exports)
  worker-entry.ts           (worker bundle entry)
```

- **Build**: Vite library mode or `tsc` emitting ESM + worker bundle as separate entry.
- **Exports**:
  - `@smart-games/mcts` — `MCTSSearchCoordinator`, `SearchParameters`, contracts, types
  - `@smart-games/mcts/worker` — worker bundle entry URL

---

## 16. Resolved decisions (locked before Phase 1)

All items below are **locked** for v1 implementation.

| # | Question | Decision |
|---|----------|----------|
| 1 | Support games with simultaneous moves? | **No** — v1 is turn-based only |
| 2 | Atomic vs composite moves? | **Atomic only** — `Move` includes `player` + `phase`; coordinator chains plies for multi-phase turns |
| 3 | Progress events from worker? | **Optional** — worker may emit raw `progress`; coordinator throttles or ignores for UI |
| 4 | Move heuristic in UCT formula as prior? | **Expansion order in v1** — `move.heuristicValue` sorts `untriedMoves`; UCT prior via `movePriorWeight` is optional (default `0`) |
| 5 | Worker bundle includes all games or per-app? | **Per-app** — each app's `worker-entry.ts` imports only the game adapters it needs |
| 6 | npm package name / monorepo placement? | **`@smart-games/mcts`** — package root is the `mcts/` folder |
| 7 | Time limits in library? | **Coordinator only** — worker polls `stop` at `stopPollInterval`; no wall-clock logic in `MCTSEngine` |
| 8 | Cross-worker locking or shared state? | **Never** — isolated workers; coordinator merges results on the main thread only |
| 9 | `PlayerId` convention? | **`0 \| 1` zero-based** — first player = `0`, second = `1`; internal indices zero-based throughout; app-specific labels (e.g. QuAIto `1 \| 2`) map at adapter boundary only |
| 10 | UCT / post-search tie-breaking? | **Random** — uniform among tied candidates via search PRNG (not first-child, not `Math.random()`) |
| 11 | PRNG algorithm? | **mulberry32** in `src/mcts/prng.ts` — fast, seedable; one instance per search from `SearchParameters.seed` |

Peer dependency: none required for core. Game adapters may depend on game-specific types from app packages.

---

## 17. Implementation Phases

### Phase 1 — Core

- Contracts (`Move`, `PhaseId`, `Board`, `GameState`, `GameEngine`, `SearchFunctions`, `SearchInput`, coordinator types)
- `SearchParameters` class
- `MCTSEngine` (non-recursive UCT loop, nodes with state copies) + `StopSignal`
- `GameCoordinatorAdapter` + `MCTSSearchCoordinator`
- Seedable PRNG
- Toy game (tic-tac-toe) for tests

### Phase 2 — Coordinator + Worker + port

- `GameCoordinatorAdapter` interface
- `MCTSSearchCoordinator.computeMove` multi-phase loop
- Message protocol (`search`, `stop`, `result`)
- Thin `MCTSWorker` with polled `StopSignal`
- Optional `MCTSWorkerPort`

### Phase 3 — Quarto adapter + QuAIto integration

- `QuartoEngine` + `SearchFunctions` heuristics (worker)
- `QuartoCoordinatorAdapter` (main-thread chaining)
- Wire `useAIController` → `computeMove`
- `QuartoSearchParameters.forDifficulty` + `timeLimitMs` in request

### Phase 4 — Polish

- Diagnostics UI hook (optional tree stats in AI config modal)
- Performance profiling on Quarto
- Documentation and examples

---

## 18. Acceptance Criteria (v1 complete)

1. Toy game: `MCTSEngine` finds winning move in one-ply win positions and blocks one-ply losses.
2. Worker search does not block main thread.
3. `stop` message causes search to end within one `stopPollInterval` batch (polled `StopSignal`).
4. Same `SearchParameters` + `seed` + stop at same iteration → same `bestMoveKey`.
5. Quarto: one `computeMove` returns place + give atomic moves; combined play stronger than `brutal` heuristic at comparable wall-clock budget.
6. No game-specific imports in `src/mcts/` or `src/contracts/`.
7. No wall-clock timing logic in `src/mcts/` or `src/worker/`.
8. Game controllers call only `computeMove` / `stop` — never `postSearch` directly.

---

## 19. Glossary

| Term | Meaning |
|------|---------|
| **MCTS** | Monte Carlo Tree Search — builds a search tree guided by random simulations |
| **UCT** | Selection rule balancing exploitation (win rate) and exploration |
| **Phase** | Step within a turn with its own legal moves (`PhaseId`) |
| **Atomic move** | One legal action in one phase; one tree edge; includes `player` and `phase` |
| **Ply** | Same as atomic move in this spec |
| **Turn** | Sequence of plies until the next opponent decision point (e.g. 2 plies in Quarto, 4 in Arimaa, 1 in chess) |
| **Rollout** | Random playout from a node, one atomic move per step, to estimate value |
| **Robust child** | Move with most visits — resistant to rollout noise |
| **MCTSEngine** | Runs single-threaded search; `search(SearchInput, StopSignal)` |
| **SearchParameters** | Class holding algorithm settings for one search run, including **`seed`** per worker |
| **StopSignal** | `shouldStop()` checked every `stopPollInterval` iterations; set by worker on `stop` message |
| **stopPollInterval** | `SearchParameters` field — iterations between stop polls (default 32) |
| **Search coordinator** | `MCTSSearchCoordinator` — game calls `computeMove`; runs N worker searches for multi-phase turns |
| **computeMove** | Single game-facing API; returns combined `moves[]` for the full AI turn |
| **GameCoordinatorAdapter** | Per-game turn completion and main-thread `applyMove` between worker calls |
| **runSingleSearch** | Internal coordinator method; one isolated worker search |
| **Parallel workers** | Independent searches (distinct seeds, no shared data); coordinator merges results on main thread |
| **SearchInput** | Position + `SearchParameters` + `SearchFunctions` for one worker search |
| **SearchFunctions** | `generateMoves` (tree; sets `heuristicValue`), `generateRolloutMove` (one move per rollout ply), `evaluatePosition`, `makeMove` (copy), `applyMove` (in-place rollout) |
| **makeMove** | Tree only — apply move and return a new state copy; must not mutate input |
| **applyMove** | Rollout only — apply move in place on scratch copy cloned at rollout start |
| **generateRolloutMove** | Rollout-only move picker; game-specific fast policy; read-only on state/board; returns one legal move (or `null`); receives search PRNG |
| **heuristicValue** | Win-rate estimate `[0, 1]` on each `Move`, set when `generateMoves` runs (tree expansion only) |
| **MCTSNode** | Tree node with **state copy**, UCT stats; `wins` for `state.currentPlayer` |
| **Node wins** | Backed-up values for player to move at that node; flip `v` only when `currentPlayer` changes on backup |
| **Principal variation** | Robust highest-visit line from root; `sideToMoveWinRate` is node-local, `winRate` is root-perspective |
| **heuristicId** | `SearchParameters` field selecting a registered `SearchFunctions` bundle in the worker |
| **Adapter** | Game-specific `GameEngine` + named `SearchFunctions` heuristics |
| **Root player** | Player whose win probability the search maximizes |
