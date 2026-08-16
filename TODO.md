# MCTS Improvements

## Test framework

See [STRENGTH-TEST.md](./STRENGTH-TEST.md) (draft spec for review).

## Improve search efficiency

QuAIto is **time-capped** (~2s), so both more iterations/sec and better use of each iteration matter. Today every tree node stores a full `state` (`clone()` at root, `makeMove` clone on expand). Rollouts already clone **once** from the leaf, then `applyMove` in place. Spec still treats per-node copies as required — items that drop them need a spec change.

### Throughput (more iterations per second)

- **Compact Quarto state (bitboard / piece indices)** — cheaper `clone()` / `makeMove` without changing the tree model. Quarto currently copies a 4×4 object board plus `availablePieces.map`. Likely a solid win for modest risk; do this before dropping node states.
- **Cache side-to-move (and terminal) on the node** — UCT and backprop call `getCurrentPlayer(node.state)` because player-to-move is not stored on the node. Small CPU win; also unblocks a later no-state tree.
- **Drop per-node state copies** — reconstruct via apply/undo along the path, or one scratch board. Largest allocation/GC win; highest complexity; needs spec change.
- **Pooled rollout scratch** — reuse one buffer per search instead of `startNode.state.clone()` every iteration. Medium win, low risk.
- **Children as arrays, not `Map`** — UCT walks all children every selection. Small win at high branching (Quarto give, up to 16).
- **WASM / compiled core** — large potential, large project. Not why arena is slower than the webapp today (both paths are JS).

### Strength per unit time (same or fewer iterations, better moves)

- **Progressive widening** — delay expanding weak moves; less tree RAM and less wasted `makeMove`. Good fit for Quarto give.
- **RAVE / AMAF** — faster early move ranking; helps short time budgets more than raw iter/s.
- **Transpositions** — merge identical (board, staged, available, phase, player). Quarto’s state space is small enough that this can cut duplicate work; extra bookkeeping.
- **Shorter rollouts + cheaper leaf eval** — playouts still dominate time; a better `evaluatePosition` can beat long random-ish playouts. See **Improve value heuristics**.

## Update the UCT formula

`heuristicValue` is already used to **order expansion** (`untriedMoves` sorted descending). Selection uses standard UCT plus optional terms:

```
Q = wins/visits          // empirical, parent-perspective
U = c * sqrt(ln N / n)
bias = W * H / (n+1)     // progressive bias; W = progressiveBiasWeight (default 0)
prior = w * H            // additive; w = movePriorWeight (default 0)
score = Q + U + bias + prior
```

`H` is P(win | move) (a **value**), not a PUCT policy `P(a)`. Q exists after the first visit; progressive bias is how H affects selection while visits are still small.

- **Progressive bias — done** (Chaslot): `Q + U + W * H / (n+1)`. Library default `W = 0`; QuAIto sets `progressiveBiasWeight: 1`. Arena budgets may set `progressiveBiasWeight`.
- **Virtual counts / Bayesian Q**: `Q = (wins + n0 * H) / (visits + n0)` then standard UCT. Heuristic is a prior mean with `n0` pseudo-visits. Cleanest “same units as Q” story; `n0` is the one knob (small n0 → trust rollouts sooner).
- **First-play urgency / init Q**: unvisited (or n=0) children use `Q = H` (or a constant FPU). After the first visit, empirical Q only. Helps selection among newly expanded siblings; little effect once visits accumulate.
- **PUCT with softmax policy**: `P(a) = softmax(H / τ)` over children, then PUCT. Use this only if we want AlphaZero-style exploration (high-H moves get more of the exploration budget). Requires a policy conversion step; τ and `c_puct` need tuning. Do **not** use raw H as P(a).
- **Leave additive `movePriorWeight`** as a weak baseline / A-B against progressive bias — no decay, so it is inferior as a default.

## Improve value heuristics

Focus is **Quarto** (`quarto-basic`). Tic-tac-toe already has win/block plus line potential; lower priority.

Today three policies are separate (spec §6.2–6.3):

- **Tree (`quarto-basic`):** place = immediate win `1` (unblended); else remaining-moves blend of safe-piece P(win). Give = lethal `0` (unblended); safe gives blend of `0.5`.
- **Playout:** take an immediate winning place, else random empty cell; give uniform among non-lethal pieces.
- **Leaf eval:** exact terminal / staged-piece win; else remaining-moves blend of safe-piece P(win) for side-to-move, flipped to `perspectivePlayer`.
- `movePriorWeight` defaults to **0**. QuAIto uses `progressiveBiasWeight: 1` in UCT (`W * H / (n+1)`). See **Update the UCT formula**.

### Do first: P(win) scale — done

Tree `heuristicValue` and leaf `evaluatePosition` share a P(win) scale (`1` / `0.5` / `0`) with remaining-moves blend for uncertain tactics. Forced wins/lethals stay 0/1. Folding that into selection is **Update the UCT formula**, not a tactic change.

### Tree priors (`generateMoves` / `heuristicValue`)

After the P(win) scale:

- **Graded give scores** — replace binary lethal/safe with “how lethal” (winning cells, forks, 3-attribute lines), still as P(win). Highest-leverage Quarto change; give is the strategic move.
- **Richer place scores** — besides “don’t create a lethal give,” score threat creation, forks, and quiet cells. Medium benefit; place is already win-aware.
- **Selection formula** — progressive bias is in; remaining options in **Update the UCT formula**.

### Playout policy (`generateRolloutMove`)

- **Threat-aware place** — random empty cells ignore setups and blocks. Better rollout signal; some iter/s cost (keep cheaper than tree scoring).
- **Graded give among safe pieces** — uniform-among-safe still hands over fork pieces. Medium strength win if kept O(1) / cheap mask.

### Leaf / cutoff eval (`evaluatePosition`)

- **Line / attribute potential** — count near-quartos (2–3 matching attributes on a line), not only immediate lethals. Stronger cutoff so `maxRolloutPlies` can drop (see search-efficiency “shorter rollouts”).
- **Learned eval / NN** — large potential; out of v1 scope.
