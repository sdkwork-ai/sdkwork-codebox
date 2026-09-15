use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use crate::error::AppError;

const APP_CONFIG_NAMESPACE_DIR: &str = ".sdkwork";
const APP_CONFIG_PRODUCT_DIR: &str = "codebox";

/// 获取用户主目录，带回退和日志
///
/// ## Windows 注意事项
///
/// - `dirs::home_dir()` 在 Windows 上使用 `SHGetKnownFolderPath(FOLDERID_Profile)`，
///   返回的是真实用户目录（类似 `C:\\Users\\Alice`），与 v3.10.2 行为一致。
/// - 不要直接使用 `HOME` 环境变量：它可能由 Git/Cygwin/MSYS 等第三方工具注入，
///   且不一定等于用户目录，历史版本曾因此落到错误的 `.codebox/codebox.db` 路径，
///   从而“看起来像数据丢失”。
///
/// ## 测试隔离
///
/// 为了让 Windows CI/本地测试能稳定隔离真实用户数据，可通过 `CODEBOX_TEST_HOME`
/// 显式覆盖 home dir（仅用于测试/调试场景）。
pub fn get_home_dir() -> PathBuf {
    if let Ok(home) = std::env::var("CODEBOX_TEST_HOME") {
        let trimmed = home.trim();
        if !trimmed.is_empty() {
            return PathBuf::from(trimmed);
        }
    }

    dirs::home_dir().unwrap_or_else(|| {
        log::warn!("无法获取用户主目录，回退到当前目录");
        PathBuf::from(".")
    })
}

/// 获取 Claude Code 配置目录路径
pub fn get_claude_config_dir() -> PathBuf {
    if let Some(custom) = crate::settings::get_claude_override_dir() {
        return custom;
    }

    get_home_dir().join(".claude")
}

/// 默认 Claude MCP 配置文件路径 (~/.claude.json)
pub fn get_default_claude_mcp_path() -> PathBuf {
    get_home_dir().join(".claude.json")
}

fn derive_mcp_path_from_override(dir: &Path) -> Option<PathBuf> {
    let file_name = dir
        .file_name()
        .map(|name| name.to_string_lossy().to_string())?
        .trim()
        .to_string();
    if file_name.is_empty() {
        return None;
    }
    let parent = dir.parent().unwrap_or_else(|| Path::new(""));
    Some(parent.join(format!("{file_name}.json")))
}

/// 获取 Claude MCP 配置文件路径，若设置了目录覆盖则与覆盖目录同级
pub fn get_claude_mcp_path() -> PathBuf {
    if let Some(custom_dir) = crate::settings::get_claude_override_dir() {
        if let Some(path) = derive_mcp_path_from_override(&custom_dir) {
            return path;
        }
    }
    get_default_claude_mcp_path()
}

/// 获取 Claude Code 主配置文件路径
pub fn get_claude_settings_path() -> PathBuf {
    let dir = get_claude_config_dir();
    let settings = dir.join("settings.json");
    if settings.exists() {
        return settings;
    }
    // 兼容旧版命名：若存在旧文件则继续使用
    let legacy = dir.join("claude.json");
    if legacy.exists() {
        return legacy;
    }
    // 默认新建：回落到标准文件名 settings.json（不再生成 claude.json）
    settings
}

fn config_root_for_home(home: &Path) -> PathBuf {
    #[cfg(target_os = "macos")]
    {
        return home.join("Library").join("Application Support");
    }

    #[cfg(target_os = "windows")]
    {
        return home.join("AppData").join("Roaming");
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        return home.join(".config");
    }
}

fn get_legacy_platform_app_config_dir_for_home(home: &Path) -> PathBuf {
    config_root_for_home(home)
        .join("sdkwork")
        .join(APP_CONFIG_PRODUCT_DIR)
}

fn get_legacy_platform_app_config_dir() -> PathBuf {
    get_legacy_platform_app_config_dir_for_home(&get_home_dir())
}

fn get_legacy_default_app_config_dir() -> PathBuf {
    get_home_dir().join(".codebox")
}

#[cfg(windows)]
fn get_windows_home_env_legacy_app_config_dir() -> Option<PathBuf> {
    std::env::var("HOME")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .map(|path| path.join(".codebox"))
}

