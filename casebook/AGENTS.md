# Casebook 规范

## 目录约定

- 所有用例统一存放在 `casebook/tests/`
- Casebook 只扫描 `casebook/tests/` 下的 `.md` 文件

## Frontmatter

- 必填字段：`title`、`platform`
- 可选字段：`priority`、`status`
- `status` 合法值：`todo`、`in_progress`、`pass`、`blocked`

## 正文结构

- 推荐使用 `## 前置条件`
- 推荐使用 `## 步骤`
- 推荐使用 `## 预期结果`
