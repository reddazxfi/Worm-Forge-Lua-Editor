//! Full-mod `require` analysis for the desktop checker.
//!
//! This module is deliberately independent of `parse_lua_ast`: the fast
//! single-file path must stay fast, and only SYNTAX CHECK is allowed to read
//! sibling packs, manifests and the require graph. The resolver mirrors the
//! engine's discovery, closure, module grammar and shared-export lookup closely
//! enough to report the errors the engine would report, while leaving the rest
//! of the manifest schema to the game/wfcheck.
//!
//! The engine sources this follows are:
//!   crates/weapons/src/libraries.rs  (pack_dirs, closure, module_name)
//!   crates/weapons/src/components.rs (BundleManifest fields and validation)
//!   crates/lua-host/src/modules.rs   (module_path, read_module, require lookup)
//!
//! The one intentional divergence is diagnostic severity for unreachable
//! helpers: the resolver still parses them, but a require finding there is a
//! warning, because the engine only reaches it if something requires it.

use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

use full_moon::ast::{
    Assignment, Block, Call, Expression, FunctionArgs, FunctionBody, FunctionCall, GenericFor,
    LocalAssignment, LocalFunction, NumericFor, Prefix, Suffix, Var,
};
use full_moon::node::Node;
use full_moon::tokenizer::{TokenReference, TokenType};
use full_moon::visitors::Visitor;
use serde::{Deserialize, Serialize};

const API_VERSION: u32 = 4;
const COMPONENTS_FORMAT: u32 = 2;
const MANAGED: &str = "wf-lib";
const STOCK_BUNDLE: &str = "stock";
const MAX_NAME: usize = 200;
const MAX_WALK_DEPTH: usize = 32;
const MAX_WALK_FILES: usize = 4000;

