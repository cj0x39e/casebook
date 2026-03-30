---
id: CB-PARSE-004
title: frontmatter 语法损坏时显示 invalid
platform: desktop
created_at: 2026-03-30
priority: P0
broken: [unterminated
---

## 前置条件

- 当前 Markdown 文件的 frontmatter 不是合法 YAML。

## 步骤

1. 扫描项目。
2. 查看当前用例卡片状态。

## 预期结果

- 用例状态显示为 `invalid`。
- 解析备注展示 YAML 解析失败信息。

