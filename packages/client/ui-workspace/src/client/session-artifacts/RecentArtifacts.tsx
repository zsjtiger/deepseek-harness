/**
 * Recent presented files below the blank-session composer. Shows the newest three
 * files across visible Sessions; renders nothing while the listing is empty,
 * loading, or unavailable, so the home page keeps its usual shape.
 * @module @deepseek-ai/dsh-client-ui-workspace/session-artifacts/RecentArtifacts
 */
import { useEffect, useMemo, useState } from 'react'
import { IconDeliverDocRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SessionDeliveryItem } from '@deepseek-ai/dsh-api-session-controller/client'
import type { RecentArtifactsProps } from '../contract/slots.ts'
import css from './RecentArtifacts.module.css'

/** Number of cards the strip shows. */
const RECENT_LIMIT = 3

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

/**
 * Last path segment, used as the card title.
 * @param path - file path as the Host reports it.
 * @returns the final segment, or the whole path when it has none.
 */
function fileName(path: string): string {
  const segments = path.split(/[\\/]/)
  return segments[segments.length - 1] ?? path
}

/**
 * Relative time for a card footer, in the largest unit that fits (minutes, hours, days).
 * @param time - epoch milliseconds of the presentation.
 * @param now - the reference instant in epoch milliseconds.
 * @returns localized text such as "2 hours ago" or "yesterday".
 */
export function formatRelativeTime(time: number, now: number = Date.now()): string {
  const seconds = Math.round((time - now) / 1000)
  const absolute = Math.abs(seconds)
  if (absolute < 3600) return relative.format(Math.round(seconds / 60), 'minute')
  if (absolute < 86_400) return relative.format(Math.round(seconds / 3600), 'hour')
  return relative.format(Math.round(seconds / 86_400), 'day')
}

/**
 * The recent-artifacts strip: a heading, a "View all" action, and up to three cards.
 * Each card opens the Session that presented its file.
 * @param props - the listing function, the Artifacts and Session openers, and the locale seat.
 * @returns the strip, or null when there is nothing to show.
 */
export function RecentArtifacts({ loadDeliveries, openArtifacts, openSession, t }: RecentArtifactsProps) {
  const [items, setItems] = useState<readonly SessionDeliveryItem[]>([])

  useEffect(() => {
    const controller = new AbortController()
    loadDeliveries(controller.signal).then((result) => {
      if (controller.signal.aborted) return
      setItems(result.ok ? result.items : [])
    })
    return () => { controller.abort() }
  }, [loadDeliveries])

  const recent = useMemo(
    () => [...items].sort((a, b) => b.time - a.time).slice(0, RECENT_LIMIT),
    [items],
  )
  if (recent.length === 0) return null

  return (
    <section className={css.root} aria-label={t('recent.title')}>
      <header className={css.header}>
        <h2 className={css.title}>{t('recent.title')}</h2>
        <button type="button" className={css.viewAll} onClick={openArtifacts}>{t('recent.viewAll')}</button>
      </header>
      <ul className={css.list}>
        {recent.map(item => (
          <li key={`${item.sessionId}:${item.path}:${item.time}`}>
            <button type="button" className={css.card} onClick={() => { openSession(item.sessionId) }}>
              <span className={css.preview} aria-hidden="true">
                <IconDeliverDocRegular size={28} />
              </span>
              <span className={css.meta}>
                <span className={css.name}>{fileName(item.path)}</span>
                <span className={css.time}>{formatRelativeTime(item.time)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
