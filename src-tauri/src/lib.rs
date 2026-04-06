use serde::{Deserialize, Serialize};
use serde_yaml::{Mapping, Value};
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
    time::UNIX_EPOCH,
};

const DEFAULT_TESTS_ALIAS: &str = "用例库";
const DEFAULT_CONFIG_CONTENT: &str = r#"tests_alias: 用例库
statuses:
  - id: todo
    label:
      en: Todo
      zh-CN: 待处理
    color: '#FFD400'
  - id: pass
    label:
      en: Pass
      zh-CN: 已通过
    color: '#2FDA00'
  - id: blocked
    label:
      en: Blocked
      zh-CN: 已阻塞
    color: '#FF0000'
"#;
const DEFAULT_AGENTS_CONTENT: &str = r#"# Casebook 规范

## 目录约定

- 所有用例统一存放在 `casebook/tests/`
- Casebook 只扫描 `casebook/tests/` 下的 `.md` 文件

## Frontmatter

- 必填字段：`title`、`platform`
- 可选字段：`priority`、`status`
- `status` 合法值在 `casebook/config.yml` 中配置

## 正文结构

- 推荐使用 `## 前置条件`
- 推荐使用 `## 步骤`
- 推荐使用 `## 预期结果`
"#;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ScanError {
    code: String,
    path: String,
    detail: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AppError {
    code: String,
    detail: Option<String>,
    path: Option<String>,
}

