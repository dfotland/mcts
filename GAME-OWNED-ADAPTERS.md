# Refactor: game-owned adapters (step by step)

Review this before implementing. Cross-repo: **mcts**, **QuAIto**, **arena**. Three git remotes; there is no single `git mv` across them.

**Goal:** several game apps as siblings of a shared MCTS engine. Engine API stays generic. Each game owns state and operations. Search still runs in a Web Worker (game code is bundled into that worker). Arena compares **engine builds** against **one shared game module**.

| Section | Workstream |
|---------|------------|
| **D** | Fix QuAIto git: `shared/common-spa` is a symlink but recorded as a submodule |
| **A** | Move Quarto into QuAIto; strip it from the mcts package |
| **B** | Arena loads one shared game module; each agent uses its own engine `dist/` |
| **C** | Spec, STRENGTH-TEST, README, and Cursor rules |

Do **D** first so `git` works in QuAIto. Then **A** before **B**. Finish **C** after A+B match reality.

**Out of scope:** merging QuAIto `src/utils/gameUtils.ts` with MCTS rules; extracting tic-tac-toe; multithreaded workers (coordinator can add them later; each worker still embeds the same adapter).

---

## Why this works

`postMessage` cannot send functions. The worker must already contain `generateMoves` / `makeMove`. QuAIto already has [`src/mcts/worker-entry.ts`](../QuAIto/src/mcts/worker-entry.ts); it currently imports `registerQuarto` from `@smart-games/mcts/worker-host`. After this refactor it imports the local adapter instead. Vite `?worker&url` is the “separate game build” for the SPA. Arena imports the same TypeScript in-process via `tsx` (no worker).

```text
QuAIto SPA  →  worker-entry bundles src/mcts-game + mcts worker-host
arena       →  one load of QuAIto mcts-game + per-agent mcts dist (MCTSEngine only)
```

---

## Target ownership

| Lives in | What |
|----------|------|
| **mcts** | Contracts, `MCTSEngine`, coordinator, worker protocol, `GameRegistry`, tic-tac-toe (in-tree test/demo) |
| **QuAIto** `src/mcts-game/` | Quarto rules, state, `quartoEngine`, heuristics, `registerQuarto`, coordinator adapter |
| **QuAIto** `src/mcts/` | Worker entry, UI serialize, search params, coordinator wiring |
| **arena** | Shared game module from QuAIto; each agent’s `MCTSEngine` / `SearchParameters` from that agent’s mcts `dist/` |

Adapter **source** may `import type` from `@smart-games/mcts` only (no `MCTSEngine` value imports). Tests in QuAIto may import the engine.

Old `arena/library/mcts@*` snapshots stay valid as **engine** binaries. Their bundled Quarto exports are ignored.

---

## Preconditions (before D / A)

- [ ] `cd mcts && npm test` (or `npm run test:run`) green
- [ ] `cd QuAIto && npm test` green
- [ ] `cd mcts && npm run build` so QuAIto’s `file:../mcts` dist is current
- [ ] Note: two git repos. Copy files; do not expect history to follow into QuAIto unless you use something like `git filter-repo` (not required)

---

## D — Fix QuAIto git: `shared/common-spa` symlink vs submodule

`git` in QuAIto currently fails with:

```text
error: expected submodule path 'shared/common-spa' not to be a symbolic link
```

Cause: the index still has a **gitlink** (`160000`) and [`.gitmodules`](../QuAIto/.gitmodules) lists `shared/common-spa` → `git@github.com:dfotland/common-SPA.git`, but the working tree is a **symlink** `shared/common-spa` → `../../common-SPA` (the sibling-repo layout in [QuAIto/README.md](../QuAIto/README.md)). Git refuses that mix.

Keep the sibling layout (one `common-SPA` checkout shared by apps). Do **not** replace the symlink with a nested clone.

