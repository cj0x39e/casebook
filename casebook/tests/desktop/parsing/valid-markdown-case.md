---
id: CB-PARSE-001
title: 合法 Markdown 用例显示为 valid
platform: desktop
created_at: 2026-03-30
priority: P0
status: 进行中
---

## 前置条件

- 目标 Markdown 文件包含完整 frontmatter。
- 正文包含 Casebook 规定的全部必填章节。

## 步骤

1. 扫描包含该用例的项目。
2. 在列表中找到当前用例卡片。

## 预期结果

- 用例状态显示为 `valid`。
- 卡片不显示缺失字段或缺失章节的提示。
