# MCTS package — Cursor rules

| File | Purpose |
|------|---------|
| `mcts-project.mdc` | Package overview, phases, acceptance criteria (always apply) |
| `mcts-layer-boundaries.mdc` | Import rules and coordinator vs worker split |
| `mcts-contracts.mdc` | Move, GameState, GameEngine vs SearchFunctions |
| `mcts-core-algorithm.mdc` | UCT loop, node stats, backprop, termination |
| `mcts-performance.mdc` | Minimize allocations; transfer Move ownership in hot paths |
| `mcts-coordinator.mdc` | computeMove, GameCoordinatorAdapter, runSingleSearch |
| `mcts-worker-protocol.mdc` | Worker messages, registry, stop polling, worker port |
| `common-SPA.mdc` | Symlink → shared SPA + FastAPI conventions |
| `common-react-architecture.mdc` | Symlink → shared React architecture |

## Layout

```text
mcts/
├── .cursor/rules/
│   ├── mcts-project.mdc
│   ├── mcts-layer-boundaries.mdc
│   ├── mcts-contracts.mdc
│   ├── mcts-core-algorithm.mdc
│   ├── mcts-performance.mdc
│   ├── mcts-coordinator.mdc
│   ├── mcts-worker-protocol.mdc
│   ├── common-SPA.mdc              →  ../../../common-SPA/.cursor/rules/common-SPA.mdc
│   └── common-react-architecture.mdc →  ../../../common-SPA/.cursor/rules/common-react-architecture.mdc
└── specification.md
```

Shared rules live in the [`common-SPA`](../../../common-SPA/) repo (sibling under `free-games-SPA/`).

## Package scripts

From the `mcts/` root: `npm run build` (Vite lib + worker bundle), `npm test`, `npm run typecheck`, `npm run lint`.

## Local development

```text
free-games-SPA/
├── common-SPA/
└── mcts/
```

Open **`mcts/`** as the Cursor workspace when working on this package.

## Recreate symlinks

From the `mcts/` root:

```bash
ln -sf ../../../common-SPA/.cursor/rules/common-SPA.mdc .cursor/rules/common-SPA.mdc
ln -sf ../../../common-SPA/.cursor/rules/common-react-architecture.mdc .cursor/rules/common-react-architecture.mdc
```