fn get_legacy_app_config_dir_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    let mut push_unique = |path: PathBuf| {
        if !candidates.iter().any(|item| item == &path) {
            candidates.push(path);
        }
    };

    push_unique(get_legacy_platform_app_config_dir());
    push_unique(get_legacy_default_app_config_dir());

    #[cfg(windows)]
    if let Some(legacy) = get_windows_home_env_legacy_app_config_dir() {
        push_unique(legacy);
    }

    candidates
}

fn copy_dir_recursive(source: &Path, target: &Path) -> Result<(), AppError> {
    fs::create_dir_all(target).map_err(|e| AppError::io(target, e))?;

    for entry in fs::read_dir(source).map_err(|e| AppError::io(source, e))? {
        let entry = entry.map_err(|e| AppError::io(source, e))?;
        let from = entry.path();
        let to = target.join(entry.file_name());
        let file_type = entry.file_type().map_err(|e| AppError::io(&from, e))?;

        if file_type.is_dir() {
            copy_dir_recursive(&from, &to)?;
            continue;
        }

        if file_type.is_symlink() {
            let metadata = fs::metadata(&from).map_err(|e| AppError::io(&from, e))?;
            if metadata.is_dir() {
                copy_dir_recursive(&from, &to)?;
                continue;
            }
        }

        if let Some(parent) = to.parent() {
            fs::create_dir_all(parent).map_err(|e| AppError::io(parent, e))?;
        }

        fs::copy(&from, &to).map_err(|e| AppError::IoContext {
            context: format!("复制目录内容失败 ({} -> {})", from.display(), to.display()),
            source: e,
        })?;
    }

    Ok(())
}

fn migrate_legacy_app_config_dir(legacy_dir: &Path, target_dir: &Path) -> Result<(), AppError> {
    if legacy_dir == target_dir || !legacy_dir.exists() || target_dir.exists() {
        return Ok(());
    }

    let parent = target_dir.parent().ok_or_else(|| {
        AppError::Config(format!("无效的目标配置目录: {}", target_dir.display()))
    })?;
    fs::create_dir_all(parent).map_err(|e| AppError::io(parent, e))?;

    match fs::rename(legacy_dir, target_dir) {
        Ok(()) => Ok(()),
        Err(rename_error) => {
            log::warn!(
                "移动旧配置目录失败，将尝试复制迁移: {} -> {} ({rename_error})",
                legacy_dir.display(),
                target_dir.display()
            );
            copy_dir_recursive(legacy_dir, target_dir).inspect_err(|_| {
                let _ = fs::remove_dir_all(target_dir);
            })
        }
    }
}

/// 获取平台默认的应用配置目录。
///
/// - Linux: `~/.sdkwork/codebox`
/// - macOS: `~/.sdkwork/codebox`
/// - Windows: `%USERPROFILE%\\.sdkwork\\codebox`
pub fn get_default_app_config_dir() -> PathBuf {
    get_home_dir()
        .join(APP_CONFIG_NAMESPACE_DIR)
        .join(APP_CONFIG_PRODUCT_DIR)
}

/// 获取应用配置目录路径。
///
/// 若用户设置了自定义目录，则优先使用覆盖目录；否则使用平台默认目录，
/// 并在首次访问时自动尝试从旧版 `~/.codebox` 与历史平台原生目录迁移。
pub fn get_app_config_dir() -> PathBuf {
    if let Some(custom) = crate::app_store::get_app_config_dir_override() {
        return custom;
    }

    let default_dir = get_default_app_config_dir();
    if default_dir.exists() {
        return default_dir;
    }

    for legacy_dir in get_legacy_app_config_dir_candidates() {
        if !legacy_dir.exists() || legacy_dir == default_dir {
            continue;
        }

        match migrate_legacy_app_config_dir(&legacy_dir, &default_dir) {
            Ok(()) if default_dir.exists() => {
                log::info!(
                    "已将旧配置目录迁移到平台默认目录: {} -> {}",
                    legacy_dir.display(),
                    default_dir.display()
                );
                return default_dir;
            }
            Ok(()) => {}
            Err(error) => {
                log::warn!(
                    "迁移旧配置目录失败，继续使用旧路径: {} ({error})",
                    legacy_dir.display()
                );
                if !default_dir.exists() {
                    return legacy_dir;
                }
            }
        }
    }

    default_dir
}

/// 获取应用配置文件路径
pub fn get_app_config_path() -> PathBuf {
    get_app_config_dir().join("config.json")
}

