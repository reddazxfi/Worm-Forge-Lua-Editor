import { describe, it, expect } from 'vitest';
import { parseAndValidate } from '../parser';

/** Every rule a snippet raised. */
const rulesOf = (src: string): string[] =>
  parseAndValidate(src).diagnostics.map((d) => d.rule ?? '');

/**
 * The 1.0 verb review, as the editor sees it.
 *
 * The engine tree is between releases while the maintainer finishes the review,
 * so this pins what has already moved: the renamed and removed verbs, the actor
 * properties that replaced one-field setters, and the new engine verbs the
 * editor must not report as typos. When the next `api_version` lands, this file
 * is the place to re-check the public surface.
 */
describe('1.0 verb review: the new surface is real', () => {
  const silent = [
    // Weather layers, in the engine since 1.0.
    'wa.on.draw(function()\n  wa.draw.tiles({ sprite = "sprites/rain", size = 8, x = 0, y = 0, view = { x = 0, y = 0, w = 100, h = 100 } })\nend)',
    'wa.on.draw(function()\n  wa.draw.flakes({ sprite = "sprites/snow", frames = { 0, 1 }, cell = 24, size = 3, view = { x = 0, y = 0, w = 100, h = 100 } })\nend)',
    'wa.on.draw(function()\n  wa.draw.puffs({ sprite = "sprites/cloud", rows = 3, y = 20, spacing = 120, gap = 40, view = { x = 0, y = 0, w = 100, h = 100 } })\nend)',
    // A draw brush, created once and drawn from wa.on.draw.
    'local b = wa.draw.brush({ sprite = "sprites/Glow.png", blend = "add" })\nwa.on.draw(function() b:box(10, 20, 8, 6, 0.5) end)',
    'local b = wa.draw.brush({ sprite = "sprites/Glow.png" })\nwa.on.draw(function() b:boxes({}, 0) end)',
    'local b = wa.draw.brush({ sprite = "sprites/Glow.png" })\nwa.on.draw(function() b:quads({}, 0) end)',
    // WA's utility tray, the arrow fields and the arrow-land event (1.0 RC5).
    'local u = wa.hud.utilities.add({ weapon = "stock.low_gravity", team = 1 })\nu:remove()',
    'local function f(worm)\n  local u = wa.hud.utilities.add({ weapon = "stock.low_gravity", worm = worm })\n  return u:is_open()\nend',
    'wa.on.arrow_land(function(ev)\n  local a, x, frame, weapon = ev.arrow, ev.x, ev.frame, ev.weapon\nend)',
    'local function f(arrow)\n  arrow.visible = false\n  local frame, weapon = arrow.frame, arrow.weapon\nend',
    'local e = wa.hud.tray.add({ text = "F4", team = 1, greyed = true })\ne:set({ greyed = false })',
    'local function f(worm) wa.sound.play(worm, 8, { pitch = 3 }) end',
    // Screen-space HUD drawing.
    'wa.on.hud(function()\n  local w, h = wa.hud.size()\n  wa.hud.rect({ x = 0, y = 0, w = 120, h = 24 })\n  wa.hud.sprite({ sprite = "sprites/icon", x = 8, y = 8 })\n  wa.hud.text({ text = "Turn 3", x = 8, y = 8 })\nend)',
    // A pack's own panel.
    'local replaced = wa.panel.replace()',
    'wa.on.hud(function()\n  local m = wa.panel.mouse()\n  wa.panel.capture()\n  wa.panel.select("px.javelin")\nend)',
    // Crate odds and team surrender.
    'local odds = wa.crates.odds()',
    'wa.crates.set_odds({ weapon = 60, health = 25, utility = 15 })',
    'local shares = wa.crates.shares()',
    'wa.crates.set_shares({ ["px.javelin"] = 40, ["stock.bazooka"] = false })',
    'wa.crates.set_drop("pop", { pitch = 3, height = { min = 30, max = 50 } })',
    'wa.crates.set_drop(false)',
    'local panel = wa.panel.stock()',
    'wa.teams.surrender(2)',
    'local gone = wa.teams.surrendered(2)',
    // Renamed and new handle members.
    'local function f(worm) worm:hit(10) end',
    'local function f(a) a:remove() end',
    'local function f(a) a.gravity = 1; a.visible = false; a.camera = 2 end',
    'local function f(a) a:gfx({ angle = 45, scale = 2, tint = 0xFF8000, blend = "add" }) end',
    'local function f(worm) worm:release(0, 0) end',
    // 1.0 adds these on the worm and on the view/sound namespaces.
    'local function f(worm) worm.mass = 2; worm.shape = "mine" end',
    'local function f(worm) worm:commit_health(); worm:die{ settled = true }; worm:teleport_pose() end',
    'local sky = wa.world.sky()',
    'local function f(worm) worm:take{ fire = true, turn = "freeze" }; worm:set_state("falling") end',
    'wa.on.hud(function() wa.hud.line("Score", { font = "medium", color = "yellow" }) end)',
    'local h = wa.sound.ambient({ path = "sounds/rain.wav", volume = 0.6 })',
    'local function f(h) h:set({ volume = 0.3, fade_ms = 500 }); h:stop({ fade_ms = 500 }) end',
    'wa.view.disable_zoom()',
    // A weapon claim's new pose source.
    'wa.weapons.replace({ copy_from = "stock.bazooka", hold_as = "stock.grenade" })',
    'wa.weapons.replace({ copy_from = "stock.bazooka", collects_crates = false })',
    // 1.0 RC6: the frame event, point explosions and fields, this machine's keys and panel.
    'wa.on.frame(function()\n  local n = wa.world.frame()\nend)',
    'wa.on.frame(function()\n  wa.world.explode({ x = 100, y = 200, owner = "none" })\nend)',
    'wa.on.hud(function()\n  local held = wa.hud.key("shift")\n  local closed = wa.panel.close()\nend)',
    'local field = wa.magnetism.field({ x = 100, y = 200 })\nwa.on.frame(function() field:move(120, 200) end)',
    'local mine = wa.mines.spawn({ owner = "none", x = 100, y = 200 })',
    'local hit = wa.world.trace({ x0 = 0, y0 = 0, x1 = 10, y1 = 10, with = { "actors", "missiles" }, grab = { "worm" } })',
    // Actors sleep, and report what they are; worms carry the selected weapon's shot count.
    'local function f(a)\n  a:sleep(30, { near = 64 })\n  return a.alive, a.grab\nend',
    'local function f(a) a.grab = "worm" end',
    'local function f(worm)\n  worm.shots = 3\n  return worm.shots_used\nend',
    'local function f(object) return object.alive end',
    'local function f(mine) mine.fuse = -1 end',
  ];

  it.each(silent)('%s is real 1.0 API and produces no finding', (src) => {
    expect(rulesOf(src)).toEqual([]);
  });
});

