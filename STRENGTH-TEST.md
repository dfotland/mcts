# AI Strength Test Framework — Specification

**Status:** Draft for review  
**Scope (v1):** Compare **MCTS package versions** with the **game held constant by convention**  
**Related:** [specification.md](./specification.md) (core MCTS), [TODO.md](./TODO.md)

## 1. Purpose

Provide an **automated arena** (sibling repo) that plays full games between agents backed by **different builds of `@smart-games/mcts`**, so we can answer:

> Does candidate MCTS version **C** win often enough against a **collection of older MCTS versions** (and do those baselines still rank sensibly against each other)?

This is **strength regression / promotion testing for the MCTS library**, not unit tests, not iteration/sec profiling, and **not** (in v1) a harness for iterating game heuristics.

### Goals

- Headless matches for games already hosted inside the mcts repo (`quarto`, `tic-tac-toe`, …).
- Compare a **candidate** (usually `games/mcts` workspace) to a **library of built MCTS artifacts** kept inside the arena.
- Optionally run **baseline vs baseline** for ladder sanity.
- Reproducible results from a master seed and fixed search budgets.
- Machine-readable report (JSON) plus a short human summary.

### Non-goals (v1)

- Testing **game heuristic / rules changes** as a first-class mode (deferred; may later require moving game code out of `mcts` — **do not do that now**).
- Extracting `src/games/**` from the mcts repo.
- Keeping full MCTS git checkouts as baselines (only **build artifacts** are stored).
- UI / browser workers (arena runs **in-process** on Node).
- QuAIto `easy`–`brutal` heuristic ladder as arena agents.
- Absolute Elo calibration, neural nets, opening books.
- Automatic git bisect.

---

## 2. Repository layout

Arena is a **sibling** of `mcts`, not a package inside each MCTS tag:

```text
games/
├── arena/                      # THIS framework (runner, configs, reports)
│   ├── library/                # built MCTS artifacts (baseline library)
│   │   ├── mcts@2026-08-14/
│   │   │   ├── manifest.json
│   │   │   ├── package.json
│   │   │   └── dist/
│   │   └── mcts@2026-08-01/
│   │       └── …
│   ├── configs/
│   └── src/
├── mcts/                       # candidate (workspace) — full repo to develop & build
├── QuAIto/                     # not used by v1 arena
└── common-SPA/                 # not used by v1 arena
```

**Why sibling:** the orchestrator must load **several MCTS builds at once**. If the arena lived inside `mcts`, checking out an old tag would move the runner with it.

**Candidate vs library:** the workspace `mcts/` repo is only required to **develop and produce** builds. Baselines in `arena/library/` are **installable build trees** (see §6) — no `.git`, no `src/`, no `node_modules` required at play time.

This specification file may remain in `mcts/` for discovery until the arena repo exists; implementation code and the artifact library live in `games/arena/`.

---

## 3. v1 mode only: MCTS versions, game constant

### 3.1 What varies

| Role | What it is |
|------|------------|
| **Candidate** | Current `games/mcts` working tree (**built** `dist/`; arena may resolve via `../mcts`) |
| **Baseline** | An entry under `arena/library/<id>/` — packaged build artifacts from a known git sha |

Each agent is wired to **one built `@smart-games/mcts` package** (core search **and** that build’s bundled game adapters from `dist/`). We do **not** mix engine from version A with game modules from version B in v1.

### 3.2 What “game constant” means in v1

Game code stays inside the mcts repo (**no extraction**). Constancy is a **process rule**:

- Only **ingest** baselines from commits where **`src/games/**` is unchanged** relative to the intended game pin (usually the candidate at ingest time), **or** explicitly document an exception in `manifest.json`.
- Arena configs are for **MCTS search / engine promotions**, not for evaluating game-logic edits.
- At ingest time, record `gamesSourceFingerprint` (e.g. git tree hash of `src/games` or `git rev-parse` of that tree) in the manifest. At suite run, compare candidate fingerprint to each baseline’s recorded fingerprint and **warn** on mismatch.

If fingerprints differ, the suite may still run but the report must **warn** that game sources differ — results are not a pure MCTS comparison.

### 3.3 Deferred mode (do not design further now)

A future mode for **game heuristic changes** (fixed MCTS, varying game) is out of scope. Deciding whether to move game code out of `mcts` is postponed until that mode is needed.

---

## 4. High-level design

