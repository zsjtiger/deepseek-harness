// @vitest-environment jsdom
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { en as commonEn } from '@deepseek-ai/dsh-client-locale/src/locales/en.ts'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionDeliveryItem } from '@deepseek-ai/dsh-api-session-controller/client'
import type { ArtifactsListing, RecentArtifactsProps } from '../src/client/contract/slots.ts'
import { en } from '../src/client/locales.ts'
import { formatRelativeTime, RecentArtifacts } from '../src/client/session-artifacts/RecentArtifacts.tsx'

const t: RecentArtifactsProps['t'] = makeTranslate({ ...commonEn, ...en })

const HOUR = 3_600_000

function delivery(path: string, time: number): SessionDeliveryItem {
  return { sessionId: 'sess-a' as SessionId, turn: 1, path, time }
}

function listing(paths: [string, number][]): ArtifactsListing {
  return { ok: true, hasMore: false, items: paths.map(([path, time]) => delivery(path, time)) }
}

afterEach(() => { cleanup() })

describe('RecentArtifacts', () => {
  it('shows the three newest files, newest first', async () => {
    const load = vi.fn(async () => listing([
      ['/work/a.md', 1 * HOUR],
      ['/work/b.docx', 4 * HOUR],
      ['/work/c.md', 2 * HOUR],
      ['/work/d.md', 3 * HOUR],
    ]))
    render(<RecentArtifacts t={t} loadDeliveries={load} openArtifacts={vi.fn()} openSession={vi.fn()} />)
    await waitFor(() => expect(screen.getAllByRole('button').length).toBeGreaterThan(1))
    const titles = screen.getAllByText(/\.(md|docx)$/).map(node => node.textContent)
    expect(titles).toEqual(['b.docx', 'd.md', 'c.md'])
  })

  it('renders nothing when the listing is empty or unavailable', async () => {
    const empty = vi.fn(async (): Promise<ArtifactsListing> => listing([]))
    const { container, unmount } = render(
      <RecentArtifacts t={t} loadDeliveries={empty} openArtifacts={vi.fn()} openSession={vi.fn()} />,
    )
    await waitFor(() => expect(empty).toHaveBeenCalled())
    expect(container.querySelector('section')).toBeNull()
    unmount()

    const failed = vi.fn(async (): Promise<ArtifactsListing> => ({ ok: false }))
    const second = render(
      <RecentArtifacts t={t} loadDeliveries={failed} openArtifacts={vi.fn()} openSession={vi.fn()} />,
    )
    await waitFor(() => expect(failed).toHaveBeenCalled())
    expect(second.container.querySelector('section')).toBeNull()
  })

  it('opens the Artifacts panel from View all and the Session from a card', async () => {
    const openArtifacts = vi.fn()
    const openSession = vi.fn()
    const load = vi.fn(async () => listing([['/work/a.md', 1 * HOUR]]))
    render(<RecentArtifacts t={t} loadDeliveries={load} openArtifacts={openArtifacts} openSession={openSession} />)
    fireEvent.click(await screen.findByRole('button', { name: en['recent.viewAll'] }))
    expect(openArtifacts).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByText('a.md'))
    expect(openSession).toHaveBeenCalledWith('sess-a')
  })
})

describe('formatRelativeTime', () => {
  const now = 10 * 86_400_000

  it('chooses minutes, hours, or days by distance', () => {
    expect(formatRelativeTime(now - 5 * 60_000, now)).toBe('5 minutes ago')
    expect(formatRelativeTime(now - 2 * HOUR, now)).toBe('2 hours ago')
    expect(formatRelativeTime(now - 86_400_000, now)).toBe('yesterday')
  })
})
