# Pascal, varpet's fork

This folder is Pascal (https://github.com/pascalorg/editor, MIT, see `LICENSE`) at the tag `@pascal-app/core@1.0.3`,
commit `ebe69be26dbf380e297a3d5db45c101cc24f49bc`: the source of the npm `@pascal-app/{core,viewer,editor,nodes,mcp}@1.0.3`
we used before. We own this copy and patch it here; every patch is listed in `PATCHES.md` so it can go upstream.

## How it is wired
- `core`, `viewer`, `editor`, `nodes`, `mcp` are pnpm workspace packages under their own names (`pnpm-workspace.yaml`);
  our packages depend on them with `workspace:*`, and root `pnpm.overrides` maps every `@pascal-app/*` range (and
  `@pascal/typescript-config`) to the workspace so no second copy comes from npm. Pascal's apps, other packages,
  tooling and bun/turbo setup are not part of our workspace.
- `editor` ships TypeScript source; Next transpiles it. `core`, `viewer`, `nodes`, `mcp` are consumed from `dist`, built by
  `scripts/build-pascal.mjs` (`tsc --build` with Pascal's TypeScript 6.0.3, then `scripts/fix-node-esm-imports.ts` on
  `core/dist` and `mcp/dist` under node, as their own build scripts do with bun). It runs on `pnpm install`
  (postinstall) and before `pnpm dev|build|test|typecheck` (typecheck also checks the editor source); it is incremental. After editing these packages' source
  while `pnpm dev` runs, run `pnpm build:pascal`.
- Built from this commit, the JS in `dist` is byte-identical to npm 1.0.3; only some `.d.ts` differ (JSX type import path).
- Pascal's root `patchedDependencies` (three@0.186.0, iwer) are for its own app; npm consumers never got them and we
  do not apply them.

## Pull upstream
```
git subtree pull --prefix vendor/pascal https://github.com/pascalorg/editor <tag-or-commit> --squash
```
Then resolve conflicts against `PATCHES.md`, run `pnpm install`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and
drop any patch upstream has taken.
