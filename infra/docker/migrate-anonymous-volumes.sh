#!/bin/sh
# One-off migration of the data in the ANONYMOUS volumes of an older stack into
# the NAMED volumes (pgdata, redisdata, rabbitmqdata) that docker-compose.yml now
# declares. Without it the first `docker compose up` after the change creates
# empty named volumes and the old data (users, HAPI clinical store, read-model)
# stays orphaned in the old anonymous volumes.
#
#   docker compose stop postgres redis rabbitmq      # NOT `down`: keeps the containers
#   sh infra/docker/migrate-anonymous-volumes.sh     # copies old volume -> <project>_<volume>
#   docker compose up -d --build                     # the new stack now finds the data
#
# The project name defaults to `medcenter` (the directory name); pass another one
# as the first argument or via COMPOSE_PROJECT_NAME. The script
#   - refuses to copy from a container that is still running (inconsistent copy),
#   - never overwrites a named volume that already holds data,
#   - only reads the old volume (mounted read-only) and removes nothing.
# The old anonymous volumes stay until you `docker volume rm` them yourself.
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
    # Same labels compose puts on a volume it creates itself; without them compose
    # warns that the volume "was not created by Docker Compose".
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
