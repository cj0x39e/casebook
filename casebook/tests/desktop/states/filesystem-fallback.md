---
id: CB-STATE-003
title: Git 不可用时回退到文件系统修改时间
platform: desktop
created_at: 2026-03-30
priority: P2
---

## 前置条件

- 当前项目未被 Git 管理，或者目标文件无法从 Git 历史解析更新时间。

## 步骤

1. 在非 Git 项目中打开包含该格式用例的目录，或让文件脱离 Git 时间查询场景。
2. 扫描项目并查看当前用例卡片。

## 预期结果

- 更新时间回退为文件系统修改时间。
- 卡片元信息显示 `File timestamp fallback`。