```text
┌─────────────────────────────────────────────────────────────────┐
│                    games/arena (CLI / Node)                       │
│  config → schedule matches → play games → aggregate → report     │
└─────────────┬───────────────────────────────┬───────────────────┘
              │                               │
              ▼                               ▼
     ┌────────────────┐              ┌────────────────────┐
     │ Agent registry │              │ Match loop         │
     │ workspace mcts │              │ apply / terminal / │
     │ + library/*    │              │ turn-complete      │
     └────────┬───────┘              └─────────▲──────────┘
              │                                │
              ▼                                │
     ┌────────────────┐                        │
     │ Import from    │  choose() + game API   │
     │ packagePath    │  from that build ──────┘
     │ (dist exports) │
     └────────────────┘
```

**v1 execution:** one Node process, `concurrency: 1` by default, **no Web Workers**. Each `choose` runs in-process `MCTSEngine.search` from the agent’s build.

Production apps (e.g. QuAIto) still use workers + coordinator; the arena measures **policy quality under a fixed iteration budget**.

---

## 5. Core concepts

### 5.1 Agent

| Field | Meaning |
|-------|---------|
| `id` | Stable string, e.g. `mcts@workspace`, `mcts@2026-08-14` |
| `packagePath` | Path to a built package root (`package.json` + `dist/`) |
| `gameId` | `quarto` \| `tic-tac-toe` \| … |
| `budget` | Iteration / heuristic settings (§7) |
| `choose(state, ctx) → move` | One **atomic** move per call |

**Multi-phase (Quarto):** arena calls `choose` once per ply and loops until `isTurnComplete` / terminal (same idea as the coordinator ply loop).

### 5.2 Loading an agent from a package path

From `packagePath`:

1. Resolve that package’s `exports` → **`dist/`** (required for library entries; workspace candidate should also be built).
2. Obtain `GameEngine`, `SearchFunctions` for `gameId` + `budget.heuristicId`, and `MCTSEngine`.
3. On `choose`: clone `SearchParameters` from budget, assign a seed from the match RNG, `search`, return `bestMove.key` (apply via **that same build’s** APIs).

**Candidate** = `packagePath: ../mcts` (workspace, after `npm run build`).  
**Baseline** = `packagePath: ./library/mcts@2026-08-14` (artifact only).

`@smart-games/mcts` has **no runtime npm dependencies**; a library entry does not need `node_modules` to load in Node, only `package.json` + `dist/` (+ `worker-host.d.ts` if that export is used).

### 5.3 Match loop and game API

```ts
interface ArenaGameApi {
  readonly gameId: string;
  createInitialState(openingId?: string): SerializedGameState;
  getCurrentPlayer(state: SerializedGameState): PlayerId;
  getCurrentPhase(state: SerializedGameState): PhaseId;
  applyMove(state: SerializedGameState, move: SerializedMove): SerializedGameState;
  isTerminal(state: SerializedGameState): boolean;
  isTurnComplete(before: SerializedGameState, after: SerializedGameState): boolean;
  score(state: SerializedGameState): { winner: PlayerId | null };
}
```

**applyMove / score** for moves from an agent use **that agent’s build**. Serialized state must remain compatible across agents in the suite.

**v1 compatibility rule:** candidate and baselines must share a compatible serialized state / move schema (ensured when game fingerprints match). Schema divergence → exit `2`.

### 5.4 Match / series / suite

- **Match:** one game, A as P0 / B as P1, opening + match seed; seat-swap across the series.
- **Series:** N matches for one pair.
- **Suite modes:** `candidate-vs-all` (default), `round-robin`, `pairwise`.

Guardrails: `maxPlies` → error (not a draw); optional `matchTimeoutMs`.

---

## 6. MCTS artifact library (inside arena)

### 6.1 What a library entry is

A **baseline** is a **built package snapshot**, not a git worktree:

```text
arena/library/mcts@2026-08-14/
  manifest.json      # identity + provenance (see below)
  package.json       # name, type, exports (same shape as mcts package)
  dist/              # build output from that moment
  worker-host.d.ts   # only if required by exports
```

Not included: `.git/`, `src/`, `node_modules/`, tests, lockfile.

`manifest.json` fields (written by the publish script):

| Field | Source |
|-------|--------|
| `id` | CLI arg or default from date / short sha |
| `gitSha` | `git rev-parse HEAD` |
| `gitShaShort` | `git rev-parse --short HEAD` |
| `gitCommitMessage` | `git log -1 --pretty=%s` (subject); optional `gitCommitBody` |
| `gitCommitAuthor` | `git log -1 --pretty=%an` |
| `gitCommitDate` | `git log -1 --pretty=%cI` |
| `gamesSourceFingerprint` | fingerprint of `src/games` at publish time (e.g. `git rev-parse HEAD:src/games` or tree hash) |
| `dirty` | `true` if working tree had uncommitted changes when published (warn; prefer clean) |
| `packageVersion` | from mcts `package.json` |
| `createdAt` | ISO timestamp of publish |
| `notes` | optional `--notes` |