- [ ] `git rm --cached shared/common-spa` (drops the gitlink; does not delete `games/common-SPA`)
- [ ] Remove [`.gitmodules`](../QuAIto/.gitmodules) (or the `shared/common-spa` entry if other submodules appear)
- [ ] Commit the symlink as a normal git symlink (`120000`) pointing at `../../common-SPA`, so `file:./shared/common-spa` in `package.json` still resolves
- [ ] Confirm `git status`, `git submodule`, and a dummy `git status --porcelain` succeed with no submodule error
- [ ] Align leftover docs that still say “after GitHub, `git submodule add … shared/common-spa`” ([`QuAIto/.cursor/rules/README.md`](../QuAIto/.cursor/rules/README.md), common-SPA README “use in an app (submodule)”) with sibling + symlink as the supported layout

**D done when:** `cd QuAIto && git status` runs without the symlink/submodule error, and `npm` still loads `@smart-games/common-spa` from the sibling tree.

---

## A — Move Quarto into QuAIto

Copy the adapter into QuAIto, switch the SPA to it, then delete Quarto from mcts. Keep the mcts copy until A.5–A.6 are green.

### A.1 Inventory (no code moves yet)

Confirm these are the only Quarto production consumers:

| Consumer | Files |
|----------|--------|
| mcts package barrel | `mcts/src/index.ts` → `export * from './games'` |
| mcts games barrel | `mcts/src/games/index.ts` (Quarto + TTT) |
| worker-host | `mcts/src/worker-host.ts`, `mcts/worker-host.d.ts` export `registerQuarto` |
| QuAIto worker | `QuAIto/src/mcts/worker-entry.ts` |
| QuAIto main | `QuAIto/src/mcts/coordinator-service.ts`, `serialize-state.ts`, `integration.test.ts` (`appPlayerToMcts`) |
| arena | `arena/src/agent-mcts.ts` (`quartoEngine`, `quartoBasicSearch`, … from mcts dist) — left on mcts until **B** |
| mcts tests | `src/games/quarto/*.test.ts`, `src/worker/message-handler.test.ts` |

Keep in mcts: `src/games/tic-tac-toe/**`, `worker-entry.ts` (TTT-only demo worker).

### A.2 Copy Quarto into QuAIto (do not delete mcts yet)

- [ ] Copy `mcts/src/games/quarto/` → `QuAIto/src/mcts-game/` (all `.ts` including tests)
- [ ] Keep mcts copy until QuAIto works; dual copies are temporary

Source files to copy (19):

```text
board.ts  coordinator-adapter.ts  coordinator.test.ts  engine.ts
fixtures.ts  index.ts  mcts.test.ts  move.ts  p-win.test.ts  p-win.ts
perf.test.ts  piece.ts  playout-policy.ts  register.ts  rules.test.ts
rules.ts  search-functions.ts  state.ts  tree-policy.ts
```

### A.3 Rewire QuAIto `mcts-game` imports

Replace relative mcts internals with the public package.

**Type-only (adapter source):**

| Old | New |
|-----|-----|
| `../../contracts/game-engine` | `import type { GameEngine } from '@smart-games/mcts'` |
| `../../contracts/search-functions` | `import type { SearchFunctions, RolloutMovePick } from '@smart-games/mcts'` |
| `../../contracts/game-state`, `move`, `player`, `board`, `writable`, `coordinator`, `search-profile` | `@smart-games/mcts` types |
| `../../worker/registry` | `import type { GameRegistry } from '@smart-games/mcts'` |

QuAIto uses `verbatimModuleSyntax`: use `import type` wherever the symbol is types-only.

**Value imports in tests only:**

| Old | New |
|-----|-----|
| `../../mcts` (`MCTSEngine`, `SearchParameters`) | `@smart-games/mcts` |
| `../../contracts/stop-signal` (`neverStop`) | `@smart-games/mcts` |
| `../../mcts/prng` | `@smart-games/mcts` |
| `../../coordinator/...`, `../../worker` | `@smart-games/mcts` |

- [ ] Confirm no adapter `.ts` (non-test) value-imports `MCTSEngine`
- [ ] `register.ts` takes `GameRegistry` and calls `registry.register(...)` — type-only import of `GameRegistry` is enough

### A.4 Export the game module from QuAIto

- [ ] Keep/adjust `QuAIto/src/mcts-game/index.ts` barrel. Must export at least what arena and QuAIto wiring need:

```text
quartoEngine, QuartoEngine, QUARTO_GAME_ID
quartoBasicSearch, quartoUniformSearch
quartoCoordinatorAdapter, registerQuarto
QUARTO_POSITIONS, deserializeQuartoState, createQuartoState
appPlayerToMcts, mctsPlayerToApp, opponentAppPlayer
```

- [ ] Add to `QuAIto/package.json`:

```json
"exports": {
  "./mcts-game": "./src/mcts-game/index.ts"
}
```

(QuAIto has no `exports` field today; add one. Arena will import this path via `tsx` in **B**.)

- [ ] `tsconfig.app.json` already `"include": ["src"]` — `mcts-game` is covered. Tests stay excluded there; Vitest still picks up `*.test.ts`.

### A.5 Point QuAIto app wiring at local adapters

- [ ] `src/mcts/worker-entry.ts`: `registerQuarto` from `../mcts-game`. Keep `GameRegistry`, `handleWorkerMessage`, `postReady` from `@smart-games/mcts/worker-host`.
- [ ] `src/mcts/coordinator-service.ts`: `registerQuarto` + `quartoCoordinatorAdapter` from `../mcts-game`; `MCTSSearchCoordinator` still from `@smart-games/mcts`.
- [ ] `src/mcts/serialize-state.ts` and `integration.test.ts`: `appPlayerToMcts` from `../mcts-game`.

Verify:

```bash
cd QuAIto && npm test && npx tsc -b --noEmit
```

Worker: `npm run dev` and play one MCTS move (Vite bundles `worker-entry` + `mcts-game` automatically).

### A.6 Move tests fully onto QuAIto

After QuAIto tests pass on the copy:

- [ ] QuAIto Vitest runs `src/mcts-game/*.test.ts` (rules, p-win, mcts, coordinator, perf)
- [ ] If Vitest config ignores a folder, include `src/mcts-game`
- [ ] Perf test is slow; keep it as-is unless it times out in QuAIto CI

### A.7 Strip Quarto from the mcts package

Only after A.5–A.6 are green.

- [ ] Delete `mcts/src/games/quarto/`
- [ ] `mcts/src/games/index.ts`: export tic-tac-toe only
- [ ] `mcts/src/worker-host.ts`: remove `registerQuarto` re-export
- [ ] `mcts/worker-host.d.ts`: remove `registerQuarto`
- [ ] `mcts/src/worker/message-handler.test.ts`: use `registerTicTacToe` + TTT fixtures (or drop Quarto-only cases)
- [ ] Grep mcts + QuAIto + arena for `registerQuarto`, `quartoEngine`, `games/quarto` — should only remain in QuAIto `mcts-game` and (until **B**) arena’s old mcts-dist loader

```bash
cd mcts && npm run test:run && npm run typecheck && npm run build
```

QuAIto must still resolve `@smart-games/mcts` after rebuild (`file:../mcts`).

**A done when:** SPA MCTS works from local `mcts-game`; mcts package no longer exports Quarto.

---

## B — Arena: shared game, per-agent engine

Today [`arena/src/agent-mcts.ts`](../arena/src/agent-mcts.ts) takes `quartoEngine` / search functions / deserialize from the **same** mcts `dist` as `MCTSEngine`. Split that after **A** has published `quarto/mcts-game`.

### B.1 Game loader

- [ ] Add `arena/src/load-game.ts` (or extend load-package): resolve `config.gamePackagePath` (e.g. `../QuAIto`) and import `quarto/mcts-game` (or `<root>/src/mcts-game/index.ts`)
- [ ] Fail with a months-later message if the path is missing (absolute `cd` + “QuAIto mcts-game not found”)
- [ ] Do **not** apply mcts `src/` vs `dist/` stale check to QuAIto; arena reads TS via `tsx`

### B.2 Agent factory

- [ ] `createMctsAgent(loadedMcts, sharedGame, options)`:
  - `MCTSEngine`, `SearchParameters`, `neverStop` from **that agent’s** mcts module
  - `quartoEngine`, heuristic map, `deserializeQuartoState`, `quartoCoordinatorAdapter`, `QUARTO_POSITIONS` from **sharedGame**