/// 清理供应商名称，确保文件名安全
#[allow(dead_code)]
pub fn sanitize_provider_name(name: &str) -> String {
    name.chars()
        .map(|c| match c {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '-',
            _ => c,
        })
        .collect::<String>()
        .to_lowercase()
}

/// 获取供应商配置文件路径
#[allow(dead_code)]
pub fn get_provider_config_path(provider_id: &str, provider_name: Option<&str>) -> PathBuf {
    let base_name = provider_name
        .map(sanitize_provider_name)
        .unwrap_or_else(|| sanitize_provider_name(provider_id));

    get_claude_config_dir().join(format!("settings-{base_name}.json"))
}

/// 读取 JSON 配置文件
pub fn read_json_file<T: for<'a> Deserialize<'a>>(path: &Path) -> Result<T, AppError> {
    if !path.exists() {
        return Err(AppError::Config(format!("文件不存在: {}", path.display())));
    }

    let content = fs::read_to_string(path).map_err(|e| AppError::io(path, e))?;

    serde_json::from_str(&content).map_err(|e| AppError::json(path, e))
}

/// 写入 JSON 配置文件
pub fn write_json_file<T: Serialize>(path: &Path, data: &T) -> Result<(), AppError> {
    // 确保目录存在
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| AppError::io(parent, e))?;
    }

    let json =
        serde_json::to_string_pretty(data).map_err(|e| AppError::JsonSerialize { source: e })?;

    atomic_write(path, json.as_bytes())
}

/// 原子写入文本文件（用于 TOML/纯文本）
pub fn write_text_file(path: &Path, data: &str) -> Result<(), AppError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| AppError::io(parent, e))?;
    }
    atomic_write(path, data.as_bytes())
}

/// 原子写入：写入临时文件后 rename 替换，避免半写状态
pub fn atomic_write(path: &Path, data: &[u8]) -> Result<(), AppError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| AppError::io(parent, e))?;
    }

    let parent = path
        .parent()
        .ok_or_else(|| AppError::Config("无效的路径".to_string()))?;
    let mut tmp = parent.to_path_buf();
    let file_name = path
        .file_name()
        .ok_or_else(|| AppError::Config("无效的文件名".to_string()))?
        .to_string_lossy()
        .to_string();
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    tmp.push(format!("{file_name}.tmp.{ts}"));

    {
        let mut f = fs::File::create(&tmp).map_err(|e| AppError::io(&tmp, e))?;
        f.write_all(data).map_err(|e| AppError::io(&tmp, e))?;
        f.flush().map_err(|e| AppError::io(&tmp, e))?;
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(meta) = fs::metadata(path) {
            let perm = meta.permissions().mode();
            let _ = fs::set_permissions(&tmp, fs::Permissions::from_mode(perm));
        }
    }

    #[cfg(windows)]
    {
        // Windows 上 rename 目标存在会失败，先移除再重命名（尽量接近原子性）
        if path.exists() {
            let _ = fs::remove_file(path);
        }
        fs::rename(&tmp, path).map_err(|e| AppError::IoContext {
            context: format!("原子替换失败: {} -> {}", tmp.display(), path.display()),
            source: e,
        })?;
    }

    #[cfg(not(windows))]
    {
        fs::rename(&tmp, path).map_err(|e| AppError::IoContext {
            context: format!("原子替换失败: {} -> {}", tmp.display(), path.display()),
            source: e,
        })?;
    }
    Ok(())
}

#[cfg(test)] // WORKSPACE-PATH:allow-fixture-block: this module is the file's #[cfg(test)] unit-test fixture data
mod tests {
    use super::*;
    use std::path::Path;
    use std::sync::{Mutex, OnceLock};

    fn config_test_mutex() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

    fn expected_test_app_config_dir(base: &Path) -> PathBuf {
        base.join(".sdkwork").join("codebox")
    }

    fn expected_legacy_platform_app_config_dir(base: &Path) -> PathBuf {
        get_legacy_platform_app_config_dir_for_home(base)
    }

    #[test]
    fn derive_mcp_path_from_override_preserves_folder_name() {
        let override_dir = PathBuf::from("/tmp/profile/.claude");
        let derived = derive_mcp_path_from_override(&override_dir)
            .expect("should derive path for nested dir");
        assert_eq!(derived, PathBuf::from("/tmp/profile/.claude.json"));
    }

