use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::Emitter;

#[tauri::command]
async fn save_asset(
    buffer: Vec<u8>,
    extension: String,
    mode: String,
    global_path: Option<String>,
    active_file_path: Option<String>,
) -> Result<serde_json::Value, String> {
    use std::fs;
    use std::path::PathBuf;
    use chrono::Utc;

    let timestamp = Utc::now().timestamp_millis();
    let ext = if extension.is_empty() { "png".to_string() } else { extension };
    let filename = format!("image-{}.{}", timestamp, ext);

    let (file_path, return_path) = if mode == "global" {
        let g_path = global_path.ok_or("Global path not provided")?;
        let mut path = PathBuf::from(g_path);
        if !path.exists() {
            fs::create_dir_all(&path).map_err(|e| e.to_string())?;
        }
        path.push(&filename);
        let abs_path = path.to_string_lossy().to_string();
        (path, abs_path)
    } else {
        let a_path = active_file_path.ok_or("File must be saved before adding assets")?;
        let active_path = PathBuf::from(a_path);
        let dir = active_path.parent().ok_or("Invalid active file path")?;
        let assets_dir = dir.join("assets");
        if !assets_dir.exists() {
            fs::create_dir_all(&assets_dir).map_err(|e| e.to_string())?;
        }
        let file_path = assets_dir.join(&filename);
        let return_path = format!("./assets/{}", filename);
        (file_path, return_path)
    };

    fs::write(&file_path, buffer).map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "success": true,
        "path": return_path
    }))
}

#[tauri::command]
fn trash_path(path: String) -> Result<serde_json::Value, String> {
    trash::delete(path).map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "success": true }))
}

fn setup_menu(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let handle = app.handle();
    
    let preferences_item = MenuItem::with_id(handle, "preferences", "Preferences", true, Some("CmdOrCtrl+,"))?;
    
    let pkg_menu = Submenu::with_items(
        handle,
        "Wisteria",
        true,
        &[
            &PredefinedMenuItem::about(handle, None, None)?,
            &PredefinedMenuItem::separator(handle)?,
            &preferences_item,
            &PredefinedMenuItem::separator(handle)?,
            &PredefinedMenuItem::services(handle, None)?,
            &PredefinedMenuItem::separator(handle)?,
            &PredefinedMenuItem::hide(handle, None)?,
            &PredefinedMenuItem::hide_others(handle, None)?,
            &PredefinedMenuItem::show_all(handle, None)?,
            &PredefinedMenuItem::separator(handle)?,
            &PredefinedMenuItem::quit(handle, None)?,
        ],
    )?;

    let file_menu = Submenu::with_items(
        handle,
        "File",
        true,
        &[
            &MenuItem::with_id(handle, "new", "New File", true, Some("CmdOrCtrl+N"))?,
            &MenuItem::with_id(handle, "open", "Open...", true, Some("CmdOrCtrl+O"))?,
            &MenuItem::with_id(handle, "open-folder", "Open Folder...", true, Some("CmdOrCtrl+Shift+O"))?,
            &PredefinedMenuItem::separator(handle)?,
            &MenuItem::with_id(handle, "save", "Save", true, Some("CmdOrCtrl+S"))?,
            &MenuItem::with_id(handle, "save-as", "Save As...", true, Some("CmdOrCtrl+Shift+S"))?,
            &PredefinedMenuItem::separator(handle)?,
            &MenuItem::with_id(handle, "export-pdf", "Export PDF", true, None::<&str>)?,
            &MenuItem::with_id(handle, "export-html", "Export HTML", true, None::<&str>)?,
        ],
    )?;

    let edit_menu = Submenu::with_items(
        handle,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(handle, None)?,
            &PredefinedMenuItem::redo(handle, None)?,
            &PredefinedMenuItem::separator(handle)?,
            &PredefinedMenuItem::cut(handle, None)?,
            &PredefinedMenuItem::copy(handle, None)?,
            &PredefinedMenuItem::paste(handle, None)?,
            &PredefinedMenuItem::select_all(handle, None)?,
        ],
    )?;

    let view_menu = Submenu::with_items(
        handle,
        "View",
        true,
        &[
            &MenuItem::with_id(handle, "toggle-sidebar", "Toggle Sidebar", true, Some("CmdOrCtrl+B"))?,
            &PredefinedMenuItem::separator(handle)?,
            &PredefinedMenuItem::fullscreen(handle, None)?,
        ],
    )?;

    let menu = Menu::with_items(handle, &[&pkg_menu, &file_menu, &edit_menu, &view_menu])?;
    app.set_menu(menu)?;

    app.on_menu_event(move |app_handle, event| {
        match event.id().as_ref() {
            "new" => { let _ = app_handle.emit("menu-new", ()); }
            "open" => { let _ = app_handle.emit("menu-open", ()); }
            "open-folder" => { let _ = app_handle.emit("menu-open-folder", ()); }
            "save" => { let _ = app_handle.emit("menu-save", ()); }
            "save-as" => { let _ = app_handle.emit("menu-save-as", ()); }
            "export-pdf" => { let _ = app_handle.emit("menu-pdf", ()); }
            "export-html" => { let _ = app_handle.emit("menu-html", ()); }
            "preferences" => { let _ = app_handle.emit("menu-preferences", ()); }
            "toggle-sidebar" => { let _ = app_handle.emit("menu-toggle-sidebar", ()); }
            _ => {}
        }
    });

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![save_asset, trash_path])
        .setup(|app| {
            setup_menu(app)?;

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
