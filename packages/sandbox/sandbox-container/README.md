---
description: "Container process-sandbox provider: confine each bash or pwsh command in a fresh Docker container with the workspace mounted, for users and maintainers who need an isolated image instead of same-kernel host confinement."
kind: "package-reference"
---

# @deepseek-ai/dsh-sandbox-container

English | [中文](README.zh.md)

## Summary

`dsh-sandbox-container` provides the same `ctx.sandbox` seam as `dsh-sandbox-local`, but runs each confined command in a fresh Docker container. The host root is not mounted. The workspace is bound at its host path, read-only under `read-only` and writable under `workspace-write`. The container runs as the host user with all Linux capabilities dropped and `no-new-privileges` set. Choose it when a command must not see the host filesystem beyond the workspace; `dsh-sandbox-local` remains the choice when a host-local process is enough.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount this package in place of `@deepseek-ai/dsh-sandbox-local` in a composition that should confine commands in containers. It registers as `ctx.sandbox`, so the bash and terminal tools use it without other changes. It requires a reachable Docker daemon; when the probe fails, a confined call fails with `SANDBOX_UNAVAILABLE` instead of running on the host.

```yaml
- name: '@deepseek-ai/dsh-sandbox-container'
  config:
    image: debian:bookworm-slim
    network: bridge
```

| Field | Default | Meaning |
|---|---|---|
| `image` | `debian:bookworm-slim` | Image every confined command runs in. It must contain `bash`. |
| `dockerBinary` | `docker` | Docker CLI executable. |
| `network` | `bridge` | `bridge` allows outbound access; `none` disables it. |
| `probeTimeoutMs` | `5000` | Timeout for the daemon reachability probe. |

The image is pulled by Docker on first use. A missing image that cannot be pulled fails the call with a runner failure, not a policy denial.

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

`confine()` probes the daemon once with `docker version` and caches success; a failed probe is not cached, so the next call retries. It then returns `docker run --rm -i` with `--cap-drop ALL`, `--security-opt no-new-privileges`, a private `/tmp` tmpfs, `--workdir` set to the workspace, and one bind mount for the workspace at its host path. Under `workspace-write`, each extra writable root is bound writable at its host path; symlinked, missing, and non-directory entries are refused before the container starts. The image and the caller's argv follow the options.

The denial dialect is `read-only file system` and `permission denied`, the text a read-only bind produces. Runner failures are `docker run` errors (exit 125) such as an unreachable daemon or a missing image, so they are never reported as command denials.

The host user is passed with `--user uid:gid` so files written into the workspace keep the host owner. Where the host has no POSIX ids, the container runs as the image's default user.

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Provider class, daemon probe, `containerRunArgs` mount and hardening policy |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [`dsh-sandbox`](../sandbox/README.md): the confinement contract and the `SANDBOX_UNAVAILABLE` error.
- [`dsh-sandbox-local`](../sandbox-local/README.md): same-kernel host confinement on Linux, macOS, and Windows.
- [`dsh-sandbox-policy`](../sandbox-policy/README.md): how the file-effect mode is chosen per session.

<a id="model-experience"></a>
## Model Experience

Indirectly, through [`dsh-bash-sandbox`](../../shell/bash-sandbox/README.md) and [`dsh-tool-bash`](../../shell/tool-bash/README.md), which render this provider's enforcement and denial facts. The [`dsh-sandbox`](../sandbox/README.md) seam owns the `SANDBOX_UNAVAILABLE` text; this provider owns the docker argv, and the container image and mount layout stay outside model context.

#### KV Cache effect

No direct invalidation; the named consumers own any request-prefix changes.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define when the provider is a poor fit or needs special operational care. They are current package constraints, not a general platform comparison or a task backlog.

- **Working directory is the workspace root** — `confine()` receives argv and a policy but not the caller's current directory, so every confined command starts at the workspace root inside the container. Commands that depend on another starting directory need an explicit `cd`.
- **Only the workspace is visible** — paths outside the workspace and the extra writable roots do not exist inside the container, so tools that read host files outside the workspace fail.
- **Tools must exist in the image** — the image provides the toolchain. A command that needs a program absent from the image fails inside the container.
- **Filesystem tools are not containerized** — only bash and terminal execution pass through `confine()`. File tools keep their host-side policy checks.
- **Network `bridge` is not an egress policy** — it allows any outbound connection the host allows. Use `network: none` to disable networking.
- **No image management** — the provider does not build, pin by digest, or prune images.
- **Same kernel** — containers share the host kernel. A kernel exploit is not contained by this provider; a microVM is the stronger boundary.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

This Dev Note is working context for maintainers: undecided directions and open questions. It is explicitly non-authoritative — shipped behavior, limits, and accepted rationale live in the sections above, the package code, and the linked Agent Notes.

Open question: whether the working directory should be passed through the confinement contract so commands start in the caller's directory.

</details>
