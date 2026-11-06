/** Skills management panel: the user's own SKILL.md files, with upload and delete. */
import { useEffect, useRef, useState } from 'react'
import { Button, IconDeliverDocRegular, IconPlusOutlineMedium } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import css from './UserSkillsPanel.module.css'

/** Largest SKILL.md the panel uploads, in bytes; matches the Host limit. */
const UPLOAD_MAX_BYTES = 256 * 1024

/** One user skill as the panel shows it. */
export interface UserSkillItem {
  readonly name: string
  readonly description: string
  /** False when the stored SKILL.md is malformed or names another folder. */
  readonly valid: boolean
}

/** Outcome of an upload: stored, or the Host refusal category. */
export type UploadOutcome = { readonly ok: true } | { readonly ok: false; readonly reason: 'exists' | 'invalid' | 'other' }

/** Injected operations and the locale seat of the Skills panel. */
export interface UserSkillsPanelProps extends PropsLocale<'skill'> {
  /** List the user's skills; undefined when the Host read fails. */
  loadSkills: (signal: AbortSignal) => Promise<readonly UserSkillItem[] | undefined>
  /** Store one SKILL.md text as a new skill. */
  uploadSkill: (content: string) => Promise<UploadOutcome>
  /** Delete one user skill; resolves false when the Host refuses. */
  removeSkill: (name: string) => Promise<boolean>
}

type PanelState =
  | { readonly phase: 'loading' }
  | { readonly phase: 'error' }
  | { readonly phase: 'ready'; readonly skills: readonly UserSkillItem[] }

/**
 * Render the user's skills with an upload control and per-row delete.
 * @param props - the list, upload, and remove operations and the locale seat.
 * @returns the Skills panel.
 */
export function UserSkillsPanel({ loadSkills, uploadSkill, removeSkill, t }: UserSkillsPanelProps) {
  const [state, setState] = useState<PanelState>({ phase: 'loading' })
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | undefined>()
  const [reloadToken, setReloadToken] = useState(0)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const controller = new AbortController()
    setState({ phase: 'loading' })
    loadSkills(controller.signal).then((skills) => {
      if (controller.signal.aborted) return
      setState(skills === undefined ? { phase: 'error' } : { phase: 'ready', skills })
    })
    return () => { controller.abort() }
  }, [loadSkills, reloadToken])

  const upload = async (file: File): Promise<void> => {
    if (file.size > UPLOAD_MAX_BYTES) {
      setNotice(t('panel.tooLarge'))
      return
    }
    setBusy(true)
    setNotice(undefined)
    const outcome = await uploadSkill(await file.text())
    setBusy(false)
    if (outcome.ok) {
      setReloadToken(value => value + 1)
      return
    }
    setNotice(outcome.reason === 'exists' ? t('panel.exists')
      : outcome.reason === 'invalid' ? t('panel.invalidFile')
        : t('panel.uploadError'))
  }

  const remove = async (name: string): Promise<void> => {
    if (!window.confirm(t('panel.confirmDelete'))) return
    setBusy(true)
    const removed = await removeSkill(name)
    setBusy(false)
    if (removed) setReloadToken(value => value + 1)
    else setNotice(t('panel.uploadError'))
  }

  return (
    <section className={css.panel} aria-label={t('panel.title')}>
      <header className={css.header}>
        <div className={css.heading}>
          <h1 className={css.title}>{t('panel.title')}</h1>
          <p className={css.intro}>{t('panel.intro')}</p>
        </div>
        <input
          ref={input}
          type="file"
          accept=".md,text/markdown"
          className={css.fileInput}
          aria-label={t('panel.upload')}
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file !== undefined) void upload(file)
          }}
        />
        <Button variant="primary" disabled={busy} onClick={() => { input.current?.click() }}>
          <IconPlusOutlineMedium size={16} />
          {busy ? t('panel.uploading') : t('panel.upload')}
        </Button>
      </header>

      {notice !== undefined && <div className={css.notice} role="alert">{notice}</div>}
      {state.phase === 'loading' && <div className={css.notice}>{t('panel.loading')}</div>}
      {state.phase === 'error' && <div className={css.notice}>{t('panel.error')}</div>}
      {state.phase === 'ready' && state.skills.length === 0 && <div className={css.notice}>{t('panel.empty')}</div>}

      {state.phase === 'ready' && state.skills.length > 0 && (
        <ul className={css.list}>
          {state.skills.map(skill => (
            <li key={skill.name} className={css.row}>
              <span className={css.icon} aria-hidden="true"><IconDeliverDocRegular size={18} /></span>
              <span className={css.main}>
                <span className={css.name}>{skill.name}</span>
                <span className={css.description}>
                  {skill.valid ? skill.description : t('panel.invalid')}
                </span>
                {skill.valid && (
                  <span className={css.invoke}>
                    {t('panel.invoke')} <code>{`/${skill.name}`}</code>
                  </span>
                )}
              </span>
              <Button variant="outline" disabled={busy} onClick={() => { void remove(skill.name) }}>
                {t('panel.delete')}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
