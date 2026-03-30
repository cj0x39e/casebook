---
id: CB-STATE-002
title: Git 可用时优先展示 Git 更新时间
platform: desktop
created_at: 2026-03-30
priority: P1
---

## 前置条件

- 当前项目位于 Git 仓库中。
- 目标测试文件已经被 Git 提交过至少一次。

## 步骤

1. 扫描项目。
2. 查看当前用例的更新时间来源提示。

## 预期结果

- 更新时间使用 Git 最近提交时间。
- 卡片元信息显示 `Git timestamp`。

