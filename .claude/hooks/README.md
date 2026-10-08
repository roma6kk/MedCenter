# Cline Hooks Documentation

> **Runtime:** these hooks target **Cline** (VS Code / Desktop / CLI).
> Files named after the hook event, **no extension**, executable, in this directory (`.clinerules/hooks/`).
> Protocol: JSON on stdin → JSON on stdout → exit 0:
> `{"cancel":true,"errorMessage":"..."}` blocks · `{"cancel":false,"contextModification":"..."}` injects context · `{"cancel":false}` allows.
> Must be enabled: Cline Settings → Features → **Enable Hooks**. (macOS/Linux supported; Windows not.)

## Cline-native hooks (active)

| File | Event | Purpose |
|------|-------|---------|
| `PreToolUse` | before any tool | Blocks Belgian eHealth IG MCP tools (`list_belgian_igs`, `get_belgian_ig_page`), blocks destructive bash (force-push, DROP TABLE, --no-verify...), warns on bad file naming in tasks//specs/ |
| `PostToolUse` | after file edits | Doom-loop detection: warns at 7 edits/file, flags hard at 10 |
| `TaskStart` | new task | Injects project context + AGENTS.md policy reminder |

Test manually (no Cline needed):

```bash
echo '{"preToolUse":{"toolName":"use_mcp_server","parameters":{"toolName":"list_belgian_igs"}}}' | .clinerules/hooks/PreToolUse
# → {"cancel":true,"errorMessage":"🚫 Belgian FHIR IG tools are blocked..."}
```

## Legacy Claude Code hooks (*.sh, inactive under Cline)

The `*.sh` files + `settings.json` hook entries use the **Claude Code** protocol
(matchers in settings.json, exit codes 0=pass/1=warn/2=block) and are NOT read by Cline.
They are kept for reference/Claude Code fallback only.
Note: `settings.json` references `.claude/hooks/*.sh` paths that don't exist in this repo
(the directory is `.clinerules/hooks/`) — those entries are broken even under Claude Code.
Also, `settings.json` `permissions.deny` (MCP tool deny) is Claude Code-only; under Cline the
Belgian tool block comes exclusively from the `PreToolUse` hook above.

## Legacy Claude Code return codes (*.sh only)

| Code | Meaning |
|------|---------|
| `0` | Success, continue |
| `1` | Warning, continue (logged) |
| `2` | Block operation (shows error) |

## References

- [Cline Hooks docs](https://docs.cline.bot/configurations/hooks)
- [Cline v3.36 Hooks announcement](https://cline.bot/blog/cline-v3-36-hooks)
- [Claude Code Hooks Documentation](https://docs.anthropic.com/en/docs/claude-code/hooks) (legacy *.sh only)