/// Newest full-check request. The front end increments this; a result from an
/// older request is discarded instead of painted over newer buffers.
pub static CURRENT_REQUEST: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileInput {
    pub path: String,
    pub text: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileDiagnostic {
    pub file: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bundle: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dependency: Option<bool>,
    pub line: usize,
    pub column: usize,
    pub severity: String,
    pub rule: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SharedExport {
    pub name: String,
    pub provider: String,
    pub path: String,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphSummary {
    pub nodes: usize,
    pub edges: usize,
    pub local_modules: Vec<String>,
    pub shared_exports: Vec<SharedExport>,
    pub dependency_ids: Vec<String>,
    pub dynamic_requires: usize,
    pub unresolved: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Fingerprint {
    pub path: String,
    pub hash: String,
    pub length: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModCheckReport {
    pub ok: bool,
    pub cancelled: bool,
    pub checked_root: String,
    pub mods_root: Option<String>,
    pub current_bundle: Option<String>,
    pub diagnostics: Vec<FileDiagnostic>,
    pub graph: GraphSummary,
    pub fingerprints: Vec<Fingerprint>,
}

/// One parsed `mod.toml`. Unknown fields are intentionally ignored: the editor
/// is not the manifest authority, and `deny_unknown_fields` here would reject
/// valid component options the game accepts.
#[derive(Debug, Clone, Deserialize, Default)]
struct Manifest {
    #[serde(default)]
    id: String,
    #[serde(default)]
    api_version: u32,
    #[serde(default = "default_format_version")]
    format_version: u32,
    #[serde(default)]
    entry: Option<String>,
    #[serde(default)]
    dependencies: Vec<String>,
    #[serde(default)]
    exports: BTreeMap<String, String>,
    #[serde(default)]
    asset_namespace: Option<String>,
    #[serde(default)]
    components: Vec<ComponentLite>,
}

fn default_format_version() -> u32 {
    1
}

#[derive(Debug, Clone, Deserialize, Default)]
struct ComponentLite {
    #[serde(default)]
    id: String,
    #[serde(default)]
    entry: String,
}

#[derive(Debug, Clone)]
struct Bundle {
    id: String,
    root: PathBuf,
    folder: String,
    manifest: Option<Manifest>,
    /// The v1 top-level entry. `None` for v2 bundles: a v2 component is not a
    /// forbidden require target.
    legacy_entry: Option<String>,
    dependencies: Vec<String>,
    exports: BTreeMap<String, String>,
    asset_namespace: Option<String>,
    component_entries: Vec<String>,
}

impl Bundle {
    fn is_v2(&self) -> bool {
        self.manifest
            .as_ref()
            .is_some_and(|m| m.format_version >= COMPONENTS_FORMAT)
    }

    fn display_file(&self, rel: &str, is_current: bool) -> String {
        if is_current {
            rel.replace('\\', "/")
        } else {
            format!("{}/{}", self.folder, rel.replace('\\', "/"))
        }
    }

    fn manifest_file(&self, is_current: bool) -> String {
        if is_current {
            "mod.toml".to_string()
        } else {
            format!("{}/mod.toml", self.folder)
        }
    }
}

struct Catalog {
    /// v2 bundles by manifest id.
    by_id: BTreeMap<String, Bundle>,
    mods_root: Option<PathBuf>,
    shared_available: bool,
}

#[derive(Debug, Clone)]
enum ClosureFailure {
    Missing(String),
    Cycle(String),
    DuplicateExport(String),
    DuplicateNamespace(String),
}

impl ClosureFailure {
    fn rule(&self) -> &'static str {
        match self {
            Self::Missing(_) => "bundle-missing-dependency",
            Self::Cycle(_) => "bundle-dependency-cycle",
            Self::DuplicateExport(_) => "bundle-duplicate-export",
            Self::DuplicateNamespace(_) => "bundle-duplicate-namespace",
        }
    }

    fn message(&self) -> String {
        match self {
            Self::Missing(m) | Self::Cycle(m) | Self::DuplicateExport(m) | Self::DuplicateNamespace(m) => {
                m.clone()
            }
        }
    }
}

pub fn check(
    request_id: u64,
    root: &str,
    mods_root: Option<&str>,
    custom_verbs: Vec<(String, String)>,
    active_file: Option<&str>,
    files: &[FileInput],
) -> ModCheckReport {
    // Mark this as the newest request before doing any filesystem work. Every
    // later check compares against this; an older worker returns cancelled
    // instead of painting stale results over newer buffers.
    CURRENT_REQUEST.fetch_max(request_id, Ordering::SeqCst);
    let root_path = normalize_path(Path::new(root));
    let checked_root = root_path.to_string_lossy().replace('\\', "/");
    let mut diagnostics = Vec::new();
    let mut fingerprints = Vec::new();
    let overlay: HashMap<String, String> = files
        .iter()
        .map(|f| (normalize_rel(&f.path), f.text.clone()))
        .collect();

    let derived_mods = derive_mods_root(&root_path, mods_root.map(Path::new));
    let current_manifest_text = overlay
        .get("mod.toml")
        .cloned()
        .or_else(|| std::fs::read_to_string(root_path.join("mod.toml")).ok());

    let current_manifest = current_manifest_text
        .as_deref()
        .and_then(|text| toml::from_str::<Manifest>(text).ok());

    let current_id = current_manifest
        .as_ref()
        .map(|m| m.id.clone())
        .filter(|id| !id.trim().is_empty())
        .unwrap_or_else(|| folder_name(&root_path));

    let current = Bundle {
        id: current_id.clone(),
        root: root_path.clone(),
        folder: folder_name(&root_path),
        manifest: current_manifest.clone(),
        legacy_entry: current_manifest
            .as_ref()
            .filter(|m| m.format_version < COMPONENTS_FORMAT)
            .and_then(|m| m.entry.clone()),
        dependencies: current_manifest
            .as_ref()
            .map(|m| m.dependencies.clone())
            .unwrap_or_default(),
        exports: current_manifest
            .as_ref()
            .map(|m| m.exports.clone())
            .unwrap_or_default(),
        asset_namespace: current_manifest
            .as_ref()
            .and_then(|m| m.asset_namespace.clone()),
        component_entries: current_manifest
            .as_ref()
            .map(|m| m.components.iter().map(|c| c.entry.clone()).collect())
            .unwrap_or_default(),
    };

    let catalog = discover_catalog(
        &root_path,
        derived_mods.as_deref(),
        &current,
        &overlay,
        &mut diagnostics,
    );

    // Current bundle manifest validation. v1 packs are not catalogue members,
    // but local requires still work; only the v2-only fields are checked.
    if let Some(manifest) = current.manifest.as_ref() {
        if manifest.format_version >= COMPONENTS_FORMAT {
            for (rule, message) in validate_manifest(manifest, current_manifest_text.as_deref().unwrap_or("")) {
                diagnostics.push(FileDiagnostic {
                    file: "mod.toml".to_string(),
                    bundle: Some(current_id.clone()),
                    dependency: None,
                    line: 1,
                    column: 1,
                    severity: "error".to_string(),
                    rule: rule.to_string(),
                    message,
                    detail: None,
                });
            }
        }
    }

    // Closure for the opened bundle. A v1 pack has no shared imports, so the
    // closure is just the pack itself.
    let mut closure = BTreeSet::new();
    if current.manifest.as_ref().is_some_and(|m| m.format_version >= COMPONENTS_FORMAT) {
        match closure_ids(&catalog.by_id, &current_id) {
            Ok(ids) => closure = ids,
            Err(fail) => {
                diagnostics.push(FileDiagnostic {
                    file: "mod.toml".to_string(),
                    bundle: Some(current_id.clone()),
                    dependency: None,
                    line: 1,
                    column: 1,
                    severity: "error".to_string(),
                    rule: fail.rule().to_string(),
                    message: fail.message(),
                    detail: None,
                });
                closure = best_effort_closure(&catalog.by_id, &current_id);
            }
        }
    }
    closure.insert(current_id.clone());

    // Dependency manifests that are actually in the closure get the same
    // require-relevant validation as the open bundle. They are labelled as
    // dependency findings so the console can say where they came from.
    for id in &closure {
        if id == &current_id {
            continue;
        }
        let Some(bundle) = catalog.by_id.get(id) else {
            continue;
        };
        let Some(manifest) = bundle.manifest.as_ref() else {
            continue;
        };
        for (rule, message) in validate_manifest(manifest, "") {
            diagnostics.push(FileDiagnostic {
                file: bundle.manifest_file(false),
                bundle: Some(id.clone()),
                dependency: Some(true),
                line: 1,
                column: 1,
                severity: "error".to_string(),
                rule: rule.to_string(),
                message,
                detail: None,
            });
        }
    }

    // Graph summary names visible to the current bundle: itself plus direct
    // dependencies. These are what completion may offer after a full check.
    let mut shared_exports = Vec::new();
    if catalog.shared_available {
        let mut ids = vec![current_id.clone()];
        ids.extend(current.dependencies.iter().cloned());
        let mut seen = BTreeSet::new();
        for id in ids {
            if let Some(b) = catalog.by_id.get(&id) {
                for (name, path) in &b.exports {
                    if seen.insert(name.clone()) {
                        shared_exports.push(SharedExport {
                            name: name.clone(),
                            provider: id.clone(),
                            path: path.clone(),
                        });
                    }
                }
            }
        }
    }
    shared_exports.sort_by(|a, b| a.name.cmp(&b.name));

    // Current bundle files: overlay first, then disk for anything the editor did
    // not load (a huge file over the app's cap). Only .lua participates.
    let mut current_sources: BTreeMap<String, String> = BTreeMap::new();
    for (path, text) in &overlay {
        if is_lua(path) {
            current_sources.insert(path.clone(), text.clone());
        }
    }
    for rel in walk_lua_files(&root_path) {
        if let std::collections::btree_map::Entry::Vacant(entry) = current_sources.entry(rel) {
            if let Ok(text) = std::fs::read_to_string(join_rel(&root_path, entry.key())) {
                entry.insert(text);
            }
        }
    }

    for (path, text) in &current_sources {
        fingerprints.push(Fingerprint {
            path: path.clone(),
            hash: fnv1a(text),
            length: text.len(),
        });
    }
    if let Some(text) = current_manifest_text.as_ref() {
        fingerprints.push(Fingerprint {
            path: "mod.toml".to_string(),
            hash: fnv1a(text),
            length: text.len(),
        });
    }
    fingerprints.sort_by(|a, b| a.path.cmp(&b.path));

    let local_modules = current_sources
        .keys()
        .map(|p| p.trim_end_matches(".lua").replace('\\', "/"))
        .collect::<Vec<_>>();

    let active_rel = active_file.map(normalize_rel).filter(|p| is_lua(p));
    let mut roots: Vec<String> = current.component_entries.to_vec();
    if let Some(entry) = current.legacy_entry.clone() {
        roots.push(entry);
    }
    if let Some(active) = active_rel.clone() {
        roots.push(active);
    }
    roots.sort();
    roots.dedup();

    let mut state = WalkState {
        catalog: &catalog,
        overlay: &overlay,
        current: &current,
        closure: &closure,
        custom_verbs,
        diagnostics: &mut diagnostics,
        visited: HashSet::new(),
        loading: Vec::new(),
        edges: 0,
        nodes: 0,
        dynamic: 0,
        unresolved: 0,
    };

    // Reachable roots first: component entries, the v1 entry and the active file.
    for rel in &roots {
        if let Some(source) = current_sources.get(rel) {
            state.walk_file(current.clone(), rel, source.clone(), true, true, request_id);
            if request_id < CURRENT_REQUEST.load(Ordering::SeqCst) {
                return cancelled_report(checked_root, catalog.mods_root, Some(current_id), diagnostics);
            }
        }
    }
    // Then every other current-bundle file. They are parsed and their requires
    // resolved, but findings are warnings until an entry actually reaches them.
    for (rel, source) in &current_sources {
        if !state.visited.contains(&(current_id.clone(), rel.clone())) {
            state.walk_file(current.clone(), rel, source.clone(), false, true, request_id);
            if request_id < CURRENT_REQUEST.load(Ordering::SeqCst) {
                return cancelled_report(checked_root, catalog.mods_root, Some(current_id), diagnostics);
            }
        }
    }

    let graph = GraphSummary {
        nodes: state.nodes,
        edges: state.edges,
        local_modules,
        shared_exports,
        dependency_ids: current.dependencies.clone(),
        dynamic_requires: state.dynamic,
        unresolved: state.unresolved,
    };

    diagnostics.sort_by(|a, b| {
        a.file
            .cmp(&b.file)
            .then(a.line.cmp(&b.line))
            .then(a.column.cmp(&b.column))
            .then(a.rule.cmp(&b.rule))
    });
    let ok = !diagnostics.iter().any(|d| d.severity == "error");

    ModCheckReport {
        ok,
        cancelled: false,
        checked_root,
        mods_root: catalog.mods_root.as_ref().map(|p| p.to_string_lossy().replace('\\', "/")),
        current_bundle: Some(current_id),
        diagnostics,
        graph,
        fingerprints,
    }
}

fn cancelled_report(
    checked_root: String,
    mods_root: Option<PathBuf>,
    current_bundle: Option<String>,
    diagnostics: Vec<FileDiagnostic>,
) -> ModCheckReport {
    ModCheckReport {
        ok: false,
        cancelled: true,
        checked_root,
        mods_root: mods_root.map(|p| p.to_string_lossy().replace('\\', "/")),
        current_bundle,
        diagnostics,
        graph: GraphSummary::default(),
        fingerprints: Vec::new(),
    }
}

fn discover_catalog(
    root: &Path,
    mods_root: Option<&Path>,
    current: &Bundle,
    overlay: &HashMap<String, String>,
    diagnostics: &mut Vec<FileDiagnostic>,
) -> Catalog {
    let mut by_id = BTreeMap::new();
    let mut seen_roots = BTreeSet::new();

    let mut add = |path: PathBuf, is_current: bool, diagnostics: &mut Vec<FileDiagnostic>| {
        let normalized = normalize_path(&path);
        if !seen_roots.insert(normalized.clone()) {
            return;
        }
        let text = if is_current {
            overlay
                .get("mod.toml")
                .cloned()
                .or_else(|| std::fs::read_to_string(normalized.join("mod.toml")).ok())
        } else {
            std::fs::read_to_string(normalized.join("mod.toml")).ok()
        };
        let Some(text) = text else {
            return;
        };
        let manifest = match toml::from_str::<Manifest>(&text) {
            Ok(m) => Some(m),
            Err(e) => {
                if is_current {
                    diagnostics.push(FileDiagnostic {
                        file: "mod.toml".to_string(),
                        bundle: Some(current.id.clone()),
                        dependency: None,
                        line: 1,
                        column: 1,
                        severity: "error".to_string(),
                        rule: "bundle-invalid-toml".to_string(),
                        message: format!("mod.toml does not parse: {e}"),
                        detail: None,
                    });
                }
                None
            }
        };
        let folder = mods_root
            .and_then(|m| normalized.strip_prefix(m).ok())
            .map(|p| p.to_string_lossy().replace('\\', "/"))
            .unwrap_or_else(|| folder_name(&normalized));
        let id = manifest
            .as_ref()
            .map(|m| m.id.clone())
            .filter(|id| !id.trim().is_empty())
            .unwrap_or_else(|| folder_name(&normalized));
        let is_v2 = manifest
            .as_ref()
            .is_some_and(|m| m.format_version >= COMPONENTS_FORMAT);
        let bundle = Bundle {
            id: id.clone(),
            root: normalized.clone(),
            folder,
            legacy_entry: manifest
                .as_ref()
                .filter(|m| m.format_version < COMPONENTS_FORMAT)
                .and_then(|m| m.entry.clone()),
            dependencies: manifest
                .as_ref()
                .map(|m| m.dependencies.clone())
                .unwrap_or_default(),
            exports: manifest
                .as_ref()
                .map(|m| m.exports.clone())
                .unwrap_or_default(),
            asset_namespace: manifest
                .as_ref()
                .and_then(|m| m.asset_namespace.clone()),
            component_entries: manifest
                .as_ref()
                .map(|m| m.components.iter().map(|c| c.entry.clone()).collect())
                .unwrap_or_default(),
            manifest,
        };
        if is_v2 {
            if let Some(first) = by_id.get(&id) {
                let first: &Bundle = first;
                diagnostics.push(FileDiagnostic {
                    file: bundle.manifest_file(is_current),
                    bundle: Some(id.clone()),
                    dependency: if is_current { None } else { Some(true) },
                    line: 1,
                    column: 1,
                    severity: "error".to_string(),
                    rule: "bundle-duplicate-id".to_string(),
                    message: format!(
                        "bundle {id} is installed more than once; keep one copy (also in {})",
                        first.folder
                    ),
                    detail: None,
                });
            } else {
                by_id.insert(id.clone(), bundle.clone());
            }
        }
    };

    // The opened bundle is always present, even when the Mods root cannot be
    // derived. This keeps local require working without inventing sibling data.
    add(root.to_path_buf(), true, diagnostics);
    if let Some(mods) = mods_root {
        match pack_dirs(mods) {
            Ok(paths) => {
                for path in paths {
                    if normalize_path(&path) != normalize_path(root) {
                        add(path, false, diagnostics);
                    }
                }
            }
            Err(e) => diagnostics.push(FileDiagnostic {
                file: "mod.toml".to_string(),
                bundle: Some(current.id.clone()),
                dependency: None,
                line: 1,
                column: 1,
                severity: "warning".to_string(),
                rule: "bundle-discovery".to_string(),
                message: format!("could not scan the Mods folder: {e}"),
                detail: None,
            }),
        }
    }

    // If the opened pack is v2 but was rejected by toml, keep the synthetic
    // current bundle in by_id so local resolution still has an owner.
    if current.manifest.as_ref().is_some_and(|m| m.format_version >= COMPONENTS_FORMAT) {
        by_id.entry(current.id.clone()).or_insert_with(|| current.clone());
    }

    let shared_available = mods_root.is_some();
    Catalog {
        by_id,
        mods_root: mods_root.map(normalize_path),
        shared_available,
    }
}

fn validate_manifest(m: &Manifest, text: &str) -> Vec<(&'static str, String)> {
    let mut out = Vec::new();
    let id = m.id.trim();
    if id.is_empty() {
        out.push(("bundle-invalid-manifest", "mod.toml id is empty".to_string()));
    }
    if id == STOCK_BUNDLE {
        out.push((
            "bundle-invalid-manifest",
            format!("the bundle id {STOCK_BUNDLE} is WormForge's own, for the stock weapons"),
        ));
    }
    if m.api_version != API_VERSION {
        out.push((
            "bundle-invalid-manifest",
            format!(
                "api_version {} is not supported (need {API_VERSION})",
                m.api_version
            ),
        ));
    }
    if m.format_version != COMPONENTS_FORMAT {
        out.push((
            "bundle-invalid-manifest",
            format!(
                "format_version {} is not supported (need {COMPONENTS_FORMAT})",
                m.format_version
            ),
        ));
    }
    if m.components.is_empty() && m.exports.is_empty() {
        out.push((
            "bundle-invalid-manifest",
            "declares no components".to_string(),
        ));
    }
    let mut deps = BTreeSet::new();
    for dep in &m.dependencies {
        if !valid_id(dep) || dep == &m.id || !deps.insert(dep) {
            out.push((
                "bundle-invalid-dependency",
                format!("invalid or duplicate library dependency {dep:?}"),
            ));
        }
    }
    for (name, entry) in &m.exports {
        if !name.starts_with("wf-lib/") || !module_name(name) || !valid_entry(entry) {
            out.push((
                "bundle-invalid-export",
                format!("export {name:?}: needs a wf-lib/name and a pack-relative Lua entry"),
            ));
        }
    }
    if let Some(namespace) = &m.asset_namespace {
        if !namespace.starts_with("wf-lib/")
            || namespace.split('/').count() != 2
            || !module_name(namespace)
        {
            out.push((
                "bundle-invalid-namespace",
                "asset_namespace must be wf-lib/name".to_string(),
            ));
        }
    }
    let mut component_ids = BTreeSet::new();
    for c in &m.components {
        if !valid_id(&c.id) || !component_ids.insert(&c.id) {
            out.push((
                "bundle-invalid-manifest",
                format!("component id {:?}: use lowercase letters, digits, '_', '-' and '.'", c.id),
            ));
        }
        if !valid_entry(&c.entry) {
            out.push((
                "bundle-invalid-manifest",
                format!("{}: entry {:?} must be a .lua file inside the bundle", c.id, c.entry),
            ));
        }
    }
    // Keep the line-locator available for a later, more precise pass. The
    // current diagnostics point at line 1, which the plan explicitly allows.
    let _ = text;
    out
}

fn closure_ids(
    by_id: &BTreeMap<String, Bundle>,
    seed: &str,
) -> Result<BTreeSet<String>, ClosureFailure> {
    fn visit(
        id: &str,
        by_id: &BTreeMap<String, Bundle>,
        done: &mut BTreeSet<String>,
        active: &mut Vec<String>,
    ) -> Result<(), ClosureFailure> {
        if id == STOCK_BUNDLE || done.contains(id) {
            return Ok(());
        }
        if active.iter().any(|s| s == id) {
            active.push(id.to_string());
            return Err(ClosureFailure::Cycle(format!(
                "library dependency cycle: {}",
                active.join(" -> ")
            )));
        }
        let b = by_id
            .get(id)
            .ok_or_else(|| ClosureFailure::Missing(format!("library dependency {id} is not installed")))?;
        active.push(id.to_string());
        for dep in &b.dependencies {
            visit(dep, by_id, done, active)?;
        }
        active.pop();
        done.insert(id.to_string());
        Ok(())
    }

    let mut done = BTreeSet::new();
    visit(seed, by_id, &mut done, &mut Vec::new())?;
    let mut exports = BTreeMap::new();
    let mut namespaces = BTreeMap::new();
    for id in &done {
        let b = &by_id[id];
        for name in b.exports.keys() {
            if let Some(first) = exports.insert(name, id) {
                return Err(ClosureFailure::DuplicateExport(format!(
                    "library export {name} is declared by both {first} and {id}"
                )));
            }
        }
        if let Some(namespace) = &b.asset_namespace {
            if let Some(first) = namespaces.insert(namespace, id) {
                return Err(ClosureFailure::DuplicateNamespace(format!(
                    "asset namespace {namespace} is declared by both {first} and {id}"
                )));
            }
        }
    }
    Ok(done)
}

fn best_effort_closure(by_id: &BTreeMap<String, Bundle>, seed: &str) -> BTreeSet<String> {
    let mut out = BTreeSet::new();
    let mut stack = vec![seed.to_string()];
    while let Some(id) = stack.pop() {
        if id == STOCK_BUNDLE || !out.insert(id.clone()) {
            continue;
        }
        if let Some(b) = by_id.get(&id) {
            stack.extend(b.dependencies.iter().cloned());
        }
    }
    out
}

struct WalkState<'a> {
    catalog: &'a Catalog,
    overlay: &'a HashMap<String, String>,
    current: &'a Bundle,
    closure: &'a BTreeSet<String>,
    custom_verbs: Vec<(String, String)>,
    diagnostics: &'a mut Vec<FileDiagnostic>,
    visited: HashSet<(String, String)>,
    loading: Vec<(String, String)>,
    edges: usize,
    nodes: usize,
    dynamic: usize,
    unresolved: usize,
}

impl<'a> WalkState<'a> {
    fn walk_file(
        &mut self,
        owner: Bundle,
        rel: &str,
        source: String,
        reachable: bool,
        is_current: bool,
        request_id: u64,
    ) {
        let key = (owner.id.clone(), rel.to_string());
        if self.visited.contains(&key) {
            return;
        }
        self.visited.insert(key.clone());
        self.nodes += 1;
        if request_id < CURRENT_REQUEST.load(Ordering::SeqCst) {
            return;
        }

        let ast = match full_moon::parse(&source) {
            Ok(ast) => ast,
            Err(errors) => {
                for e in errors.iter() {
                    let (start, _) = e.range();
                    self.push_diag(
                        &owner,
                        rel,
                        is_current,
                        start.line(),
                        start.character(),
                        "error",
                        "lua-ast",
                        e.error_message().to_string(),
                        None,
                        reachable,
                    );
                }
                return;
            }
        };

        // The current bundle gets the ordinary semantic/desync checks too. The
        // dependency closure only gets syntax + require/manifest findings, so a
        // shipped library cannot flood the console with style advice.
        if is_current {
            for d in crate::checks::run_with_custom(&ast, self.custom_verbs.clone()) {
                self.push_ast_diag(&owner, rel, is_current, d, reachable);
            }
            for d in crate::scopes::run(&ast) {
                self.push_ast_diag(&owner, rel, is_current, d, reachable);
            }
        }

        let calls = scan_requires(&ast);
        self.loading.push(key);
        for call in calls {
            if request_id < CURRENT_REQUEST.load(Ordering::SeqCst) {
                self.loading.pop();
                return;
            }
            let line = call.line;
            let column = call.column;
            if call.indirect {
                self.dynamic += 1;
                self.unresolved += 1;
                self.push_diag(
                    &owner,
                    rel,
                    is_current,
                    line,
                    column,
                    "info",
                    "require-indirect",
                    "require is aliased or passed around, so this call cannot be checked".to_string(),
                    Some("The engine resolves require at runtime. Use a literal require(\"name\") call if you want the checker to verify the module.".to_string()),
                    reachable,
                );
                continue;
            }
            let Some(name) = call.name else {
                self.dynamic += 1;
                self.unresolved += 1;
                self.push_diag(
                    &owner,
                    rel,
                    is_current,
                    line,
                    column,
                    "info",
                    "require-dynamic",
                    "require has a computed name, so this module cannot be checked".to_string(),
                    Some("The engine may accept this at runtime. A literal string lets the checker resolve the module and its exports.".to_string()),
                    reachable,
                );
                continue;
            };

            let resolved = match self.resolve(&owner, &name, self.catalog.shared_available) {
                Ok(r) => r,
                Err((rule, message)) => {
                    self.unresolved += 1;
                    self.push_diag(
                        &owner,
                        rel,
                        is_current,
                        line,
                        column,
                        if reachable { "error" } else { "warning" },
                        rule,
                        message,
                        None,
                        reachable,
                    );
                    continue;
                }
            };
            self.edges += 1;

            let target_key = (resolved.provider.id.clone(), resolved.rel.clone());
            if self.loading.iter().any(|k| k == &target_key) {
                let mut chain: Vec<String> = self
                    .loading
                    .iter()
                    .map(|(_, p)| p.trim_end_matches(".lua").to_string())
                    .collect();
                chain.push(name.clone());
                self.unresolved += 1;
                self.push_diag(
                    &owner,
                    rel,
                    is_current,
                    line,
                    column,
                    if reachable { "error" } else { "warning" },
                    "require-cycle",
                    format!("require cycle in {}: {}", owner.id, chain.join(" -> ")),
                    None,
                    reachable,
                );
                continue;
            }

            match self.read_module(&resolved.provider, &resolved.rel) {
                Ok(source) => {
                    let target_current = resolved.provider.id == self.current.id;
                    self.walk_file(
                        resolved.provider,
                        &resolved.rel,
                        source,
                        reachable,
                        target_current,
                        request_id,
                    );
                }
                Err((rule, message)) => {
                    self.unresolved += 1;
                    self.push_diag(
                        &owner,
                        rel,
                        is_current,
                        line,
                        column,
                        if reachable { "error" } else { "warning" },
                        rule,
                        format!("require(\"{name}\") in {}: {message}", owner.id),
                        None,
                        reachable,
                    );
                }
            }
        }
        self.loading.pop();
    }

    fn resolve(
        &self,
        owner: &Bundle,
        name: &str,
        shared_available: bool,
    ) -> Result<Resolved, (&'static str, String)> {
        if !module_name(name) {
            let why = if name.is_empty() || name.len() > MAX_NAME {
                "a module name is 1 to 200 characters".to_string()
            } else if name.split('/').any(|s| s.is_empty()) {
                "empty path segment".to_string()
            } else {
                "use letters, digits, '_' and '-', with '/' between folders and no extension"
                    .to_string()
            };
            return Err(("require-invalid-name", format!("require(\"{name}\"): {why}")));
        }

        if name.starts_with("wf-lib/") {
            if !owner.is_v2() {
                return Err((
                    "require-no-manifest",
                    "shared imports require a bundle manifest".to_string(),
                ));
            }
            let Some(own) = owner.manifest.as_ref() else {
                return Err((
                    "require-no-manifest",
                    "shared imports require a bundle manifest".to_string(),
                ));
            };
            if !shared_available {
                return Err((
                    "require-no-mods-root",
                    "shared imports could not be checked: the Mods folder could not be derived from this mod folder".to_string(),
                ));
            }
            let mut found: Option<(String, String)> = None;
            for id in std::iter::once(&owner.id).chain(own.dependencies.iter()) {
                if let Some(b) = self.catalog.by_id.get(id) {
                    if let Some(entry) = b.exports.get(name) {
                        if found.is_some() {
                            return Err((
                                "require-ambiguous-export",
                                format!("ambiguous library export {name}"),
                            ));
                        }
                        found = Some((id.clone(), entry.clone()));
                    }
                }
            }
            let Some((provider_id, rel)) = found else {
                return Err((
                    "require-missing-export",
                    format!("{}: {name} is not exported by a declared dependency", owner.id),
                ));
            };
            if !self.closure.contains(&provider_id) {
                return Err((
                    "require-missing-export",
                    format!("{}: {name} is not exported by a declared dependency", owner.id),
                ));
            }
            let provider = self
                .catalog
                .by_id
                .get(&provider_id)
                .cloned()
                .ok_or_else(|| {
                    (
                        "require-missing-export",
                        format!("{}: {name} is not exported by a declared dependency", owner.id),
                    )
                })?;
            return Ok(Resolved { provider, rel });
        }

        let rel = format!("{name}.lua");
        if !owner.is_v2() && owner.legacy_entry.as_deref() == Some(rel.as_str()) {
            return Err((
                "require-entry",
                format!("require(\"{name}\"): {rel} is the pack's entry file"),
            ));
        }
        Ok(Resolved {
            provider: owner.clone(),
            rel,
        })
    }

    fn read_module(&self, provider: &Bundle, rel: &str) -> Result<String, (&'static str, String)> {
        let rel = normalize_rel(rel);
        let is_current = provider.id == self.current.id;
        if is_current {
            if let Some(text) = self.overlay.get(&rel) {
                // An unsaved overlay file may not exist on disk yet. If it does
                // exist, a symlink is still a symlink and the engine refuses it.
                let path = join_rel(&provider.root, &rel);
                if let Ok(meta) = std::fs::symlink_metadata(&path) {
                    if meta.file_type().is_symlink() {
                        return Err((
                            "require-symlink",
                            format!("{rel} goes through a symlink"),
                        ));
                    }
                }
                return Ok(text.clone());
            }
        }
        let mut path = provider.root.clone();
        for part in Path::new(&rel).components() {
            let Component::Normal(part) = part else {
                return Err((
                    "require-missing-local",
                    format!("{rel} is not a path inside the pack"),
                ));
            };
            path.push(part);
            if let Ok(meta) = std::fs::symlink_metadata(&path) {
                if meta.file_type().is_symlink() {
                    return Err((
                        "require-symlink",
                        format!("{rel} goes through a symlink"),
                    ));
                }
            }
        }
        let meta = std::fs::metadata(&path).map_err(|_| {
            (
                "require-missing-local",
                format!("no {rel} in the pack"),
            )
        })?;
        if !meta.is_file() {
            return Err((
                "require-not-file",
                format!("{rel} is not a file"),
            ));
        }
        std::fs::read_to_string(&path).map_err(|e| {
            (
                "require-missing-local",
                format!("{rel}: {e}"),
            )
        })
    }

    fn push_ast_diag(
        &mut self,
        owner: &Bundle,
        rel: &str,
        is_current: bool,
        d: crate::AstDiagnostic,
        reachable: bool,
    ) {
        let severity = if !reachable && d.severity == "error" {
            "warning"
        } else {
            d.severity.as_str()
        };
        self.push_diag(
            owner,
            rel,
            is_current,
            d.line,
            d.column,
            severity,
            &d.rule,
            d.message,
            d.detail,
            reachable,
        );
    }

    #[allow(clippy::too_many_arguments)]
    fn push_diag(
        &mut self,
        owner: &Bundle,
        rel: &str,
        is_current: bool,
        line: usize,
        column: usize,
        severity: &str,
        rule: &str,
        message: String,
        detail: Option<String>,
        _reachable: bool,
    ) {
        self.diagnostics.push(FileDiagnostic {
            file: owner.display_file(rel, is_current),
            bundle: Some(owner.id.clone()),
            dependency: if is_current { None } else { Some(true) },
            line,
            column,
            severity: severity.to_string(),
            rule: rule.to_string(),
            message,
            detail,
        });
    }
}

struct Resolved {
    provider: Bundle,
    rel: String,
}

#[derive(Debug, Clone)]
struct RequireCall {
    name: Option<String>,
    line: usize,
    column: usize,
    indirect: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum BindingKind {
    RequireShadow,
    Alias,
    Other,
}

struct Binding {
    name: String,
    line: usize,
    kind: BindingKind,
}

struct Scope {
    parent: Option<usize>,
    bindings: Vec<Binding>,
}

#[derive(Default)]
struct RequireScan {
    scopes: Vec<Scope>,
    stack: Vec<usize>,
    calls: Vec<RequireCall>,
    /// Local names become visible AFTER their initializer, exactly as Lua binds
    /// `local x = x` to the outer x. The visitor reaches the declaration before
    /// its expressions, so bindings are queued here and flushed on `_end`.
    pending_locals: Vec<Vec<Binding>>,
}

impl RequireScan {
    fn new() -> Self {
        Self {
            scopes: vec![Scope {
                parent: None,
                bindings: Vec::new(),
            }],
            stack: vec![0],
            calls: Vec::new(),
            pending_locals: Vec::new(),
        }
    }

    fn current(&self) -> usize {
        *self.stack.last().unwrap_or(&0)
    }

    fn push_scope(&mut self) {
        let parent = self.current();
        self.scopes.push(Scope {
            parent: Some(parent),
            bindings: Vec::new(),
        });
        self.stack.push(self.scopes.len() - 1);
    }

    fn pop_scope(&mut self) {
        if self.stack.len() > 1 {
            self.stack.pop();
        }
    }

    fn bind(&mut self, name: &str, line: usize, kind: BindingKind) {
        if name.is_empty() {
            return;
        }
        let here = self.current();
        self.scopes[here].bindings.push(Binding {
            name: name.to_string(),
            line,
            kind,
        });
    }

    fn bind_name(&mut self, name: &str, line: usize) {
        self.bind(
            name,
            line,
            if name == "require" {
                BindingKind::RequireShadow
            } else {
                BindingKind::Other
            },
        );
    }

    /// The binding that is actually visible at `line`. Inner scopes win, and a
    /// declaration after the call is not visible yet.
    fn latest(&self, name: &str, line: usize) -> Option<BindingKind> {
        let mut cur = Some(self.current());
        while let Some(id) = cur {
            let scope = &self.scopes[id];
            let best = scope
                .bindings
                .iter()
                .filter(|b| b.name == name && b.line <= line)
                .max_by_key(|b| {
                    (
                        b.line,
                        match b.kind {
                            // A same-line alias/shadow is the meaningful binding;
                            // the names loop also records the name as Other before
                            // the value is inspected.
                            BindingKind::Alias | BindingKind::RequireShadow => 1,
                            BindingKind::Other => 0,
                        },
                    )
                });
            if let Some(b) = best {
                return Some(b.kind);
            }
            cur = scope.parent;
        }
        None
    }

    fn note_call(&mut self, name: &str, args: &FunctionArgs, call: &FunctionCall) {
        let line = pos(call.prefix()).0;
        let column = pos(call.prefix()).1;
        if name == "require" {
            if self.latest("require", line) == Some(BindingKind::RequireShadow) {
                return;
            }
            let value = literal_arg(args);
            self.calls.push(RequireCall {
                name: value,
                line,
                column,
                indirect: false,
            });
        } else if self.latest(name, line) == Some(BindingKind::Alias) {
            self.calls.push(RequireCall {
                name: None,
                line,
                column,
                indirect: true,
            });
        }
    }
}

impl Visitor for RequireScan {
    fn visit_block(&mut self, _node: &Block) {
        self.push_scope();
    }

    fn visit_block_end(&mut self, _node: &Block) {
        self.pop_scope();
    }

    fn visit_function_body(&mut self, node: &FunctionBody) {
        self.push_scope();
        let line = pos(node).0;
        for param in node.parameters() {
            if let full_moon::ast::Parameter::Name(name) = param {
                self.bind_name(&name_of(name), line);
            }
        }
    }

    fn visit_function_body_end(&mut self, _node: &FunctionBody) {
        self.pop_scope();
    }

    fn visit_numeric_for(&mut self, node: &NumericFor) {
        self.push_scope();
        self.bind_name(&name_of(node.index_variable()), pos(node).0);
    }

    fn visit_numeric_for_end(&mut self, _node: &NumericFor) {
        self.pop_scope();
    }

    fn visit_generic_for(&mut self, node: &GenericFor) {
        self.push_scope();
        let line = pos(node).0;
        for name in node.names() {
            self.bind_name(&name_of(name), line);
        }
    }

    fn visit_generic_for_end(&mut self, _node: &GenericFor) {
        self.pop_scope();
    }

    fn visit_local_function(&mut self, node: &LocalFunction) {
        self.bind_name(&name_of(node.name()), pos(node).0);
    }

    fn visit_local_assignment(&mut self, node: &LocalAssignment) {
        let line = pos(node).0;
        let mut bindings = Vec::new();
        for name in node.names() {
            let n = name_of(name);
            bindings.push(Binding {
                name: n.clone(),
                line,
                kind: if n == "require" {
                    BindingKind::RequireShadow
                } else {
                    BindingKind::Other
                },
            });
        }
        // `local r = require` makes `r` an indirect require. Only record it if
        // the right-hand side really is the engine's require, not an earlier
        // local shadow.
        for (index, expr) in node.expressions().iter().enumerate() {
            if let Expression::Var(Var::Name(n)) = expr {
                if name_of(n) == "require"
                    && self.latest("require", line) != Some(BindingKind::RequireShadow)
                {
                    if let Some(name) = node.names().iter().nth(index).map(name_of) {
                        bindings.push(Binding {
                            name,
                            line,
                            kind: BindingKind::Alias,
                        });
                    }
                }
            }
        }
        self.pending_locals.push(bindings);
    }

    fn visit_local_assignment_end(&mut self, _node: &LocalAssignment) {
        if let Some(bindings) = self.pending_locals.pop() {
            for binding in bindings {
                self.bind(&binding.name, binding.line, binding.kind);
            }
        }
    }

    fn visit_assignment(&mut self, node: &Assignment) {
        let line = pos(node).0;
        for var in node.variables() {
            if let Var::Name(name) = var {
                let n = name_of(name);
                if n == "require" {
                    self.bind("require", line, BindingKind::RequireShadow);
                }
            }
        }
    }

    fn visit_function_call(&mut self, call: &FunctionCall) {
        let Prefix::Name(name) = call.prefix() else {
            return;
        };
        let n = name_of(name);
        if n.is_empty() {
            return;
        }
        // Only a bare call is the engine's require. `obj.require(...)` and
        // `obj:require(...)` have an Index/MethodCall suffix before the call and
        // are deliberately not claimed.
        let mut suffixes = call.suffixes();
        let Some(Suffix::Call(Call::AnonymousCall(args))) = suffixes.next() else {
            return;
        };
        self.note_call(&n, args, call);
    }
}

fn scan_requires(ast: &full_moon::ast::Ast) -> Vec<RequireCall> {
    let mut scan = RequireScan::new();
    scan.visit_ast(ast);
    scan.calls
}

fn literal_arg(args: &FunctionArgs) -> Option<String> {
    match args {
        FunctionArgs::Parentheses { arguments, .. } => {
            let first = arguments.iter().next()?;
            string_value(first)
        }
        FunctionArgs::String(token) => string_token(token.token_type()),
        _ => None,
    }
}

fn string_value(expr: &Expression) -> Option<String> {
    match expr {
        Expression::String(token) => string_token(token.token_type()),
        Expression::Parentheses { expression, .. } => string_value(expression),
        _ => None,
    }
}

fn string_token(token_type: &TokenType) -> Option<String> {
    let TokenType::StringLiteral {
        literal,
        quote_type,
        ..
    } = token_type
    else {
        return None;
    };
    let raw = literal.to_string();
    match quote_type {
        full_moon::tokenizer::StringLiteralQuoteType::Brackets => Some(raw),
        full_moon::tokenizer::StringLiteralQuoteType::Double
        | full_moon::tokenizer::StringLiteralQuoteType::Single => decode_escapes(&raw),
        _ => None,
    }
}

fn decode_escapes(raw: &str) -> Option<String> {
    let mut out = String::new();
    let mut chars = raw.chars().peekable();
    while let Some(c) = chars.next() {
        if c != '\\' {
            out.push(c);
            continue;
        }
        let Some(next) = chars.next() else {
            return Some(out);
        };
        match next {
            'a' => out.push('\u{7}'),
            'b' => out.push('\u{8}'),
            'f' => out.push('\u{c}'),
            'n' => out.push('\n'),
            'r' => out.push('\r'),
            't' => out.push('\t'),
            'v' => out.push('\u{b}'),
            '\\' => out.push('\\'),
            '"' => out.push('"'),
            '\'' => out.push('\''),
            'z' => {
                while chars.peek().is_some_and(|c| c.is_whitespace()) {
                    chars.next();
                }
            }
            'x' => {
                let mut hex = String::new();
                for _ in 0..2 {
                    if let Some(c) = chars.peek().copied() {
                        if c.is_ascii_hexdigit() {
                            hex.push(c);
                            chars.next();
                        }
                    }
                }
                if hex.is_empty() {
                    return None;
                }
                let v = u8::from_str_radix(&hex, 16).ok()?;
                out.push(v as char);
            }
            'u' => {
                if chars.next() != Some('{') {
                    return None;
                }
                let mut hex = String::new();
                for c in chars.by_ref() {
                    if c == '}' {
                        break;
                    }
                    hex.push(c);
                }
                let v = u32::from_str_radix(&hex, 16).ok()?;
                out.push(char::from_u32(v)?);
            }
            d if d.is_ascii_digit() => {
                let mut dec = String::new();
                dec.push(d);
                for _ in 0..2 {
                    if let Some(c) = chars.peek().copied() {
                        if c.is_ascii_digit() {
                            dec.push(c);
                            chars.next();
                        }
                    }
                }
                let v = dec.parse::<u8>().ok()?;
                out.push(v as char);
            }
            other => out.push(other),
        }
    }
    Some(out)
}

fn module_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= MAX_NAME
        && name.split('/').all(|s| {
            !s.is_empty()
                && s.chars()
                    .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
        })
}

fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id.chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || matches!(c, '_' | '-' | '.'))
}

fn valid_entry(entry: &str) -> bool {
    let Some(stem) = entry.strip_suffix(".lua") else {
        return false;
    };
    !stem.is_empty()
        && stem.split('/').all(|s| {
            !s.is_empty()
                && s.chars()
                    .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
        })
}

fn pack_dirs(mods: &Path) -> Result<Vec<PathBuf>, String> {
    let mut found = Vec::new();
    if !mods.is_dir() {
        return Ok(found);
    }
    for entry in std::fs::read_dir(mods).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        if !entry.file_type().map_err(|e| e.to_string())?.is_dir() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        if is_ignored_folder(&name) {
            continue;
        }
        if name.eq_ignore_ascii_case(MANAGED) {
            if entry.path().join("mod.toml").is_file() {
                found.push(entry.path());
                continue;
            }
            for child in std::fs::read_dir(entry.path()).map_err(|e| e.to_string())? {
                let child = child.map_err(|e| e.to_string())?;
                if child.file_type().map_err(|e| e.to_string())?.is_dir()
                    && !is_ignored_folder(&child.file_name().to_string_lossy())
                {
                    found.push(child.path());
                }
            }
        } else {
            found.push(entry.path());
        }
    }
    found.sort();
    Ok(found)
}

