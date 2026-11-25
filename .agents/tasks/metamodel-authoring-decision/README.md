# One metamodel authoring engine (PD-16)

**2026-11-22: moved to the platform's register.** The decision is PD-16 in
`linked-archi-platform/docs/decisions.md`, gate *before F05 and W08*; accepted on 2026-11-24. The platform's
`docs/plan.md` and the workspace's specification follow it. What is left is the kernel's K02 list, below.

## Where it changed what

| Where | Change | Status |
|---|---|---|
| Platform `docs/decisions.md` | PD-16 in the register's table and as its own section | done 2026-11-22 |
| Platform `docs/plan.md`, repositories table | `metamodel-studio` added: the authoring engine and the standalone studio | done 2026-11-22 |
| Platform `docs/plan.md`, E3 | metamodel administration on the authoring engine; the platform stores, versions and serves what it generates | done 2026-11-22 |
| Platform `docs/plan.md`, tickets | prefix `A` for the studio; A1 (done), A2, A3, A4; K02 frozen from A2's calls too; F05 storing and serving, depending on A3 | done 2026-11-22 |
| Platform `docs/plan.md`, decisions and inputs | a *Metamodel authoring* row | done 2026-11-22 |
| Workspace `requirements.md`, Req 14.2–14.3 | it edits workspace-specific types and fields, tag groups, subscription roles and completeness weights as an extension of the loaded metamodel, with the authoring engine; the platform stores and versions the assets it generates | done 2026-11-22 |
| Workspace `plan.md` | W08 on the authoring engine, waiting for A3 (A4 for fields that need S01's terms); F05 as storage and serving; the `metamodel-studio` repository and the `A` tickets; README's decision table | done 2026-11-22 |
| Kernel `tasks.md`, *Queued for K02* | the calls the studio's engine lists in its A2 | to do, once the work in progress there is committed |

## The decision, as drafted

The text in the register is the reference. In short:

- the studio's project model, generator, importer and checks become one authoring engine, a TypeScript package, used
  by the studio, the workspace's Administration screens (W08) and F05;
- the kernel is its contract: what the kernel reads from a generated set must be what its author designed;
- the platform stores, versions and serves generated sets at their IRIs; it does not generate them;
- the Turtle is what is stored, and the engine imports it to edit it again;
- two kinds of project: a whole language, and an extension that pins a base metamodel and generates its additions;
- K02's frozen API covers the engine's calls.

Decided 2026-11-22, for A2: the engine is `packages/engine` in the studio's repository. Changed on 2026-11-25: the
repository stays on GitHub, and where the engine is published is open again, for A2 (`design.md`, SD-11). PD-16
still says the studio moves to GitLab; its paragraph changes with the platform's register.
