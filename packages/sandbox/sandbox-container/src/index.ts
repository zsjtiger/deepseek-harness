/**
 * Container process-sandbox provider. Each confined command runs in a fresh
 * Docker container: the host root is not mounted, the workspace is bound at
 * its host path (read-only under `read-only`, writable under `workspace-write`),
 * and the container runs as the host user with all capabilities dropped.
 */
import { execFile } from 'node:child_process'
import { lstatSync } from 'node:fs'
import { promisify } from 'node:util'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import {
  SandboxProvider, SandboxUnavailableError, SandboxUnsupportedPolicyError, canonicalPath,
} from '@deepseek-ai/dsh-sandbox'
import type { ConfinedArgv, ConfinedSandboxMode, RunnerFailureRule, SandboxPolicy } from '@deepseek-ai/dsh-sandbox'

const execFileAsync = promisify(execFile)

/** Plugin config. All fields are optional; `static Config` supplies the defaults. */
export interface Config {
  /** Image every confined command runs in. It must contain `bash`. */
  readonly image: string
  /** Docker CLI executable. */
  readonly dockerBinary: string
  /** Container network: `bridge` allows outbound access, `none` disables it. */
  readonly network: 'bridge' | 'none'
  /** Timeout for the daemon reachability probe, in milliseconds. */
  readonly probeTimeoutMs: number
}

/** Stderr substrings a file write denied inside a read-only bind mount produces. */
const DENIAL_SIGNATURES: readonly string[] = ['read-only file system', 'permission denied']

/**
 * Failures of `docker run` itself: the daemon is unreachable, or the image
 * cannot be found or pulled. Docker reports these with exit status 125.
 */
const RUNNER_FAILURE_RULES: readonly RunnerFailureRule[] = [{
  allowedExitCodes: [125],
  fatalSignatures: [
    'cannot connect to the docker daemon',
    'error response from daemon',
    'unable to find image',
    'invalid reference format',
  ],
}]

/** Inputs to {@link containerRunArgs}. */
export interface ContainerRunInput {
  /** Canonical workspace root; mounted at the same path inside the container. */
  readonly workspaceRoot: string
  /** Canonical extra writable roots, mounted writable at the same paths. */
  readonly writableRoots: readonly string[]
  readonly mode: ConfinedSandboxMode
  readonly network: Config['network']
  /** `uid:gid` the container process runs as; omitted where the host has no POSIX ids. */
  readonly user?: string | undefined
}

/**
 * Build the `docker run` options that confine one command, stopping before the
 * image argument. Pure, so the mount and hardening policy is testable without a daemon.
 * @param input - canonical roots, the file-effect mode, the network mode, and the container user.
 * @returns the argv segment from `run` through the options, ready for the image and command.
 */
export function containerRunArgs(input: ContainerRunInput): string[] {
  const workspaceFlag = input.mode === 'read-only' ? 'ro' : 'rw'
  const args = [
    'run', '--rm', '-i',
    '--network', input.network,
    '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges',
    '--tmpfs', '/tmp',
    '--workdir', input.workspaceRoot,
    '-v', `${input.workspaceRoot}:${input.workspaceRoot}:${workspaceFlag}`,
  ]
  // Extra roots are granted only under workspace-write, matching the policy contract.
  if (input.mode === 'workspace-write') {
    for (const root of input.writableRoots) args.push('-v', `${root}:${root}:rw`)
  }
  if (input.user !== undefined) args.push('--user', input.user)
  return args
}

/** The `uid:gid` the container should run as, or undefined where the host has no POSIX ids. */
function hostUser(): string | undefined {
  if (process.platform === 'win32' || typeof process.getuid !== 'function') return undefined
  return `${process.getuid()}:${process.getgid?.() ?? process.getuid()}`
}

