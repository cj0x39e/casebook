---
id: CB-STATE-005
title: 扫描告警区展示目录或文件读取失败信息
platform: desktop
created_at: 2026-03-30
priority: P2
status: 已阻塞
---

## 前置条件

- 扫描过程中存在无法读取的目录或文件。
- 例如目录权限不足、目录项读取失败或文件读取失败。

## 步骤

1. 让 `casebook/tests` 下存在一个不可读子目录或损坏的读取环境。
2. 重新扫描项目。

## 预期结果

- 页面展示 Scan Warnings 区域。
- 每条告警都包含路径和错误信息。
- 其他可读取的 Markdown 用例仍继续被扫描。
