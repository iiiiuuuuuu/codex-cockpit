use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

const APP_DIR_NAME: &str = "Airouter";
const RUNTIME_DIR_NAME: &str = "airouter";
const CONFIG_FILE: &str = "openai.json";
const CONFIG_TEMPLATE_FILE: &str = "openai.json.example";
const PID_FILE: &str = "openai.pid";
const LOG_FILE: &str = "openai.log";
const DEFAULT_PORT: u16 = 3009;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ServiceStatus {
    running: bool,
    pid: Option<u32>,
    port: Option<u16>,
    has_config: bool,
    config_valid: bool,
    admin_url: Option<String>,
    runtime_dir: String,
    message: String,
    logs: String,
}

#[derive(Debug, Deserialize)]
struct ConfigShape {
    port: Option<Value>,
    auth_token: Option<String>,
}

fn app_data_root() -> Result<PathBuf, String> {
    dirs::data_dir()
        .map(|dir| dir.join(APP_DIR_NAME).join(RUNTIME_DIR_NAME))
        .ok_or_else(|| "无法定位 macOS Application Support 目录".to_string())
}

fn resource_airouter_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let resolver = app.path();
    let resource_dir = resolver
        .resource_dir()
        .map_err(|error| format!("无法定位应用资源目录: {error}"))?;

    let candidates = [
        resource_dir.join("resources").join("airouter"),
        resource_dir.join("airouter"),
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("resources")
            .join("airouter"),
    ];

    candidates
        .into_iter()
        .find(|path| path.exists())
        .ok_or_else(|| "找不到 airouter bundled resources".to_string())
}

fn node_target_name() -> Result<&'static str, String> {
    if cfg!(target_arch = "aarch64") {
        Ok("node-aarch64-apple-darwin")
    } else if cfg!(target_arch = "x86_64") {
        Ok("node-x86_64-apple-darwin")
    } else {
        Err("当前 macOS 架构暂未内置 Node.js".to_string())
    }
}

fn node_sidecar_path(app: &AppHandle) -> Result<PathBuf, String> {
    let resolver = app.path();
    let resource_dir = resolver
        .resource_dir()
        .map_err(|error| format!("无法定位应用资源目录: {error}"))?;
    let current_exe_dir = std::env::current_exe()
        .ok()
        .and_then(|path| path.parent().map(Path::to_path_buf));
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let target_name = node_target_name()?;

    let mut candidates = vec![
        resource_dir.join("binaries").join("node"),
        resource_dir.join("binaries").join(target_name),
        resource_dir.join("node"),
        resource_dir.join(target_name),
        manifest_dir.join("binaries").join("node"),
        manifest_dir.join("binaries").join(target_name),
    ];

    if let Some(exe_dir) = current_exe_dir {
        candidates.push(exe_dir.join("node"));
        candidates.push(exe_dir.join(target_name));
        candidates.push(exe_dir.join("binaries").join("node"));
        candidates.push(exe_dir.join("binaries").join(target_name));
    }

    candidates
        .into_iter()
        .find(|path| path.exists())
        .ok_or_else(|| format!("找不到 bundled Node.js sidecar: {target_name}"))
}

fn copy_dir_if_missing(source: &Path, destination: &Path) -> Result<(), String> {
    if destination.exists() {
        return Ok(());
    }

    let parent = destination
        .parent()
        .ok_or_else(|| format!("无法定位目标父目录: {}", destination.display()))?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("无法创建目录 {}: {error}", parent.display()))?;

    copy_dir_recursive(source, destination).map_err(|error| {
        format!(
            "复制运行资源失败 {} -> {}: {error}",
            source.display(),
            destination.display()
        )
    })
}

fn copy_dir_recursive(source: &Path, destination: &Path) -> io::Result<()> {
    fs::create_dir_all(destination)?;
    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        let target = destination.join(entry.file_name());
        if file_type.is_dir() {
            copy_dir_recursive(&entry.path(), &target)?;
        } else if file_type.is_file() {
            fs::copy(entry.path(), target)?;
        }
    }
    Ok(())
}