fn is_ignored_folder(name: &str) -> bool {
    name.starts_with('_') || name.starts_with('.')
}

fn derive_mods_root(root: &Path, supplied: Option<&Path>) -> Option<PathBuf> {
    if let Some(supplied) = supplied {
        let supplied = normalize_path(supplied);
        if root.starts_with(&supplied) {
            return Some(supplied);
        }
    }
    if !root.join("mod.toml").is_file() {
        return Some(root.to_path_buf());
    }
    let parent = root.parent()?;
    if parent
        .file_name()
        .is_some_and(|n| n.to_string_lossy().eq_ignore_ascii_case(MANAGED))
        && !parent.join("mod.toml").is_file()
    {
        return parent.parent().map(normalize_path);
    }
    Some(normalize_path(parent))
}

fn walk_lua_files(root: &Path) -> Vec<String> {
    let mut out = Vec::new();
    let mut seen = 0usize;
    fn walk(dir: &Path, rel: &str, depth: usize, out: &mut Vec<String>, seen: &mut usize) {
        if depth > MAX_WALK_DEPTH || *seen >= MAX_WALK_FILES {
            return;
        }
        let Ok(entries) = std::fs::read_dir(dir) else {
            return;
        };
        for entry in entries.flatten() {
            if *seen >= MAX_WALK_FILES {
                return;
            }
            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            let name = entry.file_name().to_string_lossy().into_owned();
            if file_type.is_dir() {
                if matches!(name.as_str(), ".git" | "node_modules" | "target" | "dist" | ".vscode") {
                    continue;
                }
                let child_rel = if rel.is_empty() {
                    name.clone()
                } else {
                    format!("{rel}/{name}")
                };
                walk(&entry.path(), &child_rel, depth + 1, out, seen);
            } else if file_type.is_file() && is_lua(&name) {
                let child_rel = if rel.is_empty() {
                    name
                } else {
                    format!("{rel}/{name}")
                };
                out.push(child_rel);
                *seen += 1;
            }
        }
    }
    walk(root, "", 0, &mut out, &mut seen);
    out.sort();
    out
}

