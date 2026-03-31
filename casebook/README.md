# Casebook Demo 用例集

这个目录是当前 demo 项目自带的 Casebook 数据集，用来演示桌面应用如何读取项目内的 `casebook/tests` 并展示 Markdown 测试用例。

## 目录约定

- `casebook/tests/desktop/scan`：项目选择、扫描、重扫相关场景
- `casebook/tests/desktop/parsing`：frontmatter 与必填章节解析场景
- `casebook/tests/desktop/states`：递归目录、时间戳与列表展示相关场景

## Markdown 约定

每个测试用例文件都遵循当前应用已经实现的最小契约：

- frontmatter 必填字段：`title`、`platform`
- frontmatter 可选字段：`priority`、`status`
- `id` 由 `casebook/tests` 下相对路径生成
- `created_at` 由 Git 历史首个提交时间推导
- `status` 推荐英文值：`todo`、`in_progress`、`pass`、`blocked`
- 正文必填章节：`## 前置条件`、`## 步骤`、`## 预期结果`

这套 demo 数据刻意保留了部分不完整和损坏的样例：

- `partial`：缺少必填字段或缺少必填章节
- `invalid`：frontmatter 无法被 YAML 解析

这样可以直接验证 Casebook 的统计区、状态色块和解析提示，而不是只展示一组全合法样例。
