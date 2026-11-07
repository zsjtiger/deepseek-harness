---
description: "容器进程沙箱提供者：把每条 bash 或 pwsh 命令放进一个新的 Docker 容器运行，并挂载工作区；面向需要使用隔离镜像、而不是同内核宿主机隔离的用户和维护者。"
kind: "package-reference"
---

# @deepseek-ai/dsh-sandbox-container

[English](README.md) | 中文

## 概述

`dsh-sandbox-container` 提供与 `dsh-sandbox-local` 相同的 `ctx.sandbox` 接口，但每条受限命令都在一个新的 Docker 容器中运行。宿主根目录不会被挂载。工作区以宿主机相同的路径绑定进容器：在 `read-only` 下只读，在 `workspace-write` 下可写。容器以宿主机用户身份运行，丢弃全部 Linux capability，并设置 `no-new-privileges`。当命令不应看到工作区以外的宿主文件时，选择它；如果一个宿主机本地进程就够用，则继续使用 `dsh-sandbox-local`。

## 目录

- [使用此包](#use-this-package)
- [实现原理](#understand-the-implementation)
- [延伸阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与待办](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用此包

在需要用容器限制命令的组合中，用此包替换 `@deepseek-ai/dsh-sandbox-local`。它注册为 `ctx.sandbox`，bash 和终端工具无需其他修改即可使用。它需要一个可访问的 Docker daemon；探测失败时，受限调用会以 `SANDBOX_UNAVAILABLE` 失败，而不会在宿主机上运行。

```yaml
- name: '@deepseek-ai/dsh-sandbox-container'
  config:
    image: debian:bookworm-slim
    network: bridge
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `image` | `debian:bookworm-slim` | 每条受限命令运行所在的镜像，必须包含 `bash`。 |
| `dockerBinary` | `docker` | Docker CLI 可执行文件。 |
| `network` | `bridge` | `bridge` 允许出站访问；`none` 禁用网络。 |
| `probeTimeoutMs` | `5000` | daemon 可达性探测的超时时间（毫秒）。 |

镜像在首次使用时由 Docker 拉取。无法拉取的镜像会让调用以运行器失败结束，而不是策略拒绝。

<a id="understand-the-implementation"></a>
## 实现原理

<details>
<summary>实现细节 — 点击展开</summary>

`confine()` 用 `docker version` 探测一次 daemon 并缓存成功结果；探测失败不缓存，下次调用会重试。随后返回 `docker run --rm -i`，附带 `--cap-drop ALL`、`--security-opt no-new-privileges`、私有的 `/tmp` tmpfs、设为工作区的 `--workdir`，以及一个以宿主机路径绑定的工作区挂载。在 `workspace-write` 下，每个额外的可写根目录都以宿主机路径绑定为可写；符号链接、不存在的路径和非目录条目会在容器启动前被拒绝。镜像和调用方的 argv 跟在选项之后。

拒绝的特征文本是 `read-only file system` 和 `permission denied`，即只读绑定挂载产生的错误文字。运行器失败是 `docker run` 自身的错误（退出码 125），例如 daemon 不可达或镜像缺失，因此永远不会被报告为命令被拒绝。

宿主用户通过 `--user uid:gid` 传入，使写入工作区的文件保持宿主机的属主。宿主机没有 POSIX 用户 ID 时，容器以镜像的默认用户运行。

| 文件 | 作用 |
|---|---|
| [`src/index.ts`](src/index.ts) | Provider 类、daemon 探测、`containerRunArgs` 的挂载和加固策略 |

</details>

-----

<a id="further-exploration"></a>
## 延伸阅读

- [`dsh-sandbox`](../sandbox/README.zh.md)：确认约束和 `SANDBOX_UNAVAILABLE` 错误。
- [`dsh-sandbox-local`](../sandbox-local/README.zh.md)：Linux、macOS、Windows 上的同内核宿主机隔离。
- [`dsh-sandbox-policy`](../sandbox-policy/README.zh.md)：文件效果模式如何按会话选择。

<a id="model-experience"></a>
## 模型体验

间接地，通过 [`dsh-bash-sandbox`](../../shell/bash-sandbox/README.zh.md) 和 [`dsh-tool-bash`](../../shell/tool-bash/README.zh.md) 呈现此提供者的隔离和拒绝事实。[`dsh-sandbox`](../sandbox/README.zh.md) 接口负责 `SANDBOX_UNAVAILABLE` 的文本；此提供者负责 docker argv，容器镜像和挂载布局不进入模型上下文。

#### KV 缓存影响

没有直接失效；如果请求前缀需要变化，由所列的消费者负责。

## 已知限制与待办

<a id="known-limitations-and-deferred-work"></a>

这些限制说明在什么情况下此提供者不适合，或需要特别的运维注意。它们是当前包的约束，不是平台比较，也不是任务清单。

- **工作目录固定为工作区根** —— `confine()` 只接收 argv 和策略，不接收调用方的当前目录，因此每条受限命令都从容器内的工作区根开始。依赖其他起始目录的命令需要显式 `cd`。
- **只有工作区可见** —— 工作区和额外可写根目录之外的路径在容器中不存在，读取工作区外宿主文件的工具会失败。
- **工具必须存在于镜像中** —— 镜像提供工具链。命令需要的程序如果镜像里没有，会在容器内失败。
- **文件工具不在容器中执行** —— 只有 bash 和终端执行经过 `confine()`。文件工具保留宿主机侧的策略检查。
- **`bridge` 网络不是出口策略** —— 它允许宿主机允许的任何出站连接。使用 `network: none` 可禁用网络。
- **不管理镜像** —— 此提供者不构建、不按摘要固定、也不清理镜像。
- **共享内核** —— 容器与宿主机共享内核，此提供者无法约束内核漏洞；需要更强边界时应使用 microVM。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>面向维护者的工作上下文 — 点击展开</summary>

此开发备注是面向维护者的工作上下文：尚未定论的方向和待定问题。它明确不具权威性——已发布的行为、限制和已接受的理由见上面的章节、包代码以及链接的 Agent Notes。

待定问题：是否应让工作目录通过隔离契约传递，使命令从调用方的目录开始运行。

</details>
