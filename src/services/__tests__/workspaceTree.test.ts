// Phase B: the mod workspace tree.
//
// The two things a reader of this file should be able to check without opening
// the UI:
//
//   1. Every file in a mod appears exactly once in the navigation model, and
//      its path is byte-identical to the editor's buffer key. If that ever
//      drifts, a row opens a second copy of a file that is already open (or
//      saves to the wrong place), because tabs, `dirtyFiles` and `saveModFile`
//      are all keyed by that string.
//
//   2. A file is called an ENTRYPOINT only when a manifest entry resolves to it.
//      `lib/anim.lua` is reachable through `require` and must be listed and
//      editable; it must NOT be called an entrypoint, because nothing starts it.
//      Phase D is where `require` gets resolved; guessing at it here would put a
//      dependency graph on screen that the engine disagrees with.
import { describe, it, expect } from 'vitest';
import {
  buildFileTree,
  buildWorkspaceModel,
  filterFileTree,
  listModFiles,
  openMode,
  type WorkspaceNode,
} from '../workspaceTree';

/** Flattens a tree to `dir/path` strings, for exact shape assertions. */
function flatten(nodes: WorkspaceNode[], prefix = ''): string[] {
  const out: string[] = [];
  for (const n of nodes) {
    if (n.type === 'file') {
      out.push(`${prefix}${n.name}`);
    } else {
      out.push(`${prefix}${n.name}/`);
      out.push(...flatten(n.children, `${prefix}${n.name}/`));
    }
  }
  return out;
}

/** The same files a real pack has: shared entries, deep helpers, profiles. */
const TOOLS_LIKE = {
  'mod.toml':
    'id = "example.tools"\nformat_version = 2\n' +
    '[[components]]\nid = "tools.hello"\ntype = "feature"\nentry = "hello.lua"\n' +
    '[[components]]\nid = "tools.audit"\ntype = "feature"\nentry = "audit/audit.lua"\n' +
    '[[components]]\nid = "tools.shared_a"\ntype = "weapon"\nentry = "weapons.lua"\n' +
    '[[components]]\nid = "tools.shared_b"\ntype = "weapon"\nentry = "weapons.lua"\n',
  'hello.lua': 'print("hi")',
  'weapons.lua': 'print("w")',
  'audit/audit.lua': 'print("a")',
  'audit/cases.lua': 'require("audit.copy")',
  'audit/copy.lua': 'return {}',
  'audit/README.md': '# audit',
  'lib/anim.lua': 'return {}',
  'lib/deep/nested/helper.lua': 'return {}',
  'profiles/Audit home.toml': 'x = 1',
  'profiles/Diagnostics.toml': 'x = 2',
  'notes.txt': 'hello',
};

describe('buildWorkspaceModel: every file is reachable, once', () => {
  it('lists every input key exactly once across all sections', () => {
    const model = buildWorkspaceModel(TOOLS_LIKE);
    const seen = [
      ...model.lua.map((f) => f.path),
      ...model.profiles.map((f) => f.path),
      ...model.docs.map((f) => f.path),
      ...(model.manifestFile ? [model.manifestFile.path] : []),
    ];
    expect(seen.slice().sort()).toEqual(Object.keys(TOOLS_LIKE).sort());
    expect(model.fileCount).toBe(Object.keys(TOOLS_LIKE).length);
  });

  it('keeps buffer keys byte-identical to the input', () => {
    // A backslash-written key must stay backslash-written: it is already the
    // tab key and the save target. Normalising it here would orphan the buffer.
    const files = { 'mod.toml': 'id = "x"\n', 'lib\\win.lua': 'return 1' };
    const model = buildWorkspaceModel(files);
    expect(model.lua.map((f) => f.path)).toEqual(['lib\\win.lua']);
  });

  it('classifies lua, profile, manifest and other files', () => {
    const model = buildWorkspaceModel(TOOLS_LIKE);
    expect(model.manifestFile?.path).toBe('mod.toml');
    expect(model.profiles.map((f) => f.path)).toEqual([
      'profiles/Audit home.toml',
      'profiles/Diagnostics.toml',
    ]);
    expect(model.docs.map((f) => f.path).sort()).toEqual(['audit/README.md', 'notes.txt']);
    expect(model.lua).toHaveLength(7);
  });

  it('reads the bundle id and display name', () => {
    const model = buildWorkspaceModel({
      'mod.toml': 'id = "px.ports"\nname = "Project X ports"\n',
      'rules.lua': 'return 1',
    });
    expect(model.id).toBe('px.ports');
    expect(model.name).toBe('Project X ports');
  });
});

