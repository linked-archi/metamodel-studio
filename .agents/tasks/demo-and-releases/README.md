# The demo and the packages, on GitHub

## Goal

Anyone can try the studio with nothing installed, and install its command line, its engine and the page from a
release. Asked for on 2026-11-25: a demo, installable packages, published on GitHub Pages.

## What was there

- The repository is on GitHub, public, at `linked-archi/metamodel-studio`, and nothing served the page: GitHub
  Pages answered 404 on 2026-11-25.
- An earlier `pages.yml` (commit 79feb24) failed on its first run because Pages was never enabled. A move to
  GitLab, planned on 2026-11-22, then removed `.github/`. The move was dropped on 2026-11-25 (SD-11).
- `package.json` is private, with the `la-studio` command and no list of files, so a package would have carried the
  tests, the fixtures and `.agents/`.

## Decisions

In `../../specs/studio/design.md`, SD-19; SD-11 keeps the repository on GitHub:

- **As rdf2docs publishes** (`tools/generators/rdf2docs/.github/workflows/`): `ci.yml` on every push and pull
  request, `release.yml` on a tag `v<major>.<minor>.<patch>`, `demo.yml` from each release and by hand.
- **Two packages for each release,** attached to it and on the demo site under `packages/`:
  - the npm package `linked-archi-metamodel-studio`: the `la-studio` command, the engine for Node
    (`require`), and the page, which `la-studio serve` serves;
  - the page as a zip, to open from disk or put on any static host.
- **No new names.** The package keeps the name and the command `package.json` already has. The engine's own
  package, its name and its registry stay A2's (SD-11).
- **Installed from a URL.** npm installs a release's tarball with no registry and no token.
- **The version** in `package.json` is the next release's; a release takes its tag's. Any other build is
  `<version>-dev.<commit>`, so a file name never stands for two different builds.

## Status

**2026-11-25: done; the first release is to be made again.** The checklist is in `../../specs/studio/tasks.md`,
*The demo and the releases*.

- The first run of `release.yml`, for `v0.1.0`, failed at its install check: npm read `dist/<name>.tgz` as a GitHub
  repository. The step now gives `./dist/<name>.tgz`, rehearsed exactly as written. No release was made, so the
  tag moves to the fix.
- `npm test` 43 (7 of them `tests/package.test.js`), the Python tests 13, `npm run test:kernel` 31 and
  `npm run test:ui` 18 pass.
- The package was installed from its address over HTTP with npm 11: globally, in a project and with `npx`.
- The release's and the demo's shell steps were rehearsed under bash. The demo built for a release carries the
  release's two files byte for byte. A build by hand is marked with its commit.
- The built site, served under `/metamodel-studio/` as Pages serves it, logs no error in light or dark. A link to
  ArchiMate 4.0 opens it and a reload keeps it.
- The workflows are valid against GitHub's workflow schema.

## To continue

1. Done on 2026-11-25: *Settings › Pages › Source: GitHub Actions*, and in *Settings › Environments ›
   github-pages*, a tag rule `v*`, since a release deploys the demo from its tag.
2. The first release: commit, move the tag `v0.1.0` to the fix, push `main` and the tag. Then check the release's
   two files and the demo at <https://linked-archi.github.io/metamodel-studio/>.
3. Open question: the engine package's name and registry (A2, SD-11).
