// @vitest-environment jsdom
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { en as commonEn } from '@deepseek-ai/dsh-client-locale/src/locales/en.ts'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ArtifactsListing, ArtifactsPanelProps } from '../src/client/contract/slots.ts'
import { en } from '../src/client/locales.ts'
import { ArtifactsPanel } from '../src/client/session-artifacts/ArtifactsPanel.tsx'

const t: ArtifactsPanelProps['t'] = makeTranslate({ ...commonEn, ...en })

const list = {
  ids: ['sess-a', 'sess-b'],
  byId: {
    'sess-a': { displayTitle: 'Research notes' },
    'sess-b': { displayTitle: 'Data prep' },
  },
} as never

const items: ArtifactsListing = {
  ok: true,
  hasMore: false,
  items: [
    { sessionId: 'sess-b', turn: 2, path: '/work/data.csv', time: 1_000 },
    { sessionId: 'sess-a', turn: 1, path: '/work/report.md', description: 'Final report', time: 2_000 },
  ],
}

function renderPanel(loadDeliveries: ArtifactsPanelProps['loadDeliveries'], openSession = vi.fn()) {
  render(
    <ArtifactsPanel
      t={t}
      useSessionList={select => select(list)}
      loadDeliveries={loadDeliveries}
      openSession={openSession}
    />,
  )
  return { openSession }
}

afterEach(() => {
  cleanup()
})

describe('ArtifactsPanel', () => {
  it('lists presented files newest first', async () => {
    renderPanel(async () => items)
    await screen.findByText('report.md')
    const rows = screen.getAllByRole('listitem').map(row => row.textContent ?? '')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toContain('report.md')
    expect(rows[1]).toContain('data.csv')
  })

  it('filters by file name, description, or Session title', async () => {
    renderPanel(async () => items)
    await screen.findByText('report.md')
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'data prep' } })
    expect(screen.queryByText('report.md')).toBeNull()
    expect(screen.getByText('data.csv')).toBeTruthy()
  })

  it('shows the failure notice when the listing fails', async () => {
    renderPanel(async () => ({ ok: false }))
    await waitFor(() => { expect(screen.getByText(t('artifacts.error'))).toBeTruthy() })
  })

  it('opens the presenting Session when a file is chosen', async () => {
    const { openSession } = renderPanel(async () => items)
    fireEvent.click(await screen.findByText('report.md'))
    expect(openSession).toHaveBeenCalledWith('sess-a')
  })
})