/**
 * Validate one extra writable root. Symlinked entries are refused because the
 * mount would bind the link's target, which the policy did not name.
 * @param path - the configured extra root as given.
 * @returns the canonical path.
 * @throws SandboxUnsupportedPolicyError when the entry is missing, not a directory, or a symlink.
 */
function extraWritableRoot(path: string): string {
  let entry
  try {
    entry = lstatSync(path)
  } catch (_error: unknown) {
    throw new SandboxUnsupportedPolicyError(`extra writable root "${path}" does not exist`)
  }
  if (entry.isSymbolicLink()) throw new SandboxUnsupportedPolicyError(`extra writable root "${path}" is a symbolic link`)
  if (!entry.isDirectory()) throw new SandboxUnsupportedPolicyError(`extra writable root "${path}" is not a directory`)
  return canonicalPath(path)
}

/**
 * Container process-sandbox provider. Registers as `ctx.sandbox` when this
 * package is mounted in place of `sandbox-local`.
 */
export class ContainerSandboxProvider extends SandboxProvider {
  // Inline schema call: the config catalog walks `static Config` statically.
  static Config: z<Config> = z.object({
    image: z.string().default('debian:bookworm-slim'),
    dockerBinary: z.string().default('docker'),
    network: z.union([z.const('bridge'), z.const('none')]).default('bridge'),
    probeTimeoutMs: z.natural().default(5_000),
  })

  private readonly config: Config
  /** Shared success of the daemon probe; a failed probe is not cached so the next call retries it. */
  private daemonReady: Promise<void> | undefined

  constructor(ctx: Context, config: Config) {
    super(ctx)
    this.config = config
  }

  /**
   * Wrap `argv` in a `docker run` that confines it to `policy`.
   * @param argv - the exact argv to run inside the container.
   * @param policy - the confined file-effect policy for this call.
   * @param signal - cancellation for the daemon probe.
   * @returns the docker argv to spawn, with full enforcement and the Docker denial and failure dialect.
   * @throws SandboxUnavailableError when the Docker daemon cannot be reached.
   * @throws SandboxUnsupportedPolicyError when an extra writable root is missing, a symlink, or not a directory.
   */
  async confine(argv: readonly string[], policy: SandboxPolicy, signal?: AbortSignal): Promise<ConfinedArgv> {
    signal?.throwIfAborted()
    await this.requireDaemon(policy.mode, signal)
    const writableRoots = policy.mode === 'workspace-write'
      ? (policy.additionalWritableRoots ?? []).map(extraWritableRoot)
      : []
    const runArgs = containerRunArgs({
      workspaceRoot: canonicalPath(policy.workspaceRoot),
      writableRoots,
      mode: policy.mode,
      network: this.config.network,
      user: hostUser(),
    })
    return {
      argv: [this.config.dockerBinary, ...runArgs, this.config.image, ...argv],
      enforcement: 'full',
      denialSignatures: DENIAL_SIGNATURES,
      runnerFailureRules: RUNNER_FAILURE_RULES,
    }
  }

  /**
   * Check once that the Docker daemon answers, caching success.
   * @param mode - the requested mode, reported in the failure.
   * @param signal - cancellation for the probe.
   * @returns a promise that resolves when the daemon is reachable.
   * @throws SandboxUnavailableError when the probe fails; the failure is not cached.
   */
  private requireDaemon(mode: ConfinedSandboxMode, signal?: AbortSignal): Promise<void> {
    this.daemonReady ??= execFileAsync(
      this.config.dockerBinary,
      ['version', '--format', '{{.Server.Version}}'],
      { timeout: this.config.probeTimeoutMs, signal },
    ).then(() => undefined, (error: unknown) => {
      this.daemonReady = undefined
      // A cancelled probe says nothing about the daemon, so the caller's cancellation propagates unchanged.
      if (signal?.aborted) throw error
      throw new SandboxUnavailableError(mode, error instanceof Error ? error.message.slice(0, 500) : String(error))
    })
    return this.daemonReady
  }
}

export default ContainerSandboxProvider
