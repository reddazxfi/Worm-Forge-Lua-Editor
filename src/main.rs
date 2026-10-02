// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

/// Compiles a Lua 5.4 chunk without running it.
///
/// This is the same front end the game uses. The engine's `sandbox::run_script`
/// (crates/lua-host/src/sandbox.rs:41) is `lua.load(src).set_name(x).exec()`.
/// We stop one step earlier at `into_function()`, which parses, resolves
/// upvalues and emits bytecode but never calls the chunk -- so the engine's
/// `strip_unsafe` sandbox is not needed, because nothing executes.
///
/// `async` so the compile runs off the UI thread; a sync command would block it
/// on every check. `mlua::Lua` is not `Send`, but it is created and dropped
/// inside one non-await scope, so the future stays `Send`.
///
/// On failure the error string is Lua's own, e.g.
/// `syntax error: [string "rules.lua"]:3: 'end' expected (to close 'function' at line 1)`.
/// Note the `[string ".."]` wrapper: mlua's set_name does not strip it, and
/// src/services/luaCompiler.ts parses against exactly this shape.
#[tauri::command]
async fn compile_lua(source: String, chunk_name: String) -> Result<(), String> {
    let lua = mlua::Lua::new();
    lua.load(&source)
        .set_name(&chunk_name)
        .into_function()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![compile_lua])
        .run(tauri::generate_context!())
        .expect("error while running WormForge Editor");
}
