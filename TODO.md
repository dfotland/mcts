# MCTS Improvements

## Test framework

See [STRENGTH-TEST.md](./STRENGTH-TEST.md) (draft spec for review).

## Improve search efficiency

QuAIto is **time-capped** (~2s), so both more iterations/sec and better use of each iteration matter. Nodes no longer store state: each iteration clones the search root once and `applyMove`s along the selected path, then rollouts on that same scratch. Remaining throughput work is cheaper `clone()` / `applyMove` and less work per iteration.

### Throughput (more iterations per second)

- **Compact Quarto state (bitboard / piece indices)** — cheaper per-iteration `clone()` / `applyMove`. Quarto currently copies a 4×4 object board plus `availablePieces.map`. Likely a solid win for modest risk.
- **Cache side-to-move (and terminal) on the node** — **done** (included with dropping per-node state).
- **Drop per-node state copies** — **done**. Each iteration clones `rootState` once, `applyMove`s stored edge moves to the leaf, then rollouts on that scratch. No undo.
- **Pooled rollout scratch** — **subsumed**. Rollout no longer clones from the leaf; the iteration scratch is already at the leaf. Pooling that per-iteration clone is still optional if profiling shows allocation pressure.
- **Children as arrays, not `Map`** — UCT walks all children every selection. Small win at high branching (Quarto give, up to 16).
- **WASM / compiled core** — large potential, large project. Not why arena is slower than the webapp today (both paths are JS).

### Strength per unit time (same or fewer iterations, better moves)

- **Progressive widening** — delay expanding weak moves; less tree RAM and less wasted `makeMove`. Good fit for Quarto give.
- **RAVE / AMAF** — faster early move ranking; helps short time budgets more than raw iter/s.
- **Transpositions** — merge identical (board, staged, available, phase, player). Quarto’s state space is small enough that this can cut duplicate work; extra bookkeeping.
- **Shorter rollouts + cheaper leaf eval** — playouts still dominate time; a better `evaluatePosition` can beat long random-ish playouts. See **Improve value heuristics**.

## Update the UCT formula

`heuristicValue` is already used to **order expansion** (`untriedMoves` sorted descending). Selection uses Bayesian Q plus exploration on real visits:

```
n0 = p*(1-p)/σ² - 1     // pseudo-trials from game-supplied p, σ
α  = p * n0             // pseudo-wins
Q  = (W + α) / (n + n0) // parent-perspective empirical W mixed with Beta prior
U  = c * sqrt(ln N / n) // real visits only
score = Q + U
```

`H` / `p` is P(win | move) (a **value**), not a PUCT policy `P(a)`. `σ` is `heuristicStdDev` in `[0.1, 0.35]`. Forced 0/1 uses `σ = 0.1` (~24 virtual trials at p = 0.5); uncertain / uniform uses `σ = 0.35` (~1 trial).

- **Beta-binomial Q — done**: `Q = (W + α) / (n + n0)` with σ-derived `n0`. Replaces Chaslot `W * H / (n+1)` and additive `w * H`.
- **First-play urgency / init Q**: unvisited (or n=0) children use `Q = H` (or a constant FPU). After the first visit, empirical Q only. Helps selection among newly expanded siblings; little effect once visits accumulate.
- **PUCT with softmax policy**: `P(a) = softmax(H / τ)` over children, then PUCT. Use this only if we want AlphaZero-style exploration (high-H moves get more of the exploration budget). Requires a policy conversion step; τ and `c_puct` need tuning. Do **not** use raw H as P(a).

## Improve value heuristics

Focus is **Quarto** (`quarto-basic`). Tic-tac-toe already has win/block plus line potential; lower priority.

Today three policies are separate (spec §6.2–6.3):

- **Tree (`quarto-basic`):** place = if an immediate win exists, return only that move (`1`); else remaining-moves blend of safe-piece P(win). Give = lethal `0` (unblended); safe gives blend of `0.5`.
- **Playout:** take an immediate winning place, else random empty cell; give uniform among non-lethal pieces.
- **Leaf eval:** exact terminal / staged-piece win; else remaining-moves blend of safe-piece P(win) for side-to-move, flipped to `perspectivePlayer`.
- UCT mixes tree `heuristicValue` into Q as a Beta prior (`heuristicStdDev` sets `n0`). See **Update the UCT formula**.

### Do first: P(win) scale — done

Tree `heuristicValue` and leaf `evaluatePosition` share a P(win) scale (`1` / `0.5` / `0`) with remaining-moves blend for uncertain tactics. Forced wins/lethals stay 0/1. Folding that into selection is **Update the UCT formula**, not a tactic change.

### Tree priors (`generateMoves` / `heuristicValue`)

After the P(win) scale:

- **Graded give scores** — replace binary lethal/safe with “how lethal” (winning cells, forks, 3-attribute lines), still as P(win). Highest-leverage Quarto change; give is the strategic move.
- **Richer place scores** — besides “don’t create a lethal give,” score threat creation, forks, and quiet cells. Medium benefit; place is already win-aware.
- **Selection formula** — Beta-binomial Q is in; remaining options in **Update the UCT formula**.

### Playout policy (`generateRolloutMove`)

- **Threat-aware place** — random empty cells ignore setups and blocks. Better rollout signal; some iter/s cost (keep cheaper than tree scoring).
- **Graded give among safe pieces** — uniform-among-safe still hands over fork pieces. Medium strength win if kept O(1) / cheap mask.

### Leaf / cutoff eval (`evaluatePosition`)

- **Line / attribute potential** — count near-quartos (2–3 matching attributes on a line), not only immediate lethals. Stronger cutoff so `maxRolloutPlies` can drop (see search-efficiency “shorter rollouts”).
- **Learned eval / NN** — large potential; out of v1 scope.

## refactor and clean up the code

### move game-specific code out of mcts into the game itself — done

See [GAME-OWNED-ADAPTERS.md](./GAME-OWNED-ADAPTERS.md). Quarto adapters live in QuAIto `src/mcts-game/`. Arena loads that module once and each agent’s `MCTSEngine` from mcts `dist/`.
