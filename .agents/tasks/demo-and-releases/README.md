# The demo and the packages, on GitHub

## Goal

Anyone can try the studio with nothing installed, and install its command line, its engine and the page from a
release. Asked for on 2026-11-25: a demo, installable packages, published on GitHub Pages.

## What was there

- The repository is on GitHub, public, at `linked-archi/metamodel-studio`. SD-11 moves it to GitLab, but that
  project does not exist yet, and nothing serves the page: GitHub Pages, `app.linked.archi/metamodel-studio/` and
  the GitLab project all answered 404 on 2026-11-25.
- An earlier `pages.yml` (commit 79feb24) failed on its first run because Pages was never enabled. SD-11 then
  removed `.github/`.
- `package.json` is private, with the `la-studio` command and no list of files, so a package would have carried the
  tests, the fixtures and `.agents/`.

## Decisions

In `../../specs/studio/design.md`, SD-19, which changes SD-11's line on GitHub:

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

**2026-11-25: done, uncommitted, for review.** The checklist is in `../../specs/studio/tasks.md`, *The demo and
the releases*.

- `npm test` 43 (7 of them `tests/package.test.js`), the Python tests 13, `npm run test:kernel` 31 and
  `npm run test:ui` 18 pass.
- The package was installed from its address over HTTP with npm 11: globally, in a project and with `npx`.
- The release's and the demo's shell steps were rehearsed under bash. The demo built for a release carries the
  release's two files byte for byte. A build by hand is marked with its commit.
- The built site, served under `/metamodel-studio/` as Pages serves it, logs no error in light or dark. A link to
  ArchiMate 4.0 opens it and a reload keeps it.
- The workflows are valid against GitHub's workflow schema. They have not run on GitHub yet.

## To continue

1. Once, on GitHub: *Settings › Pages › Source: GitHub Actions*; then *Settings › Environments › github-pages ›
   Deployment branches and tags*, a tag rule `v*`, since a release deploys the demo from its tag.
2. The first release: `git tag v0.1.0 && git push origin v0.1.0`. Or run *Demo site* by hand from the Actions tab
   for a development build of `main`.
3. Open questions: whether the move to GitLab still stands (README's links to it and to app.linked.archi do not
   resolve yet), and the engine package's name and registry (A2).
