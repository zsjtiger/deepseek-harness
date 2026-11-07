---
description: "Layer a warm sidebar tint over the built-in light palette of the Web client."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-theme-warm

English | [中文](README.zh.md)

## Summary

This private Web client package overlays one alias-level token on the theme runtime: the sidebar fill is a warm off-white in the light palette. The dark palette keeps its built-in sidebar fill. The package stores nothing and exposes no settings.

## Table of Contents

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

## Use this package

<a id="use-this-package"></a>

The Web app loads it through `packages/bundle/web-app/cordis.patch.yml`. Remove that row to restore the built-in light palette. The override layer is keyed by the package name, so re-registering replaces it rather than stacking.


<a id="model-experience"></a>
## Model Experience

None, as this package only changes the presentation of the Web sidebar and adds no model input.

#### KV Cache effect

No direct invalidation; the Web sidebar is client-only and never enters a model request prefix.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Only the sidebar fill is overridden. Typography, the home greeting, the centered composer, and the recent-artifacts area keep their built-in presentation.
- The palette is fixed in source. There is no settings row for choosing colors.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

This Dev Note is working context for maintainers: undecided directions and open questions. It is explicitly non-authoritative — shipped behavior, limits, and accepted rationale live in the sections above, the package code, and the linked Agent Notes.

</details>
