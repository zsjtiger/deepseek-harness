/** Registers the Skills management panel: a sidebar entry and its main panel. */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import { IconDeliverDocRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { NS } from './locales.ts'
import { UserSkillsPanel, type UploadOutcome, type UserSkillItem } from './UserSkillsPanel.tsx'

/** Panel id of the Skills management main panel. */
const USER_SKILLS_PANEL_ID = 'user-skills' as MainPanelId

/** Decorative occupant for the Skills sidebar entry; the sidebar owns the label. */
function UserSkillsPanelIcon({ size }: PropsRuntime<'sidebar.panellist'>) {
  return <IconDeliverDocRegular size={size} />
}

/**
 * Read a Remote failure code from a rejected call, when the rejection carries one.
 * @param error - the rejection value.
 * @returns the code, or undefined when the rejection has none.
 */
function failureCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
    ? error.code
    : undefined
}

/**
 * Map a Host upload refusal code to the panel's notice category.
 * @param code - the Remote failure code, or empty when there is none.
 * @returns `exists` for a taken name, `invalid` for a rejected file, otherwise `other`.
 */
function uploadReason(code: string): 'exists' | 'invalid' | 'other' {
  if (code === 'skill/exists') return 'exists'
  if (code === 'skill/invalid') return 'invalid'
  return 'other'
}

/**
 * Register the Skills sidebar entry and its main panel on the client context.
 * @param ctx - client context with the locale, slot, and Remote services.
 */
export function registerUserSkillsPanel(ctx: ClientContext): void {
  const t = ctx.locale.bind(NS)
  const loadSkills = async (signal: AbortSignal): Promise<readonly UserSkillItem[] | undefined> => {
    try {
      const result = await ctx.remote.skills.listUser(signal)
      return result.ok ? result.value.skills : undefined
    } catch (_error: unknown) {
      // A rejected read leaves the list unknown, so the panel shows its failure notice.
      return undefined
    }
  }
  const uploadSkill = async (content: string): Promise<UploadOutcome> => {
    try {
      const result = await ctx.remote.skills.uploadUser({ content }, new AbortController().signal)
      if (result.ok) return { ok: true }
      // The skill codes are declared on the Host side, so the client compares the wire code as text.
      const code: string = result.error.code
      return { ok: false, reason: uploadReason(code) }
    } catch (error: unknown) {
      return { ok: false, reason: uploadReason(failureCode(error) ?? '') }
    }
  }
  const removeSkill = async (name: string): Promise<boolean> => {
    try {
      const result = await ctx.remote.skills.removeUser({ name }, new AbortController().signal)
      return result.ok
    } catch (_error: unknown) {
      // A rejected removal leaves the skill in place; the panel reports it as not removed.
      return false
    }
  }
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist', id: USER_SKILLS_PANEL_ID, order: 6, locale: NS,
    label: () => t('panel.label'),
  }, UserSkillsPanelIcon))
  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main', key: USER_SKILLS_PANEL_ID, locale: NS,
    inject: () => ({ loadSkills, uploadSkill, removeSkill }),
  }, UserSkillsPanel))
}
