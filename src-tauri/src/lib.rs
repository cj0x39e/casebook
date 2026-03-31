use serde::{Deserialize, Serialize};
use serde_yaml::{Mapping, Value};
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
    time::UNIX_EPOCH,
};

const ALLOWED_CASE_STATUSES: [&str; 4] = ["待处理", "进行中", "已通过", "已阻塞"];

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ScanError {
    path: String,
    message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ScannedCase {
    case_id: String,
    relative_path: String,
    absolute_path: String,
    content: String,
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
    cases: Vec<ScannedCase>,
    errors: Vec<ScanError>,
}

#[derive(Debug, Deserialize)]
struct CasebookConfig {
    tests_alias: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "lowercase")]
enum UpdatedAtSource {
    Git,
    Filesystem,
}

#[tauri::command]
fn scan_casebook(project_root: String) -> Result<ScanResult, String> {
    let project_root_path = PathBuf::from(&project_root);

    if !project_root_path.exists() {
        return Err("Selected project directory does not exist".to_string());
    }

    if !project_root_path.is_dir() {
        return Err("Selected path is not a directory".to_string());
    }

    let casebook_root = project_root_path.join("casebook");
    let tests_root = casebook_root.join("tests");
    let mut config_error = None;
    let tests_alias = match read_tests_alias(&casebook_root) {
        Ok(alias) => alias,
        Err(error) => {
            config_error = Some(error);
            None
        }
    };
    let mut result = ScanResult {
        project_root,
        casebook_root: Some(casebook_root.to_string_lossy().into_owned()),
        tests_root: None,
        tests_alias,
        cases: Vec::new(),
        errors: Vec::new(),
    };

    if let Some(error) = config_error {
        result.errors.push(ScanError {
            path: casebook_root.join("config.yml").to_string_lossy().into_owned(),
            message: error,
        });
    }

    if !tests_root.exists() || !tests_root.is_dir() {
        result.errors.push(ScanError {
            path: tests_root.to_string_lossy().into_owned(),
            message: "Missing casebook/tests directory".to_string(),
        });
        return Ok(result);
    }

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
                    path: absolute_path.clone(),
                    message: format!("Failed to derive case path: {error}"),
                });
                continue;
            }
        };

        let case_id = relative_path.clone();
        let content = match fs::read_to_string(&file_path) {
            Ok(content) => content,
            Err(error) => {
                result.errors.push(ScanError {
                    path: absolute_path.clone(),
                    message: format!("Failed to read file: {error}"),
                });
                continue;
            }
        };

        let (updated_at, updated_at_source) = get_updated_at(&project_root_path, &file_path);

        result.cases.push(ScannedCase {
            case_id,
            relative_path,
            absolute_path,
            content,
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
) -> Result<ScannedCase, String> {
    validate_case_status(&status)?;

    let project_root_path = PathBuf::from(&project_root);
    let case_path = PathBuf::from(&case_path);

    if !case_path.exists() {
        return Err("Selected case file does not exist".to_string());
    }

    if !case_path.is_file() {
        return Err("Selected case path is not a file".to_string());
    }

    let original_content = fs::read_to_string(&case_path)
        .map_err(|error| format!("Failed to read case file: {error}"))?;
    let updated_content = update_case_status_in_markdown(&original_content, &status)?;

    fs::write(&case_path, updated_content)
        .map_err(|error| format!("Failed to write case file: {error}"))?;

    let tests_root = project_root_path.join("casebook").join("tests");
    let relative_path = case_path
        .strip_prefix(&tests_root)
        .map(normalize_path)
        .map_err(|_| "Selected case file is outside casebook/tests".to_string())?;

    let refreshed_content = fs::read_to_string(&case_path)
        .map_err(|error| format!("Failed to reload updated case file: {error}"))?;
    let (updated_at, updated_at_source) = get_updated_at(&project_root_path, &case_path);

    Ok(ScannedCase {
        case_id: relative_path.clone(),
        relative_path,
        absolute_path: case_path.to_string_lossy().into_owned(),
        content: refreshed_content,
        updated_at,
        updated_at_source,
    })
}

fn collect_markdown_files(root: &Path, files: &mut Vec<PathBuf>, errors: &mut Vec<ScanError>) {
    let entries = match fs::read_dir(root) {
        Ok(entries) => entries,
        Err(error) => {
            errors.push(ScanError {
                path: root.to_string_lossy().into_owned(),
                message: format!("Failed to read directory: {error}"),
            });
            return;
        }
    };

    for entry in entries {
        let entry = match entry {
            Ok(entry) => entry,
            Err(error) => {
                errors.push(ScanError {
                    path: root.to_string_lossy().into_owned(),
                    message: format!("Failed to read directory entry: {error}"),
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

fn filesystem_updated_at(file_path: &Path) -> Option<u64> {
    let metadata = fs::metadata(file_path).ok()?;
    let modified = metadata.modified().ok()?;
    let duration = modified.duration_since(UNIX_EPOCH).ok()?;
    Some(duration.as_millis() as u64)
}

fn normalize_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn read_tests_alias(casebook_root: &Path) -> Result<Option<String>, String> {
    let config_path = casebook_root.join("config.yml");
    if !config_path.exists() {
        return Ok(None);
    }

    let content = fs::read_to_string(&config_path)
        .map_err(|error| format!("Failed to read config: {error}"))?;
    let config: CasebookConfig =
        serde_yaml::from_str(&content).map_err(|error| format!("Invalid config.yml: {error}"))?;

    Ok(config.tests_alias.and_then(|value| {
        let trimmed = value.trim().to_string();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    }))
}

fn validate_case_status(status: &str) -> Result<(), String> {
    if ALLOWED_CASE_STATUSES.contains(&status) {
        Ok(())
    } else {
        Err(format!("Unsupported case status: {status}"))
    }
}

fn update_case_status_in_markdown(content: &str, status: &str) -> Result<String, String> {
    match split_frontmatter(content)? {
        Some((frontmatter, body)) => {
            match parse_frontmatter_mapping(&frontmatter) {
                Ok(mut mapping) => {
                    mapping.insert(
                        Value::String("status".to_string()),
                        Value::String(status.to_string()),
                    );
                    let serialized = serde_yaml::to_string(&Value::Mapping(mapping))
                        .map_err(|error| error.to_string())?;
                    // serde_yaml adds a trailing newline, so we don't need an extra one
                    Ok(format!("---\n{}---\n{}", serialized, body))
                }
                Err(_) => {
                    let patched_frontmatter = update_status_in_raw_frontmatter(&frontmatter, status);
                    Ok(format!("---\n{}---\n{}", patched_frontmatter, body))
                }
            }
        }
        None => Ok(format!("---\nstatus: {}\n---\n\n{}", status, content)),
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
    use super::update_case_status_in_markdown;

    #[test]
    fn updates_status_in_valid_frontmatter() {
        let content = "---\ntitle: Example\nstatus: 待处理\n---\n\nBody\n";
        let updated = update_case_status_in_markdown(content, "已通过").unwrap();

        assert!(updated.contains("status: 已通过"));
        assert!(updated.contains("title: Example"));
        assert!(updated.ends_with("---\n\nBody\n"));
    }

    #[test]
    fn patches_status_in_invalid_frontmatter_without_rewriting_other_fields() {
        let content = "---\nid: CB-PARSE-004\nbroken: [unterminated\n---\n\nBody\n";
        let updated = update_case_status_in_markdown(content, "已阻塞").unwrap();

        assert!(updated.contains("broken: [unterminated"));
        assert!(updated.contains("status: 已阻塞"));
        assert!(updated.ends_with("---\n\nBody\n"));
    }

    #[test]
    fn replaces_existing_top_level_status_in_invalid_frontmatter() {
        let content = "---\nstatus: 待处理\nbroken: [unterminated\n---\n\nBody\n";
        let updated = update_case_status_in_markdown(content, "进行中").unwrap();

        assert!(updated.contains("status: 进行中"));
        assert!(!updated.contains("status: 待处理"));
        assert!(updated.contains("broken: [unterminated"));
    }

    #[test]
    fn returns_error_for_unclosed_frontmatter() {
        let content = "---\ntitle: Example\nstatus: 待处理\nBody\n";
        let error = update_case_status_in_markdown(content, "已通过").unwrap_err();

        assert_eq!(error, "Invalid frontmatter block");
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
