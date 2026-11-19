mod anki;
mod dict_fetch;
mod library;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            dict_fetch::lookup_authoritative_dict,
            anki::anki_invoke,
            library::library_root_path,
            library::save_book,
            library::list_library,
            library::read_book,
            library::remove_book
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