fn ensure_runtime(app: &AppHandle) -> Result<PathBuf, String> {
    let runtime_dir = app_data_root()?;
    if !runtime_dir.exists() {
        let resources = resource_airouter_dir(app)?;
        copy_dir_if_missing(&resources, &runtime_dir)?;
    }

    let config_path = runtime_dir.join(CONFIG_FILE);
    let template_path = runtime_dir.join(CONFIG_TEMPLATE_FILE);
    if !config_path.exists() && template_path.exists() {
        fs::copy(&template_path, &config_path).map_err(|error| {
            format!(
                "无法从模板创建配置 {} -> {}: {error}",
                template_path.display(),
                config_path.display()
            )
        })?;
    }

    Ok(runtime_dir)
}

fn read_pid(runtime_dir: &Path) -> Option<u32> {
    let raw = fs::read_to_string(runtime_dir.join(PID_FILE)).ok()?;
    raw.trim().parse::<u32>().ok()
}

fn process_exists(pid: u32) -> bool {
    Command::new("kill")
        .arg("-0")
        .arg(pid.to_string())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

fn parse_port(value: Option<Value>) -> Option<u16> {
    match value? {
        Value::Number(number) => number.as_u64().and_then(|port| u16::try_from(port).ok()),
        Value::String(text) => text.trim().parse::<u16>().ok(),
        _ => None,
    }
}

fn read_config(runtime_dir: &Path) -> Result<ConfigShape, String> {
    let raw = fs::read_to_string(runtime_dir.join(CONFIG_FILE))
        .map_err(|error| format!("无法读取 openai.json: {error}"))?;
    serde_json::from_str(&raw).map_err(|error| format!("openai.json 解析失败: {error}"))
}

fn build_admin_url(port: u16, auth_token: Option<&str>) -> String {
    let base = format!("http://localhost:{port}/admin/configs");
    match auth_token.filter(|token| !token.trim().is_empty()) {
        Some(token) => format!("{base}?auth_token={token}"),
        None => base,
    }
}

fn tail_text(path: &Path, limit: usize) -> String {
    let Ok(raw) = fs::read_to_string(path) else {
        return "暂无日志".to_string();
    };

    let max = limit.max(1);
    let mut lines = raw.lines().rev().take(max).collect::<Vec<_>>();
    lines.reverse();
    lines.join("\n")
}

fn status_for_runtime(runtime_dir: PathBuf) -> ServiceStatus {
    let pid = read_pid(&runtime_dir);
    let running = pid.map(process_exists).unwrap_or(false);
    let has_config = runtime_dir.join(CONFIG_FILE).exists();
    let logs = tail_text(&runtime_dir.join(LOG_FILE), 160);

    let mut port = None;
    let mut admin_url = None;
    let mut config_valid = false;
    let mut message = if running {
        "服务运行中".to_string()
    } else {
        "服务未运行".to_string()
    };

    if has_config {
        match read_config(&runtime_dir) {
            Ok(config) => {
                config_valid = true;
                let selected_port = parse_port(config.port).unwrap_or(DEFAULT_PORT);
                port = Some(selected_port);
                admin_url = Some(build_admin_url(selected_port, config.auth_token.as_deref()));
            }
            Err(error) => {
                message = error;
            }
        }
    } else {
        message = "运行目录中缺少 openai.json".to_string();
    }

    ServiceStatus {
        running,
        pid,
        port,
        has_config,
        config_valid,
        admin_url,
        runtime_dir: runtime_dir.display().to_string(),
        message,
        logs,
    }
}

fn run_service_command(app: &AppHandle, action: &str) -> Result<(), String> {
    let runtime_dir = ensure_runtime(app)?;
    let node = node_sidecar_path(app)?;
    let mut command = Command::new(node);
    command.current_dir(&runtime_dir).arg("run.js");
    if action != "start" {
        command.arg(action);
    }
    command.env("AIROUTER_FORCE_INTERACTIVE", "0");
    command.env("RUN_STARTUP_CHECK_DELAY_MS", "1500");
    command.env("RUN_STARTUP_LOG_WAIT_MS", "800");
    command.env("RUN_STOP_WAIT_TIMEOUT_MS", "2500");
    command.stdout(Stdio::piped());
    command.stderr(Stdio::piped());

    let output = command
        .output()
        .map_err(|error| format!("执行服务命令失败: {error}"))?;

    if output.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);
    Err(format!("服务命令失败: {stdout}{stderr}"))
}

