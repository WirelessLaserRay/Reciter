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
        .invoke_handler(tauri::generate_handler![write_text_file, read_text_file])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
