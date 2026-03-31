---
title: 选择未初始化 Casebook 的目录时显示缺失提示
platform: desktop
priority: P1
---

## 前置条件

- 本地存在一个普通项目目录。
- 该目录下不存在 `casebook/tests`。

## 步骤

1. 点击 `Open Project Directory`。
2. 选择不包含 `casebook/tests` 的项目根目录。

## 预期结果

- 状态标签显示 `Missing casebook/tests`。
- 主内容区提示当前目录还不是 Casebook 项目。
- 应用保持只读，不会自动创建目录结构。