fn is_lua(path: &str) -> bool {
    path.to_ascii_lowercase().ends_with(".lua")
}

fn join_rel(root: &Path, rel: &str) -> PathBuf {
    let mut path = root.to_path_buf();
    for part in Path::new(rel).components() {
        if let Component::Normal(p) = part {
            path.push(p);
        }
    }
    path
}

fn normalize_path(path: &Path) -> PathBuf {
    // `canonicalize` is ideal but fails for unsaved paths. Fall back to a
    // cleaned absolute/relative spelling so equality is still stable.
    std::fs::canonicalize(path).unwrap_or_else(|_| {
        let mut out = PathBuf::new();
        for c in path.components() {
            match c {
                Component::CurDir => {}
                Component::ParentDir => {
                    out.pop();
                }
                other => out.push(other.as_os_str()),
            }
        }
        out
    })
}

fn normalize_rel(path: &str) -> String {
    path.replace('\\', "/")
        .trim_start_matches("./")
        .trim_start_matches('/')
        .to_string()
}

fn folder_name(path: &Path) -> String {
    path.file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string_lossy().into_owned())
}

fn name_of(name: &TokenReference) -> String {
    match name.token().token_type() {
        TokenType::Identifier { identifier } => identifier.to_string(),
        TokenType::Symbol { symbol } => symbol.to_string(),
        _ => String::new(),
    }
}

