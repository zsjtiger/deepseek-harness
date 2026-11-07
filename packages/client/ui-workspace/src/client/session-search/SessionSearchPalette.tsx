/** Full-screen Session search: content matches across Sessions, Recents, and New session. */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { IconCloseFillRegular, IconNewChatOutlineRegular, IconSearchOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionSearchResultItem } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionSearchPaletteProps } from '../contract/slots.ts'
import { orderByRecency } from '../tree.ts'
import css from './SessionSearchPalette.module.css'

/** Recent Sessions listed while the query is empty. */
const RECENT_LIMIT = 8
/** Pause between the latest keystroke and the content search request. */
const SEARCH_DEBOUNCE_MS = 250

type Filter = 'all' | 'sessions'

/** One selectable row, in the order the keyboard moves through them. */
type PaletteRow =
  | { readonly kind: 'session'; readonly key: string; readonly sessionId: SessionId; readonly snippet?: string }
  | { readonly kind: 'new'; readonly key: string }

/**
 * The `shell.overlay` entry: renders nothing while closed, and a fresh palette
 * each time it opens so the query and filter start clean.
 * @param props - the open flag, the session list, the close, open, and start actions, and the content search.
 * @returns the open palette, or null.
 */
export function SessionSearchPalette(props: SessionSearchPaletteProps) {
  const open = props.usePaletteOpen(value => value)
  if (!open) return null
  return <Palette {...props} />
}

function Palette({ useSessionList, close, openSession, startSession, searchSessions, t }: SessionSearchPaletteProps) {
  const list = useSessionList(value => value)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [results, setResults] = useState<readonly SessionSearchResultItem[]>([])
  const [searching, setSearching] = useState(false)
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const trimmed = query.trim()

  useEffect(() => { input.current?.focus() }, [])

  // The content search runs after a short pause; a newer query aborts the older request.
  useEffect(() => {
    if (trimmed === '') {
      setResults([])
      setSearching(false)
      return
    }
    const controller = new AbortController()
    setSearching(true)
    const timer = window.setTimeout(() => {
      searchSessions(trimmed, controller.signal).then(
        (page) => {
          if (controller.signal.aborted) return
          setResults(page.items)
          setSearching(false)
        },
        () => {
          if (controller.signal.aborted) return
          setResults([])
          setSearching(false)
        },
      )
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [trimmed, searchSessions])

  const recents = useMemo(() => orderByRecency(list.ids, list.byId).slice(0, RECENT_LIMIT), [list])

  const sessionRows: PaletteRow[] = trimmed === ''
    ? recents.map(sessionId => ({ kind: 'session', key: `recent:${sessionId}`, sessionId }))
    : results.map(item => ({ kind: 'session', key: `result:${item.sessionId}`, sessionId: item.sessionId, snippet: item.snippet }))
  const rows: PaletteRow[] = filter === 'all'
    ? [...sessionRows, { kind: 'new', key: 'new' }]
    : sessionRows

  const activeRow = rows[Math.min(active, rows.length - 1)]

  const activate = (row: PaletteRow | undefined): void => {
    if (row === undefined) return
    if (row.kind === 'new') startSession()
    else openSession(row.sessionId)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive(index => Math.min(index + 1, rows.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive(index => Math.max(index - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      activate(activeRow)
    }
  }

  const title = (sessionId: SessionId): string => list.byId[sessionId]?.displayTitle ?? sessionId
  const sessionGroup = trimmed === '' ? t('palette.group.recents') : t('palette.group.results')
  const sessionKeysBeforeNew = sessionRows.length

  return (
    <div className={css.overlay} role="dialog" aria-modal="true" aria-label={t('palette.placeholder')} onKeyDown={onKeyDown}>
      <div className={css.header}>
        <IconSearchOutlineRegular size={20} />
        <input
          ref={input}
          className={css.input}
          type="text"
          placeholder={t('palette.placeholder')}
          aria-label={t('palette.placeholder')}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setActive(0)
          }}
        />
        <button type="button" className={css.close} aria-label={t('palette.close')} onClick={close}>
          <IconCloseFillRegular size={18} />
        </button>
      </div>

      <div className={css.filters} role="tablist">
        {(['all', 'sessions'] as const).map(value => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={filter === value}
            className={filter === value ? css.filterActive : css.filter}
            onClick={() => {
              setFilter(value)
              setActive(0)
            }}
          >
            {value === 'all' ? t('palette.filter.all') : t('palette.filter.sessions')}
          </button>
        ))}
      </div>

      <div className={css.body}>
        {sessionRows.length > 0 && (
          <div className={css.group}>
            <div className={css.groupTitle}>{sessionGroup}</div>
            {sessionRows.map((row, index) => row.kind === 'session' && (
              <button
                key={row.key}
                type="button"
                className={index === active ? css.rowActive : css.row}
                onMouseEnter={() => setActive(index)}
                onClick={() => activate(row)}
              >
                <span className={css.rowTitle}>{title(row.sessionId)}</span>
                {row.snippet !== undefined && <span className={css.snippet}>{row.snippet}</span>}
              </button>
            ))}
          </div>
        )}

        {trimmed !== '' && !searching && results.length === 0 && (
          <div className={css.empty}>{t('palette.empty')}</div>
        )}
        {trimmed !== '' && searching && <div className={css.empty}>{t('palette.searching')}</div>}

        {filter === 'all' && (
          <div className={css.group}>
            <div className={css.groupTitle}>{t('palette.group.actions')}</div>
            <button
              type="button"
              className={rows.length - 1 === active ? css.rowActive : css.row}
              onMouseEnter={() => setActive(sessionKeysBeforeNew)}
              onClick={() => activate({ kind: 'new', key: 'new' })}
            >
              <IconNewChatOutlineRegular size={18} />
              <span className={css.rowTitle}>{t('session.new')}</span>
            </button>
          </div>
        )}
      </div>

      <div className={css.footer}>
        <kbd className={css.kbd}>{t('palette.escape')}</kbd>
        <span>{t('palette.footer.close')}</span>
      </div>
    </div>
  )
}