describe('1.0 verb review: the removed surface is caught', () => {
  it('flags worm:hurt (now worm:hit)', () => {
    const d = parseAndValidate('local function f(worm) worm:hurt(10) end').diagnostics.find(
      (x) => x.rule === 'worm-api'
    );
    expect(d?.message).toContain('hurt');
  });

  it('flags a:despawn (now a:remove)', () => {
    const d = parseAndValidate('local function f(a) a:despawn() end').diagnostics.find(
      (x) => x.rule === 'actor-api'
    );
    expect(d?.message).toContain('despawn');
  });

  it('flags a:gravity() (now the a.gravity factor)', () => {
    const d = parseAndValidate('local function f(a) a:gravity() end').diagnostics.find(
      (x) => x.rule === 'actor-api'
    );
    expect(d?.message).toContain('gravity');
  });

  it('flags a:angle, a:scale, a:tint and a:blend (now a:gfx)', () => {
    for (const call of ['a:angle(45)', 'a:scale(2)', 'a:tint(0xFF0000)', 'a:blend("add")']) {
      expect(
        parseAndValidate(`local function f(a) ${call} end`).diagnostics.some(
          (x) => x.rule === 'actor-api'
        ),
        call
      ).toBe(true);
    }
  });

  it('flags worm:air_fire', () => {
    const d = parseAndValidate('local function f(worm) worm:air_fire(true) end').diagnostics.find(
      (x) => x.rule === 'worm-api'
    );
    expect(d?.message).toContain('air_fire');
  });

  it('flags worm:drop (now worm:release(0, 0))', () => {
    const d = parseAndValidate('local function f(worm) worm:drop() end').diagnostics.find(
      (x) => x.rule === 'worm-api'
    );
    expect(d?.message).toContain('drop');
  });

  it('flags wa.on.gravity_before and wa.on.gravity_after', () => {
    for (const hook of ['gravity_before', 'gravity_after']) {
      const d = parseAndValidate(`wa.on.${hook}(function(m) m.vx = 0 end)`).diagnostics.find(
        (x) => x.rule === 'wa-namespace-typo'
      );
      expect(d, hook).toBeTruthy();
      expect(d?.message).toContain(`wa.on.${hook}`);
    }
  });

  it('flags a:advance (now a:frame with your own counter)', () => {
    const d = parseAndValidate('local function f(a) a:advance() end').diagnostics.find(
      (x) => x.rule === 'actor-api'
    );
    expect(d?.message).toContain('advance');
  });

  it('flags worm:allow_death (now worm:die{ settled = true })', () => {
    const d = parseAndValidate('local function f(worm) worm:allow_death() end').diagnostics.find(
      (x) => x.rule === 'worm-api'
    );
    expect(d?.message).toContain('allow_death');
  });

  it('flags wa.actors.kind', () => {
    const d = parseAndValidate('wa.actors.kind("sentry")').diagnostics.find(
      (x) => x.rule === 'wa-namespace-typo'
    );
    expect(d?.message).toContain('wa.actors.kind');
  });

  it('flags a misspelled brush method', () => {
    const d = parseAndValidate(
      'local brush = wa.draw.brush({ sprite = "sprites/Glow.png" })\nwa.on.draw(function() brush:boxx(1, 2, 3, 4) end)'
    ).diagnostics.find((x) => x.rule === 'brush-api');
    expect(d?.message).toContain('boxx');
  });

  it('flags wa.draw.quads (now brush:boxes or brush:quads)', () => {
    const d = parseAndValidate(
      'wa.on.draw(function() wa.draw.quads({ quads = {}, sprite = "spark" }) end)'
    ).diagnostics.find((x) => x.rule === 'wa-namespace-typo');
    expect(d?.message).toContain('wa.draw.quads');
  });

  it('flags wa.weapons.register (gone in 1.0; use wa.weapons.replace)', () => {
    const d = parseAndValidate('wa.weapons.register({ id = "x" })').diagnostics.find(
      (x) => x.rule === 'wa-namespace-typo'
    );
    expect(d?.message).toContain('wa.weapons.register');
  });

  it('flags a claim key 1.0 removed, and accepts hold_as', () => {
    for (const key of ['actor', 'airborne']) {
      const d = parseAndValidate(
        `wa.weapons.replace({ ${key} = ${key === 'airborne' ? 'true' : '"drop"'} })`
      ).diagnostics.find((x) => x.rule === 'spec-key-typo');
      expect(d, key).toBeTruthy();
    }
    expect(
      parseAndValidate('wa.weapons.replace({ hold_as = "stock.grenade" })').diagnostics
    ).toEqual([]);
  });
});