    #[test]
    fn derive_mcp_path_from_override_handles_non_hidden_folder() {
        let override_dir = PathBuf::from("/data/claude-config");
        let derived = derive_mcp_path_from_override(&override_dir)
            .expect("should derive path for standard dir");
        assert_eq!(derived, PathBuf::from("/data/claude-config.json"));
    }

    #[test]
    fn derive_mcp_path_from_override_supports_relative_rootless_dir() {
        let override_dir = PathBuf::from("claude");
        let derived = derive_mcp_path_from_override(&override_dir)
            .expect("should derive path for single segment");
        assert_eq!(derived, PathBuf::from("claude.json"));
    }

    #[test]
    fn derive_mcp_path_from_root_like_dir_returns_none() {
        let override_dir = PathBuf::from("/");
        assert!(derive_mcp_path_from_override(&override_dir).is_none());
    }

    #[test]
    fn app_config_dir_uses_dot_sdkwork_namespace_under_home() {
        let _guard = config_test_mutex().lock().expect("lock config test");
        let temp = tempfile::tempdir().expect("create temp dir");
        let previous = std::env::var_os("CODEBOX_TEST_HOME");
        std::env::set_var("CODEBOX_TEST_HOME", temp.path());

        let dir = get_app_config_dir();

        match previous {
            Some(value) => std::env::set_var("CODEBOX_TEST_HOME", value),
            None => std::env::remove_var("CODEBOX_TEST_HOME"),
        }

        assert_eq!(dir, expected_test_app_config_dir(temp.path()));
    }

    #[test]
    fn app_config_dir_migrates_legacy_dot_codebox_directory() {
        let _guard = config_test_mutex().lock().expect("lock config test");
        let temp = tempfile::tempdir().expect("create temp dir");
        let previous = std::env::var_os("CODEBOX_TEST_HOME");
        std::env::set_var("CODEBOX_TEST_HOME", temp.path());

        let legacy_dir = temp.path().join(".codebox");
        std::fs::create_dir_all(&legacy_dir).expect("create legacy dir");
        std::fs::write(legacy_dir.join("config.json"), "{}").expect("write legacy config");

        let dir = get_app_config_dir();

        match previous {
            Some(value) => std::env::set_var("CODEBOX_TEST_HOME", value),
            None => std::env::remove_var("CODEBOX_TEST_HOME"),
        }

        let expected = expected_test_app_config_dir(temp.path());
        assert_eq!(dir, expected);
        assert!(expected.join("config.json").exists());
    }

    #[test]
    fn app_config_dir_migrates_previous_platform_sdkwork_directory() {
        let _guard = config_test_mutex().lock().expect("lock config test");
        let temp = tempfile::tempdir().expect("create temp dir");
        let previous = std::env::var_os("CODEBOX_TEST_HOME");
        std::env::set_var("CODEBOX_TEST_HOME", temp.path());

        let legacy_dir = expected_legacy_platform_app_config_dir(temp.path());
        std::fs::create_dir_all(&legacy_dir).expect("create legacy platform dir");
        std::fs::write(legacy_dir.join("config.json"), "{}").expect("write legacy config");

        let dir = get_app_config_dir();

        match previous {
            Some(value) => std::env::set_var("CODEBOX_TEST_HOME", value),
            None => std::env::remove_var("CODEBOX_TEST_HOME"),
        }

        let expected = expected_test_app_config_dir(temp.path());
        assert_eq!(dir, expected);
        assert!(expected.join("config.json").exists());
    }
}

/// 复制文件
pub fn copy_file(from: &Path, to: &Path) -> Result<(), AppError> {
    fs::copy(from, to).map_err(|e| AppError::IoContext {
        context: format!("复制文件失败 ({} -> {})", from.display(), to.display()),
        source: e,
    })?;
    Ok(())
}

/// 删除文件
pub fn delete_file(path: &Path) -> Result<(), AppError> {
    if path.exists() {
        fs::remove_file(path).map_err(|e| AppError::io(path, e))?;
    }
    Ok(())
}

/// 检查 Claude Code 配置状态
#[derive(Serialize, Deserialize)]
pub struct ConfigStatus {
    pub exists: bool,
    pub path: String,
}

/// 获取 Claude Code 配置状态
pub fn get_claude_config_status() -> ConfigStatus {
    let path = get_claude_settings_path();
    ConfigStatus {
        exists: path.exists(),
        path: path.to_string_lossy().to_string(),
    }
}
