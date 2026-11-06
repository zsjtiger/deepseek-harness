/** Warm sidebar tint layered over the built-in light palette. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import type { ThemeRuntime } from '@deepseek-ai/dsh-client-ui-theme/client'

/** Token-layer identity; re-registering replaces this layer rather than stacking another. */
const LAYER_SOURCE = '@deepseek-ai/dsh-client-ui-theme-warm'

/** Services this plugin reads; the theme runtime owns the token layer. */
export const inject = ['theme']

/**
 * Overlay the warm sidebar fill on both palettes. Dark keeps the built-in
 * sidebar fill through a var() reference so the dark palette is unchanged.
 * @param ctx - Browser context with the theme runtime service.
 */
export function apply(ctx: Context): void {
  const theme: ThemeRuntime = ctx.theme
  ctx.effect(() => theme.overrideTokens(LAYER_SOURCE, {
    '--dsw-specific-sidebar-fill': {
      light: '#f7f6f2',
      dark: 'var(--dsw-static-neutral-bluish-900)',
    },
  }), 'ui-theme-warm: sidebar token layer')
}
