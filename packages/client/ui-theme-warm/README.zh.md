---
description: "在 Web 客户端内置浅色配色上叠加一层暖色侧栏底色。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-theme-warm

[English](README.md) | 中文

## 概述

这个私有的 Web 客户端包在主题运行时上叠加一个别名级 token：浅色配色下侧栏底色为暖白色。深色配色保持内置的侧栏底色。该包不保存任何数据，也不提供设置项。

## 目录

- [使用此包](#use-this-package)
- [模型体验](#model-experience)
- [已知限制与待办](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

## 使用此包

<a id="use-this-package"></a>

Web 应用通过 `packages/bundle/web-app/cordis.patch.yml` 加载它。删除该行即可恢复内置的浅色配色。覆盖层以包名为键，重复注册会替换而不是叠加。


<a id="model-experience"></a>
## 模型体验

无，因为此包只改变 Web 侧栏的呈现方式，不向模型输入添加任何内容。

#### KV 缓存影响

没有直接失效；Web 侧栏只在客户端运行，不进入模型请求的前缀。

## 已知限制与待办

<a id="known-limitations-and-deferred-work"></a>

- 只覆盖侧栏底色。排版、首页问候语、居中输入框和最近产物区域保持内置样式。
- 配色在源码中固定，没有用于选择颜色的设置项。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>面向维护者的工作上下文 — 点击展开</summary>

此开发备注是面向维护者的工作上下文：尚未定论的方向和待定问题。它明确不具权威性——已发布的行为、限制和已接受的理由见上面的章节、包代码以及链接的 Agent Notes。

</details>
