---
platform: desktop
priority: P1
status: 进行中
---

## 前置条件

- 测试文件缺少 `title` 字段。
- 文件名可作为展示标题的回退值。

## 步骤

1. 扫描项目并定位当前用例。

## 预期结果

- 用例状态显示为 `partial`。
- 解析提示包含 `Missing frontmatter field: title`。
- 标题展示回退为文件名 `missing-frontmatter-title`。

