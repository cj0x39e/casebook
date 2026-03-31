---
title: 统计区反映 valid partial invalid 的真实数量
platform: desktop
priority: P1
---

## 前置条件

- 当前数据集中同时存在合法、部分缺失和损坏的 Markdown 用例。

## 步骤

1. 扫描当前 demo 项目。
2. 对照列表中各状态用例数量与顶部统计卡片。

## 预期结果

- `Total Cases` 等于扫描出的 Markdown 文件总数。
- `Valid`、`Partial`、`Invalid` 分别与列表中的状态数量一致。
- 统计区不是一组固定文案，而是来自实际解析结果。

