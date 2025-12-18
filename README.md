# excalidraw-storage-backend

This is a reimplementation of [excalidraw-json](https://github.com/excalidraw/excalidraw-json) suitable for self hosting you own instance of Excalidraw.

It can be used with [kiliandeca/excalidraw-fork](https://gitlab.com/kiliandeca/excalidraw-fork)

[DockerHub kiliandeca/excalidraw-storage-backend](https://hub.docker.com/r/kiliandeca/excalidraw-storage-backend)

Feature:

- Storing scenes: when you export as a link
- Storing rooms: when you create a live collaboration
- Storing images: when you export or do a live collaboration of a scene with images

It use Keyv as a simple K/V store so you can use the database of your choice.

## Environment Variables

| Name            | Description                                                  | Default value    |
| --------------- | ------------------------------------------------------------ | ---------------- |
| `PORT`          | Server listening port                                        | 8080             |
| `GLOBAL_PREFIX` | API global prefix for every routes                           | `/api/v2`        |
| `STORAGE_URI`   | [Keyv](https://github.com/jaredwray/keyv) connection string, example: `redis://user:pass@localhost:6379`. Available Keyv storage adapter: redis, mongo, postgres and mysql  | `""` (in memory **non-persistent**) |
| `LOG_LEVEL`     | Log level (`debug`, `verbose`, `log`, `warn`, `error`)       | `warn`           |
| `BODY_LIMIT`    | Payload size limit for scenes or images                      | `50mb`           |

## Docker Secrets Support (`_FILE` suffix)

All environment variables support reading values from files via the `_FILE` suffix. This is useful for Docker Swarm secrets or Kubernetes secrets mounted as files.

For any environment variable `VAR_NAME`, you can instead set `VAR_NAME_FILE` to the path of a file containing the secret value.

**Example with Docker Swarm:**

```yaml
services:
  storage:
    image: excalidraw-storage-backend
    environment:
      - STORAGE_URI_FILE=/run/secrets/storage_uri
    secrets:
      - storage_uri

secrets:
  storage_uri:
    external: true
```

**Example with Kubernetes:**

```yaml
env:
  - name: STORAGE_URI_FILE
    value: /etc/secrets/storage-uri
volumeMounts:
  - name: secrets
    mountPath: /etc/secrets
    readOnly: true
```

**Priority:**
1. If `VAR_NAME_FILE` is set and the file exists, the file contents are used
2. Otherwise, `VAR_NAME` environment variable is used
3. Otherwise, the default value is used