Example:

```json
{
  "id": "mcts@2026-08-14",
  "gitSha": "abc123def456",
  "gitShaShort": "abc123d",
  "gitCommitMessage": "Speed up Quarto lethal mask and place-win lookup",
  "gitCommitAuthor": "David",
  "gitCommitDate": "2026-08-14T18:00:00-07:00",
  "gamesSourceFingerprint": "def456aaa",
  "dirty": false,
  "packageVersion": "0.1.0",
  "createdAt": "2026-08-14T19:05:00-07:00",
  "notes": "Post place-win + tree expansion"
}
```

### 6.2 Publish from the mcts repo (primary workflow)

The **mcts** package owns a script that builds the current tree and copies artifacts into the sibling arena library. That freezes a version so you can **keep coding in `mcts/` while the arena runs** against the copy.

**Script location:** `mcts/scripts/publish-to-arena.mjs` (or `.ts`), npm script:

```bash
# from games/mcts
npm run publish:arena
npm run publish:arena -- --id mcts@2026-08-14 --notes "after lethal-mask speedup"
```

**Default arena root:** `../arena` (override with `--arena ../arena` or `ARENA_ROOT`).

**Steps the script performs:**

1. Resolve git metadata (sha, short sha, subject, author, date) and `gamesSourceFingerprint`.
2. Detect dirty working tree; **warn** and continue only with `--allow-dirty` (default: fail if dirty so the library matches a real commit).
3. `npm run build` in mcts.
4. Create `arena/library/<id>/` (fail if exists unless `--force`).
5. Copy `package.json`, `dist/`, and any export-required root files (e.g. `worker-host.d.ts`).
6. Write `manifest.json` with all provenance fields above.
7. Print the library path and a one-line summary (`id`, short sha, commit subject).

**Id default:** if `--id` omitted, use `mcts@<YYYY-MM-DD>-<shortSha>` (or similar) so repeated publishes do not collide.

**Operator flow when you like a version:**

```text
1. (optional) commit your mcts work
2. cd mcts && npm run publish:arena -- --id mcts@my-label
3. point / run arena suite using that library id as baseline or as a fixed “under test” build
4. continue editing mcts — workspace changes do not affect the library copy
```

The arena may still offer `library:add --from …` as a thin wrapper; **v1 preferred entry point is `npm run publish:arena` from mcts.**

### 6.3 Compatibility

Missing library entry, incomplete `dist/`, or failed import → suite exit `2` (do not skip silently).

---

## 7. Search budget fairness

```ts
interface MctsAgentBudget {
  maxIterations: number;
  maxRolloutPlies?: number;
  explorationConstant?: number;
  movePriorWeight?: number;
  progressiveBiasWeight?: number;
  heuristicId: string;
  // no wall-clock stop in arena v1 — iteration ceiling only
}
```

- Same budget for candidate and baselines in a promotion suite unless labeled `unequal-budget`.
- Report prints budget per agent.
- Do **not** enable `profileSearch` during arena games.

---

## 8. Statistics and pass criteria

### 8.1 Per-pair metrics

- `games`, `wins`, `losses`, `draws`
- **Primary:** `scoreRate` = (wins + 0.5×draws) / games  
- Also report `winRate` = wins / games  
- **Wilson 95% CI** on `scoreRate`  
- Seat-split (as P0 vs as P1)

### 8.2 Promotion gate (`candidate-vs-all`)

| Check | Default |
|-------|---------|
| Min games per baseline | 40 (20 per seat) |
| Vs each baseline | Wilson CI **lower bound** of candidate `scoreRate` ≥ **0.50** |
| Hard floor | Fail if point `scoreRate` ≤ **0.40** vs any baseline |

Exit codes: `0` pass, `1` gate fail, `2` infrastructure error.

### 8.3 Baseline vs baseline

Report only (no default gate). Useful to detect corrupted library entries.

---

## 9. Configuration & CLI

Example `arena/configs/quarto-promote.json`:

```json
{
  "gameId": "quarto",
  "openingId": "default",
  "mode": "candidate-vs-all",
  "masterSeed": 20260814,
  "gamesPerPair": 40,
  "concurrency": 1,
  "maxPlies": 200,
  "warnOnGameSourceDrift": true,
  "candidate": {
    "id": "mcts@workspace",
    "packagePath": "../mcts",
    "budget": {
      "heuristicId": "quarto-basic",
      "maxIterations": 8000,
      "maxRolloutPlies": 64
    }
  },
  "baselines": [
    {
      "id": "mcts@2026-08-14",
      "packagePath": "./library/mcts@2026-08-14",
      "budget": {
        "heuristicId": "quarto-basic",
        "maxIterations": 8000,
        "maxRolloutPlies": 64
      }
    }
  ],
  "gate": {
    "minScoreRateCiLowerBound": 0.5,
    "hardFloorScoreRate": 0.4
  }
}
```

