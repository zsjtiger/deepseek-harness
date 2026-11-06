---
description: "Layer a warm sidebar tint over the built-in light palette of the Web client."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-theme-warm

English

## Summary

This private Web client package overlays one alias-level token on the theme runtime: the sidebar fill is a warm off-white in the light palette. The dark palette keeps its built-in sidebar fill. The package stores nothing and exposes no settings.

## Use this package

The Web app loads it through `packages/bundle/web-app/cordis.patch.yml`. Remove that row to restore the built-in light palette. The override layer is keyed by the package name, so re-registering replaces it rather than stacking.

## Known Limitations and Deferred Work

- Only the sidebar fill is overridden. Typography, the home greeting, the centered composer, and the recent-artifacts area keep their built-in presentation.
- The palette is fixed in source. There is no settings row for choosing colors.
