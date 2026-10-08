# AGENTS.md — Policy Rules

These are enforceable rules. Wishes are ignored, constraints are enforced.

## Hierarchy of Sources of Truth

1. **Enforcement** (hooks, CI, linters) — automated, highest authority
2. **Policy** (this file) — MUST/MUST NOT rules
3. **Architecture** ([specs/](specs/MANIFEST.md)) — system design decisions
4. **Operations** ([skills/](.clinerules/skills/)) — how skills execute
5. **Examples** ([examples/](examples/)) — reference implementations
6. **Documentation** ([README.md](README.md)) — human reference

## File Naming

- MUST prefix output files with skill name: `{skill-name}-{purpose}.md`
- MUST use zero-padded task dirs: `TASK-001/`, `TASK-002/`
- MUST place task docs in `tasks/TASK-{N}/`, specs in `specs/`
- MUST NOT create unprefixed .md files in tasks/ or specs/ (except README.md, MANIFEST.md)

## Agent Behavior

- MUST execute only its own skill, then STOP
- MUST NOT chain to other skills automatically
- MUST output Context Summary + Next Steps
- MUST NOT make workflow decisions for the user

## Code Quality

- MUST run tests before claiming completion (if test tooling exists)
- MUST run lint before claiming completion (if lint tooling exists)
- MUST NOT proceed with failing tests — fix or escalate to `/debugger`
- MUST NOT skip pre-commit hooks (--no-verify)
- MUST NOT force-push, hard-reset, or DROP TABLE without explicit user consent

## Context & Documentation

- MUST read existing code before modifying it
- MUST read MANIFEST.md before writing specs
- MUST check .task-counter before creating task dirs
- MUST NOT duplicate information across spec files — reference instead

## Security

- MUST NOT read or commit .env files or secrets/
- MUST NOT run rm -rf, sudo, or chmod 777
- MUST NOT introduce OWASP Top 10 vulnerabilities
- MUST validate at system boundaries (user input, external APIs)

## Medical Data & FHIR Standards

- Context: this project targets a **Belarusian clinic** — HL7 FHIR International (R4) is the only FHIR baseline
- MUST NOT call Belgian eHealth MCP tools: `list_belgian_igs`, `get_belgian_ig_page` (blocked by Cline hook `.clinerules/hooks/PreToolUse` + permission deny)
- MUST NOT reference Belgian terminology (NIHDI/INAMI, MyCareNet, eHealth Platform, Belgian IG profiles) in code, specs, or answers — enforced at `.clinerules/hooks/PreToolUse`
- MUST use `get_fhir_resource` / `get_fhir_page` (HL7 International spec) for all FHIR questions

## Definition of Done

- See [.clinerules/DOD.md](.clinerules/DOD.md) for tiered verification checklist
- MUST reference DOD.md before marking any task complete

## Style Invariants

- See [.clinerules/GOLDEN-PRINCIPLES.md](.clinerules/GOLDEN-PRINCIPLES.md) when available
