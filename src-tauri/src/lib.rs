use serde::Serialize;
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
    time::UNIX_EPOCH,
};
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

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
    cases: Vec<ScannedCase>,
    errors: Vec<ScanError>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "lowercase")]
enum UpdatedAtSource {
    Git,
    Filesystem,
}

#[tauri::command]
fn select_project_directory(app: AppHandle) -> Result<Option<String>, String> {
    let Some(path) = app.dialog().file().blocking_pick_folder() else {
        return Ok(None);
    };

    let path = path
        .into_path()
        .map_err(|_| "The selected folder could not be converted to a local path".to_string())?;

    Ok(Some(path.to_string_lossy().into_owned()))
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
    let mut result = ScanResult {
        project_root,
        casebook_root: Some(casebook_root.to_string_lossy().into_owned()),
        tests_root: None,
        cases: Vec::new(),
        errors: Vec::new(),
    };

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
        .invoke_handler(tauri::generate_handler![
            select_project_directory,
            scan_casebook
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