- [ ] `buildQuartoGameApi` uses `sharedGame` only so both seats play the same rules

### B.3 CLI / config

- [ ] `SuiteConfig.gamePackagePath: string` (required for `gameId: "quarto"`)
- [ ] Load game **once** in `cli.ts` before building agents
- [ ] Add to `configs/quarto-smoke.json` and `configs/quarto-promote.json`:

```json
"gamePackagePath": "../QuAIto"
```

### B.4 Provenance

- [ ] Record QuAIto git SHA on the suite report (same clean/dirty rule as workspace mcts: porcelain empty → HEAD, else `git=dirty (sha omitted)`)
- [ ] Stop comparing `HEAD:src/games` to library `gamesSourceFingerprint` (that described mcts-bundled games)
- [ ] Print something like `Game: quarto  git=…` next to candidate/baseline engine SHAs

### B.5 publish:arena

- [ ] Keep copying mcts `dist/` + `package.json` into `arena/library/<id>/`
- [ ] Stop requiring `git rev-parse HEAD:src/games` (tree will be gone). Drop the field, or set it null / omit it
- [ ] Existing library folders remain usable as engine snapshots; ignore their Quarto exports

Verify:

```bash
cd arena && npm run typecheck
npm run arena:smoke
```

Promote is optional at review time (long). Smoke with empty baselines is self-play of **two engines + one game**.

**B done when:** smoke summary shows engine SHA(s) and QuAIto game SHA; both agents share one adapter.

---

## C — Docs and Cursor rules

Update after A+B so the docs match the code.

- [ ] [`specification.md`](./specification.md): adapters live in the **game app**; per-app worker registers local games; core still must not import a specific production game. Tic-tac-toe may stay in-tree as the toy game.
- [ ] [`STRENGTH-TEST.md`](./STRENGTH-TEST.md): arena loads shared game from the game repo; library entries are engine-only; fingerprint is game-repo SHA, not `src/games`
- [ ] [`arena/IMPLEMENTATION.md`](../arena/IMPLEMENTATION.md) and [`arena/README.md`](../arena/README.md): `gamePackagePath`, rebuild mcts vs edit-QuAIto (no extra game build for arena)
- [ ] [`mcts/.cursor/rules/mcts-project.mdc`](./.cursor/rules/mcts-project.mdc): Quarto adapters live in QuAIto `src/mcts-game/`, not `src/games/quarto/`
- [ ] [`mcts/.cursor/rules/mcts-layer-boundaries.mdc`](./.cursor/rules/mcts-layer-boundaries.mdc): `src/worker/` must not import `src/games/` except tic-tac-toe if the demo worker still does; production games are not in this package. `src/games/<name>/` row becomes “toy games only”
- [ ] [`QuAIto/.cursor/rules/quaito-ai.mdc`](../QuAIto/.cursor/rules/quaito-ai.mdc): globs include `src/mcts-game/**`; MCTS adapters are owned here
- [ ] This file: mark D/A/B/C done or delete when the refactor ships

**C done when:** spec, strength-test, arena README, and Cursor rules all say game adapters live in the game repo.

---

## End-to-end acceptance (after D, A, B, and C)

- [ ] `cd mcts && npm run test:run && npm run build`
- [ ] `cd QuAIto && npm test` and one MCTS move in the SPA
- [ ] `cd arena && npm run arena:smoke` — summary shows engine SHA(s) and QuAIto game SHA
- [ ] Edit a comment in `QuAIto/src/mcts-game/` and re-run smoke without rebuilding mcts — behavior can change (game is source). Edit `mcts/src` without `npm run build` — existing stale-dist error still fires
- [ ] Baseline vs workspace: both agents use the same QuAIto adapter; only `MCTSEngine` differs

---

## Later (not this refactor)

- Second game repo: copy `src/mcts-game/` + `src/mcts/worker-entry.ts` pattern; arena `gameId` + `gamePackagePath` point at that repo
- Unify QuAIto UI rules (`gameUtils.ts`) with `mcts-game` so there is one Quarto implementation
- Compact bitboard state (still game-owned once this move is done)
- Parallel workers: coordinator spawns N workers; each bundle still includes this game’s adapter; no shared tree