CLI sketches:

```bash
# freeze current mcts into arena library, then keep developing
cd ../mcts && npm run publish:arena -- --id mcts@2026-08-14

# run suite (uses library copy; safe while mcts workspace changes)
cd ../arena && npm run arena -- --config configs/quarto-promote.json
```

---

## 10. Report format

### JSON

- Suite identity (config, master seed, timestamps, candidate path, baseline library ids + git shas)
- Game-fingerprint comparison / drift warning
- Per-agent budget
- Per-pair wins/losses/draws, scoreRate, CI, seat split
- Gate pass/fail
- Errors (illegal move, timeout, load failure)

### Stdout

```text
Arena quarto  seed=20260814  games/pair=40
Game sources: OK (fingerprints match) | WARN (drift)
Candidate: mcts@workspace  (8000 iter)
vs mcts@2026-08-14:  24-10-6  scoreRate=0.675  CI95=[0.52, 0.80]  PASS
GATE: PASS
```

---

## 11. Package layout (implementation target)

```text
games/mcts/
  scripts/
    publish-to-arena.mjs       # build + copy → ../arena/library/<id>
  package.json                 # "publish:arena": "node scripts/publish-to-arena.mjs"
  STRENGTH-TEST.md             # this spec (until moved)

games/arena/
  package.json
  README.md
  library/                     # built MCTS artifact library
    mcts@2026-08-14/
      manifest.json
      package.json
      dist/
  configs/
    quarto-smoke.json
    quarto-promote.json
  src/
    types.ts
    agent-mcts.ts              # load agent from packagePath (dist)
    match.ts
    schedule.ts
    stats.ts
    report.ts
    game-drift.ts              # fingerprint compare via manifests
    cli.ts
  results/                     # gitignored or samples only
```

---

## 12. Correctness requirements

- Same `masterSeed` + config + package builds → identical pair scores.
- Illegal move → match error, suite exit `2`.
- Respect `isTurnComplete` for multi-phase games.
- Scoring matches that build’s terminal semantics (Quarto win / draw).

---

## 13. Phased delivery

| Phase | Deliverable |
|-------|-------------|
| **P0** | Sibling `arena` package; load workspace MCTS `dist/`; play one match; print result |
| **P1** | Series + seat swap; JSON report; Wilson CI; CLI; smoke config |
| **P2** | `mcts` `publish:arena` script; library load; `candidate-vs-all` gate; fingerprint warning; one real library entry |
| **P3** | Round-robin matrix; markdown report; optional concurrency |
| **Later** | Game-heuristic test mode / possible game extraction — **out of scope until revisited** |

---

## 14. Acceptance criteria (framework)

1. Workspace MCTS vs itself → `scoreRate` ≈ 0.50 over ≥40 games.
2. `publish:arena` then play that library entry vs a second publish of the same commit → ~50%.
3. Weak budget vs strong budget (same packagePath) → weak side fails the gate.
4. Missing `library/<id>/dist` → exit `2`.
5. Same seed reproduces JSON pair scores.
6. After `publish:arena`, modifying workspace `mcts/src` without re-publishing does **not** change match results against that library id.

---

## 15. Relationship to other work

| Workstream | Role |
|------------|------|
| mcts Vitest | Correctness of engine / game adapters |
| `profileSearch` | Speed only |
| **arena (this)** | Win rate across **MCTS builds** under fixed budgets |
| Future game-heuristic mode | Separate decision; may require moving game code out of mcts |

---

## 16. Locked decisions (v1)

1. **Arena is a sibling** under `games/arena`.
2. **One mode only:** compare MCTS versions; game held constant by convention (§3.2).
3. **Do not** move or split `src/games/**` out of mcts for this work.
4. Baselines live in **`arena/library/`** as **build artifacts** (`package.json` + `dist/` + manifest) — **not** full repo checkouts.
5. **Publish path:** `mcts` script `npm run publish:arena` builds and copies into `../arena/library/`, recording sha, commit message, and related provenance — so development can continue while tests use the frozen copy.
6. Primary metric = **`scoreRate`**; gate = Wilson CI lower bound ≥ **0.50** (plus hard floor 0.40).
7. Default concurrency = **1**.
