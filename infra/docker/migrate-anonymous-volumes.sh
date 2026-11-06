#!/bin/sh
# One-off copy of an older stack's anonymous volumes into the named volumes of docker-compose.yml.
# Usage: docker compose stop postgres redis rabbitmq (not `down`), then: sh infra/docker/migrate-anonymous-volumes.sh [project]
set -eu

PROJECT="${1:-${COMPOSE_PROJECT_NAME:-medcenter}}"
HELPER_IMAGE="${HELPER_IMAGE:-alpine:3.20}"

migrate_volume() {
  service="$1"
  target="$2"
  volume="$3"
  container="${PROJECT}-${service}-1"
  new="${PROJECT}_${volume}"

  if ! docker inspect "$container" >/dev/null 2>&1; then
    echo "skip ${service}: container ${container} not found"
    return 0
  fi
  if [ "$(docker inspect -f '{{.State.Running}}' "$container")" = "true" ]; then
    echo "ERROR: ${container} is running; run 'docker compose stop ${service}' first" >&2
    exit 1
  fi

  old="$(docker inspect -f "{{range .Mounts}}{{if eq .Destination \"${target}\"}}{{.Name}}{{end}}{{end}}" "$container")"
  if [ -z "$old" ]; then
    echo "skip ${service}: no volume mounted at ${target}"
    return 0
  fi
  if [ "$old" = "$new" ]; then
    echo "skip ${service}: already uses ${new}"
    return 0
  fi

  if docker volume inspect "$new" >/dev/null 2>&1; then
    if [ -n "$(docker run --rm -v "${new}:/to" "$HELPER_IMAGE" ls -A /to)" ]; then
      echo "skip ${service}: ${new} already holds data (not overwritten)"
      return 0
    fi
  else
    # The labels compose puts on its own volumes; without them compose warns the volume was not created by it.
    docker volume create \
      --label "com.docker.compose.project=${PROJECT}" \
      --label "com.docker.compose.volume=${volume}" \
      "$new" >/dev/null
  fi

  docker run --rm -v "${old}:/from:ro" -v "${new}:/to" "$HELPER_IMAGE" sh -c 'cp -a /from/. /to/'
  echo "ok ${service}: ${old} -> ${new}"
}

migrate_volume postgres /var/lib/postgresql/data pgdata
migrate_volume redis /data redisdata
migrate_volume rabbitmq /var/lib/rabbitmq rabbitmqdata
