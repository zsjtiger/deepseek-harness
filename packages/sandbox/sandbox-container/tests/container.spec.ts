import { execFile, execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, symlinkSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { Context } from '@deepseek-ai/cordis'
import { SandboxUnavailableError, SandboxUnsupportedPolicyError } from '@deepseek-ai/dsh-sandbox'
import { describe, expect, it } from 'vitest'
import { ContainerSandboxProvider, containerRunArgs } from '../src/index.ts'

const run = promisify(execFile)

const config = { image: 'debian:bookworm-slim', dockerBinary: 'docker', network: 'bridge' as const, probeTimeoutMs: 5_000 }

function daemonAvailable(): boolean {
  try {
    execFileSync('docker', ['version', '--format', '{{.Server.Version}}'], { stdio: 'ignore', timeout: 5_000 })
    return true
  } catch (_error: unknown) {
    // No reachable daemon: the end-to-end block is skipped.
    return false
  }
}

describe('containerRunArgs', () => {
  it('mounts the workspace read-only and grants no extra roots under read-only', () => {
    const args = containerRunArgs({
      workspaceRoot: '/work/project', writableRoots: ['/extra'], mode: 'read-only', network: 'none', user: '1000:1000',
    })
    expect(args).toContain('/work/project:/work/project:ro')
    expect(args).not.toContain('/extra:/extra:rw')
    expect(args).toEqual(expect.arrayContaining(['--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--network', 'none']))
    expect(args).toEqual(expect.arrayContaining(['--user', '1000:1000']))
  })

  it('mounts the workspace and extra roots writable under workspace-write', () => {
    const args = containerRunArgs({
      workspaceRoot: '/work/project', writableRoots: ['/extra'], mode: 'workspace-write', network: 'bridge',
    })
    expect(args).toContain('/work/project:/work/project:rw')
    expect(args).toContain('/extra:/extra:rw')
    expect(args).not.toContain('--user')
  })
})

describe('ContainerSandboxProvider', () => {
  it('refuses an extra writable root that is a symbolic link', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-container-'))
    const target = join(dir, 'real')
    const link = join(dir, 'link')
    mkdirSync(target)
    symlinkSync(target, link)
    try {
      const provider = new ContainerSandboxProvider(new Context(), config)
      await expect(provider.confine(['true'], {
        mode: 'workspace-write', workspaceRoot: dir, additionalWritableRoots: [link],
      })).rejects.toBeInstanceOf(SandboxUnsupportedPolicyError)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('fails closed with SANDBOX_UNAVAILABLE when the daemon cannot be reached', async () => {
    const provider = new ContainerSandboxProvider(new Context(), { ...config, dockerBinary: '/nonexistent/docker' })
    await expect(provider.confine(['true'], { mode: 'read-only', workspaceRoot: tmpdir() }))
      .rejects.toBeInstanceOf(SandboxUnavailableError)
  })
})

describe.skipIf(!daemonAvailable())('ContainerSandboxProvider with a Docker daemon', () => {
  it('denies writes under read-only and permits them under workspace-write', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-container-'))
    try {
      const provider = new ContainerSandboxProvider(new Context(), config)
      const readOnly = await provider.confine(['bash', '-c', 'echo x > blocked.txt'], { mode: 'read-only', workspaceRoot: dir })
      const denied = await run(readOnly.argv[0] as string, readOnly.argv.slice(1), { cwd: dir }).then(() => undefined, (error: { stderr?: string }) => error.stderr ?? '')
      expect(denied).toMatch(/read-only file system/i)
      expect(existsSync(join(dir, 'blocked.txt'))).toBe(false)

      const writable = await provider.confine(['bash', '-c', 'echo ok > allowed.txt'], { mode: 'workspace-write', workspaceRoot: dir })
      await run(writable.argv[0] as string, writable.argv.slice(1), { cwd: dir })
      expect(readFileSync(join(dir, 'allowed.txt'), 'utf8').trim()).toBe('ok')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
