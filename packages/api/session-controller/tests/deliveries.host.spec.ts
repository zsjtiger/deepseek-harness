/**
 * Session Controller delivery listing: visible-Session scope, presented-file
 * payload validation, and the result and Session bounds.
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import SessionStore, { SESSION_FORMAT_VERSION } from '@deepseek-ai/dsh-session'
import type { SessionHeader, SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import { SessionQueryEngine } from '@deepseek-ai/dsh-session-query'
import { TEST_IMAGE_LIMITS } from './test-remote.ts'
import { ApiSessionList } from '../src/list.ts'
import { DELIVERY_RESULT_LIMIT } from '../src/types.ts'

const sid = (value: string): SessionId => value as SessionId

interface FakeEvent {
  readonly seq: number
  readonly type: string
  readonly surface: 'current' | 'fork'
  readonly time: number
  readonly data: unknown
}

async function baseContext(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(AgentRegistry)
  return ctx
}

/** Real query core with programmable session headers and event logs for delivery tests. */
class DeliveryQuery extends SessionQueryEngine {
  constructor(
    ctx: Context,
    private readonly headers: readonly SessionHeader[],
    private readonly events: ReadonlyMap<string, readonly FakeEvent[]>,
  ) {
    super(ctx)
  }

  override listSessions(): Promise<never[]> {
    return Promise.resolve(this.headers.map(header => ({ header }) as never))
  }

  override listEvents(sessionId: SessionId): Promise<never[]> {
    const events = this.events.get(sessionId) ?? []
    return Promise.resolve(events.map(event => ({ sessionId, ...event }) as never))
  }

  override readEvent(request: { sessionId: SessionId; seq: number }): Promise<never> {
    const event = (this.events.get(request.sessionId) ?? []).find(candidate => candidate.seq === request.seq)
    return Promise.resolve({ target: { data: event?.data } } as never)
  }
}

function header(id: string, cwd: string | null = '/project'): SessionHeader {
  return {
    version: SESSION_FORMAT_VERSION,
    id: sid(id),
    createdAt: 100,
    isSeeded: false,
    ...(cwd === null ? {} : { cwd }),
  }
}

function presented(turn: number, files: readonly { path: string; description?: string }[]): unknown {
  return { turn, callId: `call-${turn}`, files }
}

describe('session.deliveries', () => {
  it('lists presented files of visible Sessions and skips other events and malformed payloads', async () => {
    const ctx = await baseContext()
    ctx.provide('attachments', { imageLimits: TEST_IMAGE_LIMITS } as never)
    new DeliveryQuery(ctx, [header('a', '/a'), header('hidden', null)], new Map([
      ['a', [
        { seq: 1, type: 'user/message', surface: 'current', time: 10, data: {} },
        { seq: 2, type: 'deliverables/presented', surface: 'current', time: 20, data: presented(1, [
          { path: '/a/report.md', description: 'Report' },
          { path: '' },
        ]) },
        { seq: 3, type: 'deliverables/presented', surface: 'current', time: 30, data: { turn: 'bad' } },
        { seq: 4, type: 'deliverables/presented', surface: 'fork', time: 40, data: presented(2, [{ path: '/a/forked.md' }]) },
      ]],
      ['hidden', [
        { seq: 1, type: 'deliverables/presented', surface: 'current', time: 50, data: presented(1, [{ path: '/hidden/x.md' }]) },
      ]],
    ]))
    const list = new ApiSessionList(ctx, 8)
    await list.initialize()

    const result = await list.deliveries(new AbortController().signal)
    expect(result.items).toEqual([
      { sessionId: 'a', turn: 1, path: '/a/report.md', description: 'Report', time: 20 },
    ])
    expect(result.hasMore).toBe(false)
    await ctx.fiber.dispose()
  })

  it('bounds the listing and reports that more files exist', async () => {
    const ctx = await baseContext()
    ctx.provide('attachments', { imageLimits: TEST_IMAGE_LIMITS } as never)
    const files = Array.from({ length: DELIVERY_RESULT_LIMIT + 5 }, (_, index) => ({ path: `/a/file-${index}.md` }))
    new DeliveryQuery(ctx, [header('a', '/a')], new Map([
      ['a', [{ seq: 1, type: 'deliverables/presented', surface: 'current', time: 10, data: presented(1, files) }]],
    ]))
    const list = new ApiSessionList(ctx, 8)
    await list.initialize()

    const result = await list.deliveries(new AbortController().signal)
    expect(result.items).toHaveLength(DELIVERY_RESULT_LIMIT)
    expect(result.hasMore).toBe(true)
    await ctx.fiber.dispose()
  })
})
