import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SandboxBashExecutor } from '@deepseek-ai/dsh-bash-sandbox'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import { SandboxPolicyService } from '@deepseek-ai/dsh-sandbox-policy'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import type { ShellExecSpec, ShellExecution, ShellRunResult } from '@deepseek-ai/dsh-shell'
import { SandboxUnavailableError } from '@deepseek-ai/dsh-sandbox'
import { ContainerSandboxProvider } from '../src/index.ts'

const IMAGE = 'debian:bookworm-slim'

function daemonAvailable(): boolean {
  return spawnSync('docker', ['version', '--format', '{{.Server.Version}}'], { stdio: 'ignore', timeout: 5_000 }).status === 0
}

async function run(x: { execute(spec: ShellExecSpec): Promise<ShellExecution> }, spec: ShellExecSpec): Promise<ShellRunResult> {
  return (await x.execute(spec)).result()
}

let ctx: Context | undefined
const dirs: string[] = []

afterEach(async () => {
  await ctx?.fiber.dispose()
  ctx = undefined
  await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-container-e2e-'))
  dirs.push(dir)
  return dir
}

/** The real bash executor on the container provider, as the Web composition wires it. */
async function containerBash(workspace: string, mode: 'read-only' | 'workspace-write', image = IMAGE): Promise<SandboxBashExecutor> {
  ctx = new Context()
  await ctx.plugin(ContainerSandboxProvider, { image, dockerBinary: 'docker', network: 'none', probeTimeoutMs: 5_000 })
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(SandboxPolicyService, { mode, workspaceRoot: workspace })
  await ctx.plugin(LocalSubprocessRuntime)
  await ctx.plugin(SandboxBashExecutor, { cwd: workspace, timeoutMs: 60_000 })
  return ctx.shell as SandboxBashExecutor
}

describe.skipIf(!daemonAvailable())('bash-sandbox on the container provider through ctx.shell', () => {
  it('runs a real command inside the container and returns its output', async () => {
    const workspace = await tempDir()
    const bash = await containerBash(workspace, 'read-only')
    const result = await run(bash, bash.resolve({ command: 'echo container-ok; uname -s' }))
    expect(result.exitCode).toBe(0)
    expect(result.stdout.text).toContain('container-ok')
    expect(result.stdout.text).toContain('Linux')
    expect(result.sandbox).toEqual({ mode: 'read-only', denied: false, enforcement: 'full' })
  })

  it('denies a write under read-only and reports it as a sandbox denial', async () => {
    const workspace = await tempDir()
    const bash = await containerBash(workspace, 'read-only')
    const result = await run(bash, bash.resolve({ command: `echo hi > ${workspace}/denied.txt` }))
    expect(result.exitCode).not.toBe(0)
    expect(result.sandbox).toEqual({ mode: 'read-only', denied: true, enforcement: 'full' })
    expect(existsSync(join(workspace, 'denied.txt'))).toBe(false)
  })

  it('lands a write inside the workspace under workspace-write', async () => {
    const workspace = await tempDir()
    const bash = await containerBash(workspace, 'workspace-write')
    const result = await run(bash, bash.resolve({ command: `printf container-write > ${workspace}/allowed.txt` }))
    expect(result.exitCode).toBe(0)
    expect(result.sandbox).toEqual({ mode: 'workspace-write', denied: false, enforcement: 'full' })
    expect(readFileSync(join(workspace, 'allowed.txt'), 'utf8')).toBe('container-write')
  })

  it('cannot read a host file outside the workspace', async () => {
    const workspace = await tempDir()
    const outside = await tempDir()
    writeFileSync(join(outside, 'secret.txt'), 'host-only')
    const bash = await containerBash(workspace, 'workspace-write')
    const result = await run(bash, bash.resolve({ command: `cat ${outside}/secret.txt` }))
    expect(result.exitCode).not.toBe(0)
    expect(result.stdout.text).not.toContain('host-only')
  })

  it('fails the call with SANDBOX_UNAVAILABLE when the image cannot be found', async () => {
    const workspace = await tempDir()
    const bash = await containerBash(workspace, 'read-only', 'dsh-missing.invalid/no-such-image:latest')
    await expect(run(bash, bash.resolve({ command: 'true' }))).rejects.toBeInstanceOf(SandboxUnavailableError)
  })
})
