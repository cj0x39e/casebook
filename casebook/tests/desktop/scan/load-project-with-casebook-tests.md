---
id: CB-SCAN-002
title: 选择包含 casebook/tests 的项目后成功加载用例列表
platform: desktop
created_at: 2026-03-30
priority: P0
status: pass
---

## 前置条件

- 本地存在一个包含 `casebook/tests` 目录的项目。
- 目录中至少包含一个 Markdown 测试用例文件。

## 步骤

1. 点击 `Open Project Directory`。
2. 在系统目录选择器中选择目标项目根目录。
3. 等待扫描完成。

## 预期结果

- 状态标签从 `Scanning` 切换为 `Loaded`。
- 页面显示统计区、告警区（如有）和测试用例列表。
- 列表中的每一项都展示标题、相对路径、平台、优先级和更新时间。