impl From<ScanError> for AppError {
    fn from(scan_error: ScanError) -> Self {
        AppError {
            code: scan_error.code,
            detail: scan_error.detail,
            path: Some(scan_error.path),
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct StatusConfig {
    id: String,
    label: std::collections::HashMap<String, String>,
    color: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ScannedCase {
    case_id: String,
    relative_path: String,
    absolute_path: String,
    content: String,
    created_at: Option<u64>,
    updated_at: Option<u64>,
    updated_at_source: UpdatedAtSource,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ScanResult {
    project_root: String,
    casebook_root: Option<String>,
    tests_root: Option<String>,
    tests_alias: Option<String>,
    statuses: Vec<StatusConfig>,
    cases: Vec<ScannedCase>,
    errors: Vec<ScanError>,
}

#[derive(Debug, Deserialize)]
struct CasebookConfig {
    tests_alias: Option<String>,
    statuses: Option<Vec<StatusConfig>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "lowercase")]
enum UpdatedAtSource {
    Git,
    Filesystem,
}

type AppResult<T> = Result<T, AppError>;

fn app_error(code: &str) -> AppError {
    AppError {
        code: code.to_string(),
        detail: None,
        path: None,
    }
}

fn app_error_with_detail(code: &str, detail: impl Into<String>) -> AppError {
    AppError {
        code: code.to_string(),
        detail: Some(detail.into()),
        path: None,
    }
}

fn app_error_with_path(code: &str, path: impl Into<String>) -> AppError {
    AppError {
        code: code.to_string(),
        detail: None,
        path: Some(path.into()),
    }
}

fn scan_error(code: &str, path: impl Into<String>, detail: Option<String>) -> ScanError {
    ScanError {
        code: code.to_string(),
        path: path.into(),
        detail,
    }
}

#[tauri::command]
fn scan_casebook(project_root: String) -> AppResult<ScanResult> {
    let project_root_path = PathBuf::from(&project_root);

    if !project_root_path.exists() {
        return Err(app_error("project.not_found"));
    }

    if !project_root_path.is_dir() {
        return Err(app_error("project.not_directory"));
    }

    let casebook_root = project_root_path.join("casebook");
    ensure_casebook_skeleton(&project_root_path)?;

    let tests_root = casebook_root.join("tests");
    let (tests_alias, statuses) = read_config(&casebook_root)?;

    let mut result = ScanResult {
        project_root,
        casebook_root: Some(casebook_root.to_string_lossy().into_owned()),
        tests_root: None,
        tests_alias,
        statuses,
        cases: Vec::new(),
        errors: Vec::new(),
    };

    result.tests_root = Some(tests_root.to_string_lossy().into_owned());

    let mut markdown_files = Vec::new();
    collect_markdown_files(&tests_root, &mut markdown_files, &mut result.errors);
    markdown_files.sort();

    for file_path in markdown_files {
        let absolute_path = file_path.to_string_lossy().into_owned();
        let relative_path = match file_path.strip_prefix(&tests_root) {
            Ok(path) => normalize_path(path),
            Err(error) => {
                result.errors.push(ScanError {
                    code: "scan.derive_case_path_failed".to_string(),
                    path: absolute_path.clone(),
                    detail: Some(error.to_string()),
                });
                continue;
            }
        };

        let case_id = relative_path.clone();
        let content = match fs::read_to_string(&file_path) {
            Ok(content) => content,
            Err(error) => {
                result.errors.push(ScanError {
                    code: "scan.read_file_failed".to_string(),
                    path: absolute_path.clone(),
                    detail: Some(error.to_string()),
                });
                continue;
            }
        };

        let created_at = git_created_at(&project_root_path, &file_path);
        let (updated_at, updated_at_source) = get_updated_at(&project_root_path, &file_path);

        result.cases.push(ScannedCase {
            case_id,
            relative_path,
            absolute_path,
            content,
            created_at,
            updated_at,
            updated_at_source,
        });
    }

    Ok(result)
}

#[tauri::command]
fn update_case_status(
    project_root: String,
    case_path: String,
    status: String,
) -> AppResult<ScannedCase> {
    let project_root_path = PathBuf::from(&project_root);
    let casebook_root = project_root_path.join("casebook");

    // 读取配置获取允许的状态列表
    let (_, statuses) = read_config(&casebook_root)
        .map_err(|_| app_error("config.read_failed"))?;
    let allowed_statuses: Vec<String> = statuses.iter().map(|s| s.id.clone()).collect();

    let normalized_status = validate_case_status(&status, &allowed_statuses)
        .map_err(|_| app_error_with_detail("case_status.unsupported", status.clone()))?;

    let case_path = PathBuf::from(&case_path);

    if !case_path.exists() {
        return Err(app_error("case.not_found"));
    }

    if !case_path.is_file() {
        return Err(app_error("case.not_file"));
    }

    let original_content = fs::read_to_string(&case_path)
        .map_err(|error| app_error_with_detail("case.read_failed", error.to_string()))?;
    let updated_content = update_case_status_in_markdown(&original_content, &normalized_status, &allowed_statuses)
        .map_err(|error| map_update_case_status_error(&error, &status))?;

    fs::write(&case_path, updated_content)
        .map_err(|error| app_error_with_detail("case.write_failed", error.to_string()))?;

    let tests_root = project_root_path.join("casebook").join("tests");
    let relative_path = case_path
        .strip_prefix(&tests_root)
        .map(normalize_path)
        .map_err(|_| app_error("case.outside_tests_root"))?;

    let refreshed_content = fs::read_to_string(&case_path)
        .map_err(|error| app_error_with_detail("case.reload_failed", error.to_string()))?;
    let created_at = git_created_at(&project_root_path, &case_path);
    let (updated_at, updated_at_source) = get_updated_at(&project_root_path, &case_path);

    Ok(ScannedCase {
        case_id: relative_path.clone(),
        relative_path,
        absolute_path: case_path.to_string_lossy().into_owned(),
        content: refreshed_content,
        created_at,
        updated_at,
        updated_at_source,
    })
}

fn collect_markdown_files(root: &Path, files: &mut Vec<PathBuf>, errors: &mut Vec<ScanError>) {
    let entries = match fs::read_dir(root) {
        Ok(entries) => entries,
        Err(error) => {
            errors.push(ScanError {
                code: "scan.read_directory_failed".to_string(),
                path: root.to_string_lossy().into_owned(),
                detail: Some(error.to_string()),
            });
            return;
        }
    };

    for entry in entries {
        let entry = match entry {
            Ok(entry) => entry,
            Err(error) => {
                errors.push(ScanError {
                    code: "scan.read_directory_entry_failed".to_string(),
                    path: root.to_string_lossy().into_owned(),
                    detail: Some(error.to_string()),
                });
                continue;
            }
        };

        let path = entry.path();

        if path.is_dir() {
            collect_markdown_files(&path, files, errors);
            continue;
        }

        let is_markdown = path
            .extension()
            .and_then(|extension| extension.to_str())
            .map(|extension| extension.eq_ignore_ascii_case("md"))
            .unwrap_or(false);

        if is_markdown {
            files.push(path);
        }
    }
}

fn get_updated_at(project_root: &Path, file_path: &Path) -> (Option<u64>, UpdatedAtSource) {
    if let Some(timestamp) = git_updated_at(project_root, file_path) {
        return (Some(timestamp), UpdatedAtSource::Git);
    }

    (
        filesystem_updated_at(file_path),
        UpdatedAtSource::Filesystem,
    )
}

fn git_updated_at(project_root: &Path, file_path: &Path) -> Option<u64> {
    let relative_path = file_path.strip_prefix(project_root).ok()?;
    let output = Command::new("git")
        .arg("-C")
        .arg(project_root)
        .args(["log", "-1", "--format=%ct", "--"])
        .arg(relative_path)
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let timestamp = String::from_utf8(output.stdout).ok()?;
    let seconds = timestamp.trim().parse::<u64>().ok()?;
    Some(seconds.saturating_mul(1000))
}

fn git_created_at(project_root: &Path, file_path: &Path) -> Option<u64> {
    let relative_path = file_path.strip_prefix(project_root).ok()?;
    let output = Command::new("git")
        .arg("-C")
        .arg(project_root)
        .args(["log", "--follow", "--format=%ct", "--"])
        .arg(relative_path)
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let timestamps = String::from_utf8(output.stdout).ok()?;
    let first_seen = timestamps
        .lines()
        .rev()
        .find(|line| !line.trim().is_empty())?;
    let seconds = first_seen.trim().parse::<u64>().ok()?;
    Some(seconds.saturating_mul(1000))
}

fn filesystem_updated_at(file_path: &Path) -> Option<u64> {
    let metadata = fs::metadata(file_path).ok()?;
    let modified = metadata.modified().ok()?;
    let duration = modified.duration_since(UNIX_EPOCH).ok()?;
    Some(duration.as_millis() as u64)
}

fn normalize_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn ensure_casebook_skeleton(project_root: &Path) -> AppResult<()> {
    let casebook_root = project_root.join("casebook");
    let tests_root = casebook_root.join("tests");
    let config_path = casebook_root.join("config.yml");
    let agents_path = casebook_root.join("AGENTS.md");

    ensure_directory(&casebook_root, "casebook root")?;
    ensure_directory(&tests_root, "casebook tests directory")?;
    ensure_file_with_content(&config_path, DEFAULT_CONFIG_CONTENT, "casebook config")?;
    ensure_file_with_content(&agents_path, DEFAULT_AGENTS_CONTENT, "casebook agents spec")?;

    Ok(())
}

fn ensure_directory(path: &Path, _label: &str) -> AppResult<()> {
    if path.exists() {
        if path.is_dir() {
            return Ok(());
        }

        return Err(app_error_with_path(
            "bootstrap.directory_expected",
            path.to_string_lossy().into_owned(),
        ));
    }

    fs::create_dir_all(path)
        .map_err(|error| app_error_with_detail("bootstrap.create_directory_failed", error.to_string()))
}

fn ensure_file_with_content(path: &Path, content: &str, _label: &str) -> AppResult<()> {
    if path.exists() {
        if path.is_file() {
            return Ok(());
        }

        return Err(app_error_with_path(
            "bootstrap.file_expected",
            path.to_string_lossy().into_owned(),
        ));
    }

    fs::write(path, content)
        .map_err(|error| app_error_with_detail("bootstrap.create_file_failed", error.to_string()))
}

fn read_config(casebook_root: &Path) -> Result<(Option<String>, Vec<StatusConfig>), ScanError> {
    let config_path = casebook_root.join("config.yml");
    if !config_path.exists() {
        return Err(scan_error(
            "config.missing",
            config_path.to_string_lossy().into_owned(),
            Some("config.yml is required".to_string()),
        ));
    }

    let content = fs::read_to_string(&config_path)
        .map_err(|error| scan_error(
            "config.read_failed",
            config_path.to_string_lossy().into_owned(),
            Some(error.to_string()),
        ))?;
    let config: CasebookConfig = serde_yaml::from_str(&content).map_err(|error| {
        scan_error(
            "config.invalid",
            config_path.to_string_lossy().into_owned(),
            Some(error.to_string()),
        )
    })?;

    // 检查是否有状态配置
    let statuses = config.statuses.ok_or_else(|| {
        scan_error(
            "config.missing_statuses",
            config_path.to_string_lossy().into_owned(),
            Some("statuses configuration is required in config.yml".to_string()),
        )
    })?;

    // 验证状态配置不为空
    if statuses.is_empty() {
        return Err(scan_error(
            "config.empty_statuses",
            config_path.to_string_lossy().into_owned(),
            Some("statuses configuration cannot be empty".to_string()),
        ));
    }

    let tests_alias = config.tests_alias.and_then(|value| {
        let trimmed = value.trim().to_string();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    }).or(Some(DEFAULT_TESTS_ALIAS.to_string()));

    Ok((tests_alias, statuses))
}

fn normalize_case_status(status: &str, allowed_statuses: &[String]) -> Option<String> {
    let trimmed = status.trim();
    if allowed_statuses.contains(&trimmed.to_string()) {
        return Some(trimmed.to_string());
    }
    // 支持中文旧状态映射
    let legacy_map: std::collections::HashMap<&str, &str> = [
        ("待处理", "todo"),
        ("已通过", "pass"),
        ("已阻塞", "blocked"),
    ].into_iter().collect();
    legacy_map.get(trimmed).map(|&s| s.to_string())
}

fn validate_case_status(status: &str, allowed_statuses: &[String]) -> Result<String, String> {
    normalize_case_status(status, allowed_statuses)
        .ok_or_else(|| format!("Unsupported case status: {status}"))
}

fn map_update_case_status_error(error: &str, status: &str) -> AppError {
    match error {
        "Invalid frontmatter block" => app_error("frontmatter.invalid_block"),
        _ if error.starts_with("Unsupported case status:") => {
            app_error_with_detail("case_status.unsupported", status.to_string())
        }
        _ => app_error_with_detail("fallback.unknown", error.to_string()),
    }
}

fn update_case_status_in_markdown(content: &str, status: &str, allowed_statuses: &[String]) -> Result<String, String> {
    let normalized_status = validate_case_status(status, allowed_statuses)?;

    match split_frontmatter(content)? {
        Some((frontmatter, body)) => {
            match parse_frontmatter_mapping(&frontmatter) {
                Ok(mut mapping) => {
                    mapping.insert(
                        Value::String("status".to_string()),
                        Value::String(normalized_status.to_string()),
                    );
                    let serialized = serde_yaml::to_string(&Value::Mapping(mapping))
                        .map_err(|error| error.to_string())?;
                    // serde_yaml adds a trailing newline, so we don't need an extra one
                    Ok(format!("---\n{}---\n{}", serialized, body))
                }
                Err(_) => {
                    let patched_frontmatter =
                        update_status_in_raw_frontmatter(&frontmatter, &normalized_status);
                    Ok(format!("---\n{}---\n{}", patched_frontmatter, body))
                }
            }
        }
        None => Ok(format!("---\nstatus: {}\n---\n\n{}", normalized_status, content)),
    }
}

fn update_status_in_raw_frontmatter(frontmatter: &str, status: &str) -> String {
    let mut lines = Vec::new();
    let mut replaced = false;

    for line in frontmatter.lines() {
        let trimmed = line.trim_start();
        let indent_len = line.len() - trimmed.len();
        let is_top_level_status = indent_len == 0 && trimmed.starts_with("status:");

        if is_top_level_status {
            lines.push(format!("status: {status}"));
            replaced = true;
        } else {
            lines.push(line.to_string());
        }
    }

    if !replaced {
        lines.push(format!("status: {status}"));
    }

    lines.join("\n")
}

fn split_frontmatter(content: &str) -> Result<Option<(String, String)>, String> {
    // Handle both LF and CRLF line endings
    let normalized = content.replace("\r\n", "\n");

    if !normalized.starts_with("---\n") {
        return Ok(None);
    }

    let rest = &normalized[4..];
    if let Some(index) = rest.find("\n---\n") {
        let frontmatter = rest[..index].to_string();
        let body = rest[index + 5..].to_string();
        return Ok(Some((frontmatter, body)));
    }

    if let Some(frontmatter) = rest.strip_suffix("\n---") {
        return Ok(Some((frontmatter.to_string(), String::new())));
    }

    // Handle case where closing --- is at the end without trailing newline
    if let Some(index) = rest.find("\n---") {
        let frontmatter = rest[..index].to_string();
        let body = rest[index + 4..].to_string();
        return Ok(Some((frontmatter, body)));
    }

    Err("Invalid frontmatter block".to_string())
}

fn parse_frontmatter_mapping(frontmatter: &str) -> Result<Mapping, String> {
    let parsed: Value =
        serde_yaml::from_str(frontmatter).map_err(|error| format!("Invalid frontmatter YAML: {error}"))?;

    match parsed {
        Value::Mapping(mapping) => Ok(mapping),
        Value::Null => Ok(Mapping::new()),
        _ => Err("Frontmatter must be a YAML object".to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::{scan_casebook, update_case_status_in_markdown, DEFAULT_AGENTS_CONTENT, DEFAULT_CONFIG_CONTENT};
    use std::{
        fs,
        path::{Path, PathBuf},
        sync::atomic::{AtomicU64, Ordering},
        time::{SystemTime, UNIX_EPOCH},
    };

    static TEST_DIR_COUNTER: AtomicU64 = AtomicU64::new(0);

    struct TempProjectDir {
        path: PathBuf,
    }

    impl TempProjectDir {
        fn new() -> Self {
            let unique = format!(
                "casebook-test-{}-{}",
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap()
                    .as_nanos(),
                TEST_DIR_COUNTER.fetch_add(1, Ordering::Relaxed)
            );
            let path = std::env::temp_dir().join(unique);
            fs::create_dir_all(&path).unwrap();
            Self { path }
        }

        fn path(&self) -> &Path {
            &self.path
        }
    }

    impl Drop for TempProjectDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    #[test]
    fn updates_status_in_valid_frontmatter() {
        let content = "---\ntitle: Example\nstatus: todo\n---\n\nBody\n";
        let allowed = vec!["todo".to_string(), "pass".to_string(), "blocked".to_string()];
        let updated = update_case_status_in_markdown(content, "pass", &allowed).unwrap();

        assert!(updated.contains("status: pass"));
        assert!(updated.contains("title: Example"));
        assert!(updated.ends_with("---\n\nBody\n"));
    }

    #[test]
    fn patches_status_in_invalid_frontmatter_without_rewriting_other_fields() {
        let content = "---\nid: CB-PARSE-004\nbroken: [unterminated\n---\n\nBody\n";
        let allowed = vec!["todo".to_string(), "pass".to_string(), "blocked".to_string()];
        let updated = update_case_status_in_markdown(content, "blocked", &allowed).unwrap();

        assert!(updated.contains("broken: [unterminated"));
        assert!(updated.contains("status: blocked"));
        assert!(updated.ends_with("---\n\nBody\n"));
    }

    #[test]
    fn replaces_existing_top_level_status_in_invalid_frontmatter() {
        let content = "---\nstatus: todo\nbroken: [unterminated\n---\n\nBody\n";
        let allowed = vec!["todo".to_string(), "pass".to_string(), "blocked".to_string()];
        let updated = update_case_status_in_markdown(content, "pass", &allowed).unwrap();

        assert!(updated.contains("status: pass"));
        assert!(!updated.contains("status: todo"));
        assert!(updated.contains("broken: [unterminated"));
    }

    #[test]
    fn returns_error_for_unclosed_frontmatter() {
        let content = "---\ntitle: Example\nstatus: todo\nBody\n";
        let allowed = vec!["todo".to_string(), "pass".to_string(), "blocked".to_string()];
        let error = update_case_status_in_markdown(content, "pass", &allowed).unwrap_err();

        assert_eq!(error, "Invalid frontmatter block");
    }

    #[test]
    fn normalizes_legacy_chinese_status_to_english() {
        let content = "---\ntitle: Example\nstatus: 待处理\n---\n\nBody\n";
        let allowed = vec!["todo".to_string(), "pass".to_string(), "blocked".to_string()];
        let updated = update_case_status_in_markdown(content, "已通过", &allowed).unwrap();

        assert!(updated.contains("status: pass"));
        assert!(!updated.contains("status: 待处理"));
    }

    #[test]
    fn scan_casebook_bootstraps_missing_casebook_directory() {
        let project = TempProjectDir::new();

        let result = scan_casebook(project.path().to_string_lossy().into_owned()).unwrap();

        let casebook_root = project.path().join("casebook");
        let tests_root = casebook_root.join("tests");
        let config_path = casebook_root.join("config.yml");
        let agents_path = casebook_root.join("AGENTS.md");

        assert!(casebook_root.is_dir());
        assert!(tests_root.is_dir());
        assert_eq!(fs::read_to_string(&config_path).unwrap(), DEFAULT_CONFIG_CONTENT);
        assert_eq!(fs::read_to_string(&agents_path).unwrap(), DEFAULT_AGENTS_CONTENT);
        assert_eq!(result.tests_root, Some(tests_root.to_string_lossy().into_owned()));
        assert_eq!(result.tests_alias, Some("用例库".to_string()));
        assert!(result.cases.is_empty());
        assert!(result.errors.is_empty());
    }

    #[test]
    fn scan_casebook_only_backfills_missing_casebook_files() {
        let project = TempProjectDir::new();
        let casebook_root = project.path().join("casebook");
        let tests_root = casebook_root.join("tests");
        let config_path = casebook_root.join("config.yml");
        let agents_path = casebook_root.join("AGENTS.md");
        let existing_agents = "# Existing project conventions\n";

        fs::create_dir_all(&tests_root).unwrap();
        fs::write(&agents_path, existing_agents).unwrap();

        let result = scan_casebook(project.path().to_string_lossy().into_owned()).unwrap();

        assert_eq!(fs::read_to_string(&config_path).unwrap(), DEFAULT_CONFIG_CONTENT);
        assert_eq!(fs::read_to_string(&agents_path).unwrap(), existing_agents);
        assert_eq!(result.tests_alias, Some("用例库".to_string()));
        assert!(result.errors.is_empty());
    }

    #[test]
    fn scan_casebook_preserves_existing_config_and_alias() {
        let project = TempProjectDir::new();
        let casebook_root = project.path().join("casebook");
        let tests_root = casebook_root.join("tests");
        let config_path = casebook_root.join("config.yml");
        let custom_config = r#"tests_alias: 自定义用例
statuses:
  - id: todo
    label:
      en: Todo
      zh-CN: 待处理
    color: '#FFD400'
"#;

        fs::create_dir_all(&tests_root).unwrap();
        fs::write(&config_path, custom_config).unwrap();

        let result = scan_casebook(project.path().to_string_lossy().into_owned()).unwrap();

        assert_eq!(fs::read_to_string(&config_path).unwrap(), custom_config);
        assert_eq!(result.tests_alias, Some("自定义用例".to_string()));
        assert!(!result.statuses.is_empty());
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![scan_casebook, update_case_status])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
