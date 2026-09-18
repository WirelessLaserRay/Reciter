use tauri_plugin_sql::{Migration, MigrationKind};

/// 写文本文件（JSON 导出用）
#[tauri::command]
fn write_text_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| format!("写入失败: {}", e))
}

/// 读文本文件（JSON 恢复用）
#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("读取失败: {}", e))
}

/// 读二进制文件（.apkg 导入用）
#[tauri::command]
fn read_binary_file(path: String) -> Result<Vec<u8>, String> {
    std::fs::read(&path).map_err(|e| format!("读取二进制失败: {}", e))
}

/// 在系统默认浏览器中直接打开外部链接
#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("rundll32")
            .args(["url.dll,FileProtocolHandler", &url])
            .spawn()
            .map_err(|e| format!("打开系统浏览器失败: {}", e))?;
        return Ok(());
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("打开系统浏览器失败: {}", e))?;
        return Ok(());
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("打开系统浏览器失败: {}", e))?;
        return Ok(());
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        Err("不支持该操作系统的浏览器跳转".to_string())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "create initial tables",
            sql: include_str!("../migrations/001_init.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "add learning_steps to card_states",
            sql: include_str!("../migrations/002_learning_steps.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "normalize timestamps to ISO-8601 UTC",
            sql: include_str!("../migrations/003_iso_timestamps.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "add is_key to cards (bold key items)",
            sql: include_str!("../migrations/004_is_key.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "add study preference defaults",
            sql: include_str!("../migrations/005_study_prefs.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "add weak_source to cards",
            sql: include_str!("../migrations/006_weak_source.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "add deck folder and allow duplicate names across folders",
            sql: include_str!("../migrations/007_deck_folder.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 8,
            description: "add weak_dismissed to cards",
            sql: include_str!("../migrations/008_weak_dismissed.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 9,
            description: "add phonetic to cards",
            sql: include_str!("../migrations/009_phonetic.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 10,
            description: "add meaning_primary/meaning_secondary/ignored to cards",
            sql: include_str!("../migrations/010_meaning_ignore.sql"),
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:reciter.db", migrations)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            write_text_file,
            read_text_file,
            read_binary_file,
            open_external_url
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