#[tauri::command]
fn get_status(app: AppHandle) -> Result<ServiceStatus, String> {
    let runtime_dir = ensure_runtime(&app)?;
    Ok(status_for_runtime(runtime_dir))
}

#[tauri::command]
fn start_service(app: AppHandle) -> Result<ServiceStatus, String> {
    run_service_command(&app, "start")?;
    get_status(app)
}

#[tauri::command]
fn stop_service(app: AppHandle) -> Result<ServiceStatus, String> {
    run_service_command(&app, "stop")?;
    get_status(app)
}

#[tauri::command]
fn restart_service(app: AppHandle) -> Result<ServiceStatus, String> {
    run_service_command(&app, "restart")?;
    get_status(app)
}

#[tauri::command]
fn read_recent_logs(app: AppHandle, limit: Option<usize>) -> Result<String, String> {
    let runtime_dir = ensure_runtime(&app)?;
    Ok(tail_text(&runtime_dir.join(LOG_FILE), limit.unwrap_or(160)))
}

#[tauri::command]
fn open_admin_window(app: AppHandle) -> Result<(), String> {
    let status = get_status(app.clone())?;
    let url = status
        .admin_url
        .ok_or_else(|| "管理地址不可用，请先检查配置".to_string())?;
    let parsed = tauri::Url::parse(&url).map_err(|error| format!("管理地址无效: {error}"))?;

    if let Some(window) = app.get_webview_window("admin") {
        window
            .set_focus()
            .map_err(|error| format!("无法聚焦管理窗口: {error}"))?;
        window
            .navigate(parsed)
            .map_err(|error| format!("无法打开管理页: {error}"))?;
        return Ok(());
    }

    WebviewWindowBuilder::new(&app, "admin", WebviewUrl::External(parsed))
        .title("Airouter Admin")
        .inner_size(1240.0, 820.0)
        .build()
        .map_err(|error| format!("无法创建管理窗口: {error}"))?;
    Ok(())
}

#[tauri::command]
fn open_admin_in_browser(app: AppHandle) -> Result<(), String> {
    let status = get_status(app.clone())?;
    let url = status
        .admin_url
        .ok_or_else(|| "管理地址不可用，请先检查配置".to_string())?;
    let result = Command::new("open")
        .arg(url)
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .status()
        .map_err(|error| format!("无法打开浏览器: {error}"))?;

    if result.success() {
        Ok(())
    } else {
        Err("系统 open 命令打开浏览器失败".to_string())
    }
}

#[tauri::command]
fn reveal_runtime_dir(app: AppHandle) -> Result<(), String> {
    let runtime_dir = ensure_runtime(&app)?;
    let result = Command::new("open")
        .arg(runtime_dir)
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .status()
        .map_err(|error| format!("无法在 Finder 中打开运行目录: {error}"))?;

    if result.success() {
        Ok(())
    } else {
        Err("系统 open 命令打开运行目录失败".to_string())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_status,
            start_service,
            stop_service,
            restart_service,
            open_admin_window,
            open_admin_in_browser,
            reveal_runtime_dir,
            read_recent_logs
        ])
        .run(tauri::generate_context!())
        .expect("error while running Airouter Desktop");
}

fn main() {
    run();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_admin_url_with_auth_token() {
        assert_eq!(
            build_admin_url(3009, Some("auth_abc")),
            "http://localhost:3009/admin/configs?auth_token=auth_abc"
        );
    }

    #[test]
    fn builds_admin_url_without_empty_auth_token() {
        assert_eq!(
            build_admin_url(3009, Some("")),
            "http://localhost:3009/admin/configs"
        );
    }

    #[test]
    fn parses_numeric_and_string_ports() {
        assert_eq!(parse_port(Some(Value::from(3010))), Some(3010));
        assert_eq!(parse_port(Some(Value::from("3011"))), Some(3011));
        assert_eq!(parse_port(Some(Value::from("bad"))), None);
    }

    #[test]
    fn tails_last_lines() {
        let temp = tempfile::tempdir().expect("tempdir");
        let log = temp.path().join("openai.log");
        fs::write(&log, "a\nb\nc\nd\n").expect("write log");
        assert_eq!(tail_text(&log, 2), "c\nd");
    }
}