fn pos<N: Node>(node: &N) -> (usize, usize) {
    match node.start_position() {
        Some(p) => (p.line(), p.character()),
        None => (1, 1),
    }
}

fn fnv1a(text: &str) -> String {
    let mut hash: u64 = 0xcbf29ce484222325;
    for byte in text.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("{hash:016x}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn temp_root(name: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "wf-require-{name}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        root
    }

    fn write(root: &Path, rel: &str, text: &str) {
        let path = join_rel(root, rel);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(path, text).unwrap();
    }

    fn v2(id: &str, deps: &[&str], exports: &[(&str, &str)], entry: &str) -> String {
        let deps = deps.iter().map(|d| format!("{d:?}")).collect::<Vec<_>>().join(", ");
        let mut out = format!(
            "id = {id:?}\napi_version = 4\nformat_version = 2\ndependencies = [{deps}]\n"
        );
        if !exports.is_empty() {
            out.push_str("[exports]\n");
            for (name, path) in exports {
                out.push_str(&format!("{name:?} = {path:?}\n"));
            }
        }
        out.push_str("[[components]]\nid = \"x.feature\"\ntype = \"feature\"\nentry = ");
        out.push_str(&format!("{entry:?}\n"));
        out
    }

    fn run(root: &Path) -> ModCheckReport {
        check(
            1,
            &root.to_string_lossy(),
            root.parent().map(|p| p.to_string_lossy().into_owned()).as_deref(),
            Vec::new(),
            None,
            &[],
        )
    }

    fn rules(report: &ModCheckReport) -> Vec<&str> {
        report.diagnostics.iter().map(|d| d.rule.as_str()).collect()
    }

    #[test]
    fn local_require_resolves_and_cycle_is_reported() {
        let mods = temp_root("local");
        let root = mods.join("a");
        fs::create_dir_all(&root).unwrap();
        write(&root, "mod.toml", &v2("a.pack", &[], &[], "main.lua"));
        write(&root, "main.lua", "local x = require(\"lib/util\")\n");
        write(&root, "lib/util.lua", "return require(\"lib/util\")\n");
        let report = run(&root);
        assert_eq!(report.current_bundle.as_deref(), Some("a.pack"));
        assert!(rules(&report).contains(&"require-cycle"), "{:?}", report.diagnostics);
    }

    #[test]
    fn shared_export_uses_direct_dependencies_and_provider_context() {
        let mods = temp_root("shared");
        let a = mods.join("a");
        let b = mods.join("wf-lib/b");
        fs::create_dir_all(&a).unwrap();
        fs::create_dir_all(&b).unwrap();
        write(
            &a,
            "mod.toml",
            &v2("a.pack", &["b.lib"], &[], "main.lua"),
        );
        write(&a, "main.lua", "return require(\"wf-lib/b/trail\")\n");
        write(
            &b,
            "mod.toml",
            &v2(
                "b.lib",
                &[],
                &[("wf-lib/b/trail", "libs/trail.lua")],
                "libs/main.lua",
            ),
        );
        write(&b, "libs/trail.lua", "return require(\"libs/hat\")\n");
        write(&b, "libs/hat.lua", "return {}\n");
        let report = run(&a);
        assert!(!rules(&report).contains(&"require-missing-export"), "{:?}", report.diagnostics);
        assert!(report.graph.shared_exports.iter().any(|e| e.name == "wf-lib/b/trail"));
    }

    #[test]
    fn transitive_only_export_is_not_visible() {
        let mods = temp_root("transitive");
        let a = mods.join("a");
        let b = mods.join("b");
        let c = mods.join("c");
        for p in [&a, &b, &c] {
            fs::create_dir_all(p).unwrap();
        }
        write(&a, "mod.toml", &v2("a.pack", &["b.lib"], &[], "main.lua"));
        write(&a, "main.lua", "return require(\"wf-lib/c/trail\")\n");
        write(&b, "mod.toml", &v2("b.lib", &["c.lib"], &[], "main.lua"));
        write(&b, "main.lua", "return {}\n");
        write(
            &c,
            "mod.toml",
            &v2("c.lib", &[], &[("wf-lib/c/trail", "trail.lua")], "main.lua"),
        );
        write(&c, "trail.lua", "return {}\n");
        let report = run(&a);
        assert!(rules(&report).contains(&"require-missing-export"), "{:?}", report.diagnostics);
    }

    #[test]
    fn v1_entry_self_require_uses_the_entry_error() {
        let mods = temp_root("v1");
        let root = mods.join("old");
        fs::create_dir_all(&root).unwrap();
        write(
            &root,
            "mod.toml",
            "id = \"old.pack\"\napi_version = 4\nentry = \"rules.lua\"\n",
        );
        write(&root, "rules.lua", "return require(\"rules\")\n");
        let report = run(&root);
        assert!(rules(&report).contains(&"require-entry"), "{:?}", report.diagnostics);
    }

    #[test]
    fn scan_ignores_shadowed_and_dotted_require() {
        let ast = full_moon::parse(
            "local require = function() end\nrequire(\"x\")\nobj.require(\"y\")\nobj:require(\"z\")\n",
        )
        .unwrap();
        assert!(scan_requires(&ast).is_empty());
    }

    #[test]
    fn scan_reads_parentheseless_and_long_string_forms() {
        let ast = full_moon::parse("require \"a/b\"\nrequire [[c/d]]\n").unwrap();
        let calls = scan_requires(&ast);
        assert_eq!(calls.len(), 2);
        assert_eq!(calls[0].name.as_deref(), Some("a/b"));
        assert_eq!(calls[1].name.as_deref(), Some("c/d"));
    }

    #[test]
    fn scan_reports_an_alias_as_indirect() {
        let ast = full_moon::parse("local r = require\nr(\"lib/x\")\n").unwrap();
        let calls = scan_requires(&ast);
        assert_eq!(calls.len(), 1);
        assert!(calls[0].indirect);
        assert!(calls[0].name.is_none());
    }

    #[test]
    fn scan_keeps_block_shadowing_inside_the_block() {
        let ast = full_moon::parse(
            "do local require = function() end require(\"inside\") end\nrequire(\"outside\")\n",
        )
        .unwrap();
        let calls = scan_requires(&ast);
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].name.as_deref(), Some("outside"));
    }

    #[test]
    fn scan_keeps_parameter_shadowing_inside_the_function() {
        let ast = full_moon::parse(
            "local function f(require) require(\"inside\") end\nrequire(\"outside\")\n",
        )
        .unwrap();
        let calls = scan_requires(&ast);
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].name.as_deref(), Some("outside"));
    }

    #[test]
    fn a_local_shadow_is_not_visible_in_its_own_initializer() {
        let ast = full_moon::parse("local require = require(\"lib/outer\")\n").unwrap();
        let calls = scan_requires(&ast);
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].name.as_deref(), Some("lib/outer"));
    }

    #[test]
    fn missing_local_module_is_reported() {
        let mods = temp_root("missing");
        let root = mods.join("a");
        fs::create_dir_all(&root).unwrap();
        write(&root, "mod.toml", &v2("a.pack", &[], &[], "main.lua"));
        write(&root, "main.lua", "return require(\"lib/nope\")\n");
        let report = run(&root);
        assert!(rules(&report).contains(&"require-missing-local"), "{:?}", report.diagnostics);
    }

    #[test]
    fn invalid_module_name_is_reported() {
        let mods = temp_root("invalid");
        let root = mods.join("a");
        fs::create_dir_all(&root).unwrap();
        write(&root, "mod.toml", &v2("a.pack", &[], &[], "main.lua"));
        write(&root, "main.lua", "return require(\"lib/util.lua\")\n");
        let report = run(&root);
        assert!(rules(&report).contains(&"require-invalid-name"), "{:?}", report.diagnostics);
    }

    #[test]
    fn v2_self_require_is_a_cycle_not_the_v1_entry_error() {
        let mods = temp_root("v2self");
        let root = mods.join("a");
        fs::create_dir_all(&root).unwrap();
        write(&root, "mod.toml", &v2("a.pack", &[], &[], "main.lua"));
        write(&root, "main.lua", "return require(\"main\")\n");
        let report = run(&root);
        let rules = rules(&report);
        assert!(rules.contains(&"require-cycle"), "{:?}", report.diagnostics);
        assert!(!rules.contains(&"require-entry"), "{:?}", report.diagnostics);
    }

    #[test]
    fn a_diamond_is_not_a_cycle() {
        let mods = temp_root("diamond");
        let root = mods.join("a");
        fs::create_dir_all(&root).unwrap();
        write(&root, "mod.toml", &v2("a.pack", &[], &[], "main.lua"));
        write(
            &root,
            "main.lua",
            "require(\"lib/a\")\nrequire(\"lib/b\")\n",
        );
        write(&root, "lib/a.lua", "return require(\"lib/c\")\n");
        write(&root, "lib/b.lua", "return require(\"lib/c\")\n");
        write(&root, "lib/c.lua", "return {}\n");
        let report = run(&root);
        assert!(!rules(&report).contains(&"require-cycle"), "{:?}", report.diagnostics);
    }

    #[test]
    fn export_names_are_case_sensitive() {
        let mods = temp_root("case");
        let a = mods.join("a");
        let b = mods.join("b");
        fs::create_dir_all(&a).unwrap();
        fs::create_dir_all(&b).unwrap();
        write(&a, "mod.toml", &v2("a.pack", &["b.lib"], &[], "main.lua"));
        write(&a, "main.lua", "return require(\"wf-lib/b/Trail\")\n");
        write(
            &b,
            "mod.toml",
            &v2("b.lib", &[], &[("wf-lib/b/trail", "trail.lua")], "main.lua"),
        );
        write(&b, "trail.lua", "return {}\n");
        let report = run(&a);
        assert!(rules(&report).contains(&"require-missing-export"), "{:?}", report.diagnostics);
    }

    #[test]
    fn owner_can_require_its_own_export() {
        let mods = temp_root("own");
        let root = mods.join("a");
        fs::create_dir_all(&root).unwrap();
        write(
            &root,
            "mod.toml",
            &v2(
                "a.pack",
                &[],
                &[("wf-lib/a/util", "lib/util.lua")],
                "main.lua",
            ),
        );
        write(&root, "main.lua", "return require(\"wf-lib/a/util\")\n");
        write(&root, "lib/util.lua", "return {}\n");
        let report = run(&root);
        assert!(!rules(&report).contains(&"require-missing-export"), "{:?}", report.diagnostics);
    }

    #[test]
    fn unsaved_overlay_module_resolves() {
        let mods = temp_root("overlay");
        let root = mods.join("a");
        fs::create_dir_all(&root).unwrap();
        write(&root, "mod.toml", &v2("a.pack", &[], &[], "main.lua"));
        write(&root, "main.lua", "return require(\"lib/new\")\n");
        let files = vec![FileInput {
            path: "lib/new.lua".to_string(),
            text: "return {}\n".to_string(),
        }];
        let report = check(
            1,
            &root.to_string_lossy(),
            root.parent().map(|p| p.to_string_lossy().into_owned()).as_deref(),
            Vec::new(),
            None,
            &files,
        );
        assert!(!rules(&report).contains(&"require-missing-local"), "{:?}", report.diagnostics);
        assert!(report.fingerprints.iter().any(|f| f.path == "lib/new.lua"));
    }

    #[test]
    #[ignore = "needs WORMFORGE_MODS pointing at an installed Mods folder"]
    fn corpus_packs_resolve_without_require_errors() {
        let Ok(mods) = std::env::var("WORMFORGE_MODS") else {
            return;
        };
        for name in ["px_electric", "red_saw", "effects_sdk"] {
            let root = PathBuf::from(&mods).join(name);
            if !root.is_dir() {
                continue;
            }
            let report = run(&root);
            let errors: Vec<_> = report
                .diagnostics
                .iter()
                .filter(|d| d.severity == "error" && d.rule.starts_with("require-"))
                .collect();
            assert!(errors.is_empty(), "{name}: {errors:#?}");
        }
    }

    #[test]
    fn derives_the_mods_root_from_a_normal_pack_and_a_wf_lib_shelf() {
        let mods = temp_root("derive");
        let normal = mods.join("normal");
        let shelf = mods.join("wf-lib/shelf");
        fs::create_dir_all(&normal).unwrap();
        fs::create_dir_all(&shelf).unwrap();
        write(&normal, "mod.toml", "id = \"normal\"\n");
        write(&shelf, "mod.toml", "id = \"shelf\"\n");
        assert_eq!(
            derive_mods_root(&normal, None).map(|p| normalize_path(&p)),
            Some(normalize_path(&mods))
        );
        assert_eq!(
            derive_mods_root(&shelf, None).map(|p| normalize_path(&p)),
            Some(normalize_path(&mods))
        );
    }

    #[test]
    fn missing_dependency_is_a_manifest_error() {
        let mods = temp_root("depmissing");
        let root = mods.join("a");
        fs::create_dir_all(&root).unwrap();
        write(&root, "mod.toml", &v2("a.pack", &["nope.lib"], &[], "main.lua"));
        write(&root, "main.lua", "return {}\n");
        let report = run(&root);
        assert!(
            rules(&report).contains(&"bundle-missing-dependency"),
            "{:?}",
            report.diagnostics
        );
    }

    #[test]
    fn duplicate_namespace_in_closure_is_reported() {
        let mods = temp_root("namespace");
        let a = mods.join("a");
        let b = mods.join("b");
        let c = mods.join("c");
        for p in [&a, &b, &c] {
            fs::create_dir_all(p).unwrap();
        }
        write(&a, "mod.toml", &v2("a.pack", &["b.lib", "c.lib"], &[], "main.lua"));
        write(&a, "main.lua", "return {}\n");
        for (id, root) in [("b.lib", &b), ("c.lib", &c)] {
            write(
                root,
                "mod.toml",
                &format!(
                    "id = {id:?}\napi_version = 4\nformat_version = 2\nasset_namespace = \"wf-lib/shared\"\n[[components]]\nid = \"{id}.feature\"\ntype = \"feature\"\nentry = \"main.lua\"\n"
                ),
            );
            write(root, "main.lua", "return {}\n");
        }
        let report = run(&a);
        assert!(
            rules(&report).contains(&"bundle-duplicate-namespace"),
            "{:?}",
            report.diagnostics
        );
    }
}
