#!/bin/bash
# Loop Detection Hook
# Tracks edit count per file to detect doom loops.
# Hook type: PostToolUse:Edit
# Exit codes: 0 = pass, 1 = warn (continue), 2 = block
#
# Currently: warn at 7, block at 10.
#
# Counts are kept per session and per agent (session_id + agent_id from the hook input), so parallel subagents and
# later sessions do not inherit each other's edits. Files that many agents append to by design (the i18n message
# catalogues) are not counted. Messages go to stderr: that is the stream Claude sees when the hook blocks.

INPUT=$(cat)

# Extract a string field from the JSON input (POSIX-compatible, no grep -P, no jq dependency)
json_field() {
  echo "$INPUT" | sed -n "s/.*\"$1\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" | head -1
}

FILE_PATH=$(json_field file_path)

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Append-only shared catalogues: every frontend area adds its keys here, many edits are expected.
case "$FILE_PATH" in
  */frontend/src/messages/*.json) exit 0 ;;
esac

SESSION_ID=$(json_field session_id)
AGENT_ID=$(json_field agent_id)

# Use a temp directory for tracking edit counts, one subdirectory per session and agent
TRACK_DIR="/tmp/claude-loop-detection/${SESSION_ID:-no-session}/${AGENT_ID:-main}"
mkdir -p "$TRACK_DIR"

# Create a safe filename from the path (portable: md5sum on Linux, md5 on macOS)
if command -v md5sum > /dev/null 2>&1; then
  SAFE_NAME=$(echo "$FILE_PATH" | md5sum | cut -d' ' -f1)
elif command -v md5 > /dev/null 2>&1; then
  SAFE_NAME=$(echo "$FILE_PATH" | md5 -q)
else
  SAFE_NAME=$(echo "$FILE_PATH" | cksum | cut -d' ' -f1)
fi
TRACK_FILE="$TRACK_DIR/$SAFE_NAME"

# Increment counter
if [ -f "$TRACK_FILE" ]; then
  COUNT=$(cat "$TRACK_FILE")
  COUNT=$((COUNT + 1))
else
  COUNT=1
fi

echo "$COUNT" > "$TRACK_FILE"

# Check thresholds
if [ "$COUNT" -ge 10 ]; then
  {
    echo "🚫 BLOCKED: File '$FILE_PATH' edited $COUNT times by this agent in this session."
    echo "   This looks like a doom loop. Consider:"
    echo "   - /debugger to investigate the root cause"
    echo "   - Reassessing your approach"
  } >&2
  exit 2
elif [ "$COUNT" -ge 7 ]; then
  {
    echo "⚠️  WARNING: File '$FILE_PATH' edited $COUNT times by this agent in this session."
    echo "   If you're stuck in a loop, consider using /debugger."
  } >&2
  exit 1
fi

exit 0
