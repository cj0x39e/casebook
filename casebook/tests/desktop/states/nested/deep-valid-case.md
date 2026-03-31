---
title: 递归扫描多级子目录中的 Markdown 用例
platform: desktop
priority: P1
---

## 前置条件

- 用例文件位于 `casebook/tests` 的多级子目录中。

## 步骤

1. 扫描当前 demo 项目。
2. 在列表中查找相对路径包含 `states/nested` 的用例。

## 预期结果

- 当前用例会被正常扫描并出现在列表中。
- 列表路径保留多级目录信息，便于识别功能归属。

