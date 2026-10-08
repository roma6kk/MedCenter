#!/bin/bash
# MCP Belgian IG Blocker Hook
# Blocks Belgian eHealth FHIR IG tools — project targets a Belarusian clinic.
# Hook type: PreToolUse (matcher: MCP tool calls)
# Exit codes: 0 = pass, 1 = warn (continue), 2 = block
#
# Blocked tools: fhir-docs__list_belgian_igs, fhir-docs__get_belgian_ig_page

INPUT=$(cat)

# Extract tool name from JSON input (POSIX-compatible, no grep -P)
TOOL_NAME=$(echo "$INPUT" | sed -n 's/.*"tool_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)

if [ -z "$TOOL_NAME" ]; then
  exit 0
fi

# BLOCKED: Belgian eHealth IG tools only — HL7 International tools stay allowed
case "$TOOL_NAME" in
  *list_belgian_igs*|*get_belgian_ig_page*)
    echo "🚫 BLOCKED: Belgian FHIR IG tool '$TOOL_NAME' is out of scope."
    echo "   Project targets a Belarusian clinic — use HL7 FHIR International only."
    echo "   Allowed FHIR tools: get_fhir_resource, get_fhir_page."
    echo "   See AGENTS.md → Medical Data & FHIR Standards."
    exit 2
    ;;
esac

exit 0