describe('buildWorkspaceModel: entrypoints are declarations, not guesses', () => {
  it('lists distinct entrypoints in manifest order', () => {
    const model = buildWorkspaceModel(TOOLS_LIKE);
    expect(model.entryPoints.map((e) => e.path)).toEqual([
      'hello.lua',
      'audit/audit.lua',
      'weapons.lua',
    ]);
  });

  it('collects every component that shares one entry file', () => {
    const model = buildWorkspaceModel(TOOLS_LIKE);
    const shared = model.entryPoints.find((e) => e.path === 'weapons.lua');
    expect(shared?.componentIds).toEqual(['tools.shared_a', 'tools.shared_b']);
    // ...and the file row carries the same ids, because the tree marks the file
    // rather than showing a second copy of it under a different heading.
    expect(model.lua.find((f) => f.path === 'weapons.lua')?.componentIds).toEqual([
      'tools.shared_a',
      'tools.shared_b',
    ]);
  });

  it('leaves require-only helpers listed but unmarked', () => {
    const model = buildWorkspaceModel(TOOLS_LIKE);
    for (const helper of ['audit/cases.lua', 'audit/copy.lua', 'lib/anim.lua', 'lib/deep/nested/helper.lua']) {
      const f = model.lua.find((x) => x.path === helper);
      // Present: discoverable and editable.
      expect(f, `${helper} must stay reachable`).toBeDefined();
      // Not an entrypoint: nothing in the manifest starts it, and `require` is
      // not resolved here (Phase D).
      expect(f?.componentIds, `${helper} is not an entrypoint`).toEqual([]);
    }
  });

  it('reports an entry whose file is absent instead of matching by name', () => {
    const model = buildWorkspaceModel({
      'mod.toml':
        'id = "x"\n[[components]]\nid = "a"\nentry = "gone.lua"\n' +
        '[[components]]\nid = "b"\nentry = "gone.lua"\n',
      'other.lua': 'return 1',
    });
    expect(model.entryPoints).toEqual([]);
    // One row per missing path, with both components that named it.
    expect(model.unresolvedEntries).toEqual([{ entry: 'gone.lua', componentIds: ['a', 'b'] }]);
  });

  it('treats a v1 top-level entry as the entrypoint', () => {
    const model = buildWorkspaceModel({
      'mod.toml': 'id = "old.pack"\napi_version = 4\nentry = "weapons.lua"\n',
      'weapons.lua': 'return 1',
      'z_scratch.lua': 'return 2',
    });
    expect(model.entryPoints).toEqual([{ path: 'weapons.lua', componentIds: [] }]);
  });

  it('resolves a v1 entry written with backslashes or ./-prefix', () => {
    const model = buildWorkspaceModel({
      'mod.toml': 'entry = "lib\\\\anim.lua"\n',
      'lib/anim.lua': 'return 1',
    });
    expect(model.entryPoints.map((e) => e.path)).toEqual(['lib/anim.lua']);
  });

  it('still lists everything when there is no manifest at all', () => {
    // A loose folder is not loader-ready, but the files must still be openable.
    const model = buildWorkspaceModel({ 'a.lua': '1', 'sub/b.lua': '2' });
    expect(model.manifestPath).toBeNull();
    expect(model.entryPoints).toEqual([]);
    expect(model.lua.map((f) => f.path)).toEqual(['a.lua', 'sub/b.lua']);
    expect(model.manifestFile).toBeNull();
  });
});

