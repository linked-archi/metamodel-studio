# .agents

What the people and the agents working on the Metamodel Studio write down besides the code.

| Path | Holds |
|---|---|
| `conventions.md` | principles and code conventions, and the checklist for finishing a change |
| `specs/studio/` | the studio's specification: `requirements.md` (numbered SReq n.m), `design.md` (decisions SD-n), `plan.md` (steps A1–A4 and how they meet the workspace and platform tickets) and `tasks.md` (checklists, known limitations, change log, newest first) |
| `tasks/<name>/` | one folder per piece of work: its goal, decisions, status, to read and to continue from |

**Kiro** reads `.kiro/specs/` and `.kiro/steering/`: there, `.kiro/specs` and `.kiro/steering/project-conventions.md`
are links to `specs/` and `conventions.md` here. **Claude Code** reads `CLAUDE.md`, and other agents `AGENTS.md`,
at the repository's root; both point here.
