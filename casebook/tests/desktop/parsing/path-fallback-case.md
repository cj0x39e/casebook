---
id: CB-PARSE-005
created_at: 2026-03-30
priority: P2
status: todo
---

## 前置条件

- 当前用例缺少 `title` 与 `platform` 字段。

## 步骤

1. 扫描项目。
2. 观察当前用例卡片中的标题、平台与解析提示。

## 预期结果

- 用例状态显示为 `partial`。
- 标题回退为文件名 `path-fallback-case`。
- 平台回退为路径首段 `desktop`。
- 解析提示同时包含缺少 `title` 和缺少 `platform`。

