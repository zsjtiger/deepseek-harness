/** Artifacts main panel: files that turns presented, across visible Sessions. */
import { useEffect, useMemo, useState } from 'react'
import { IconDeliverDocRegular, IconSearchOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionDeliveryItem } from '@deepseek-ai/dsh-api-session-controller/client'
import type { ArtifactsListing, ArtifactsPanelProps } from '../contract/slots.ts'
import css from './ArtifactsPanel.module.css'

/** Decorative occupant for the Artifacts sidebar entry; the sidebar owns the label. */
export function ArtifactsPanelIcon({ size }: PropsRuntime<'sidebar.panellist'>) {
  return <IconDeliverDocRegular size={size} />
}

type PanelState =
  | { readonly phase: 'loading' }
  | { readonly phase: 'error' }
  | { readonly phase: 'ready'; readonly items: readonly SessionDeliveryItem[]; readonly hasMore: boolean }

/** Last path segment, used as the file name. */
function fileName(path: string): string {
  const segments = path.split(/[\\/]/)
  return segments[segments.length - 1] ?? path
}

/**
 * Render the presented-file list, newest first, with a client-side filter over
 * file name, path, description, and Session title.
 * @param props - the listing function, the Session opener, the session list, and the locale seat.
 * @returns the Artifacts panel.
 */
export function ArtifactsPanel({ useSessionList, loadDeliveries, openSession, t }: ArtifactsPanelProps) {
  const list = useSessionList(value => value)
  const [state, setState] = useState<PanelState>({ phase: 'loading' })
  const [query, setQuery] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    setState({ phase: 'loading' })
    loadDeliveries(controller.signal).then((result: ArtifactsListing) => {
      if (controller.signal.aborted) return
      setState(result.ok
        ? { phase: 'ready', items: result.items, hasMore: result.hasMore }
        : { phase: 'error' })
    })
    return () => { controller.abort() }
  }, [loadDeliveries])

  const sorted = useMemo(() => (state.phase === 'ready'
    ? [...state.items].sort((a, b) => b.time - a.time)
    : []), [state])
  const needle = query.trim().toLowerCase()
  const visible = needle === ''
    ? sorted
    : sorted.filter((item) => {
      const title = list.byId[item.sessionId]?.displayTitle ?? ''
      return [fileName(item.path), item.path, item.description ?? '', title]
        .some(value => value.toLowerCase().includes(needle))
    })

  return (
    <section className={css.panel} aria-label={t('artifacts.title')}>
      <header className={css.header}>
        <h1 className={css.title}>{t('artifacts.title')}</h1>
        <label className={css.search}>
          <IconSearchOutlineRegular size={16} />
          <input
            type="search"
            className={css.input}
            placeholder={t('artifacts.search')}
            aria-label={t('artifacts.search')}
            value={query}
            onChange={(event) => { setQuery(event.target.value) }}
          />
        </label>
      </header>

      {state.phase === 'loading' && <div className={css.notice}>{t('artifacts.loading')}</div>}
      {state.phase === 'error' && <div className={css.notice}>{t('artifacts.error')}</div>}
      {state.phase === 'ready' && sorted.length === 0 && <div className={css.notice}>{t('artifacts.empty')}</div>}
      {state.phase === 'ready' && sorted.length > 0 && visible.length === 0 && (
        <div className={css.notice}>{t('artifacts.noMatch')}</div>
      )}

      {state.phase === 'ready' && visible.length > 0 && (
        <ul className={css.list}>
          {visible.map((item) => {
            const sessionTitle = list.byId[item.sessionId]?.displayTitle ?? item.sessionId
            return (
              <li key={`${item.sessionId}:${item.turn}:${item.path}`}>
                <button type="button" className={css.row} onClick={() => { openSession(item.sessionId) }}>
                  <span className={css.icon} aria-hidden="true"><IconDeliverDocRegular size={18} /></span>
                  <span className={css.main}>
                    <span className={css.name}>{fileName(item.path)}</span>
                    <span className={css.path}>{item.path}</span>
                    {item.description !== undefined && item.description !== '' && (
                      <span className={css.description}>{item.description}</span>
                    )}
                  </span>
                  <span className={css.meta}>
                    <span className={css.session}>{sessionTitle}</span>
                    <span>{new Date(item.time).toLocaleString()}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {state.phase === 'ready' && state.hasMore && <div className={css.notice}>{t('artifacts.truncated')}</div>}
    </section>
  )
}