describe('listModFiles: the drill-down list', () => {
  it('puts entrypoints first in manifest order, then the rest by path', () => {
    const model = buildWorkspaceModel(TOOLS_LIKE);
    const listing = listModFiles(model);
    expect(listing.lua.map((f) => f.path)).toEqual([
      // manifest order
      'hello.lua',
      'audit/audit.lua',
      'weapons.lua',
      // everything else, alphabetical
      'audit/cases.lua',
      'audit/copy.lua',
      'lib/anim.lua',
      'lib/deep/nested/helper.lua',
    ]);
    expect(listing.entryCount).toBe(3);
  });

  it('lists every Lua exactly once, including require-only helpers', () => {
    const model = buildWorkspaceModel(TOOLS_LIKE);
    const listing = listModFiles(model);
    expect(listing.lua).toHaveLength(model.lua.length);
    expect(new Set(listing.lua.map((f) => f.path)).size).toBe(model.lua.length);
    // `lib/holds.lua`-style modules are the whole point: nothing starts them, so
    // they are not entrypoints, but they are still offered.
    expect(listing.lua.map((f) => f.path)).toContain('lib/anim.lua');
  });

  it('keeps full mod-relative paths rather than basenames', () => {
    // Two files can share a basename; `lib/holds.lua` and `rules.lua` must stay
    // distinguishable in a flat list.
    const listing = listModFiles(
      buildWorkspaceModel({ 'mod.toml': 'id = "x"\n', 'lib/holds.lua': '1', 'holds.lua': '2' })
    );
    expect(listing.lua.map((f) => f.path)).toEqual(['holds.lua', 'lib/holds.lua']);
  });

  it('puts profiles, manifest and documents after the code', () => {
    const listing = listModFiles(buildWorkspaceModel(TOOLS_LIKE));
    expect(listing.extras.map((f) => f.path)).toEqual([
      'profiles/Audit home.toml',
      'profiles/Diagnostics.toml',
      'mod.toml',
      'audit/README.md',
      'notes.txt',
    ]);
  });

  it('is empty when the mod has no Lua', () => {
    const listing = listModFiles(buildWorkspaceModel({ 'mod.toml': 'id = "x"\n', 'README.md': 'x' }));
    expect(listing.lua).toEqual([]);
    expect(listing.entryCount).toBe(0);
    expect(listing.extras.map((f) => f.path)).toEqual(['mod.toml', 'README.md']);
  });
});

describe('openMode: the double-click rule', () => {
  it('browses when there is a choice to make', () => {
    expect(openMode(buildWorkspaceModel({ 'mod.toml': 'id = "x"\n', 'a.lua': '1', 'b.lua': '2' }))).toBe(
      'browse'
    );
  });

  it('opens the editor directly for exactly one Lua', () => {
    expect(openMode(buildWorkspaceModel({ 'mod.toml': 'id = "x"\n', 'a.lua': '1' }))).toBe('editor');
  });

  it('opens the editor directly when there is no Lua at all', () => {
    expect(openMode(buildWorkspaceModel({ 'mod.toml': 'id = "x"\n' }))).toBe('editor');
  });
});

describe('buildFileTree', () => {
  it('nests by directory, directories before files', () => {
    const tree = buildFileTree([
      'z.lua',
      'lib/anim.lua',
      'audit/cases.lua',
      'audit/copy.lua',
      'audit/deep/x.lua',
    ]);
    expect(flatten(tree)).toEqual([
      'audit/',
      'audit/deep/',
      'audit/deep/x.lua',
      'audit/cases.lua',
      'audit/copy.lua',
      'lib/',
      'lib/anim.lua',
      'z.lua',
    ]);
  });

  it('sorts case-insensitively so Windows and Linux agree', () => {
    expect(flatten(buildFileTree(['Zebra.lua', 'apple.lua', 'Mango.lua']))).toEqual([
      'apple.lua',
      'Mango.lua',
      'Zebra.lua',
    ]);
  });

  it('treats backslashes as separators for nesting but keeps the leaf path', () => {
    const tree = buildFileTree(['audit\\cases.lua']);
    expect(flatten(tree)).toEqual(['audit/', 'audit/cases.lua']);
    const dir = tree[0];
    expect(dir.type).toBe('dir');
    if (dir.type === 'dir') {
      expect(dir.children[0]).toMatchObject({ type: 'file', path: 'audit\\cases.lua' });
    }
  });

  it('collapses duplicates instead of drawing one file twice', () => {
    expect(flatten(buildFileTree(['a.lua', 'a.lua']))).toEqual(['a.lua']);
  });

  it('is empty for no files', () => {
    expect(buildFileTree([])).toEqual([]);
  });
});

describe('filterFileTree', () => {
  const tree = buildFileTree(['audit/cases.lua', 'audit/copy.lua', 'lib/anim.lua', 'main.lua']);

  it('keeps matching leaves and their ancestor directories', () => {
    expect(flatten(filterFileTree(tree, 'anim'))).toEqual(['lib/', 'lib/anim.lua']);
  });

  it('matches on the directory part too', () => {
    expect(flatten(filterFileTree(tree, 'audit'))).toEqual([
      'audit/',
      'audit/cases.lua',
      'audit/copy.lua',
    ]);
  });

  it('drops a directory with no surviving descendant', () => {
    expect(flatten(filterFileTree(tree, 'main'))).toEqual(['main.lua']);
  });

  it('returns the tree unchanged for a blank term', () => {
    expect(filterFileTree(tree, '   ')).toBe(tree);
  });
});
