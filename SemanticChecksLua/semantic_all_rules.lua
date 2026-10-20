-- REGRESSION TEST: every semantic rule in one syntactically-valid file.
-- This file MUST pass the real game compiler (no red lua-ast finding at all) --
-- if it doesn't, something in full_moon/the compiler regressed, not the rules below.
-- Everything below is a WARNING or INFO finding from the semantic layer, never an error.
--
-- Load this once per iteration and diff what actually lights up against the
-- comments. Anything extra = a false positive. Anything missing = a regression.
--
-- KNOWN TS-vs-RUST DIVERGENCES IN THIS FILE (measured 2026-10-03 with BOTH
-- engines run over this exact file; full record in compacted-context.md §17-19).
-- READ THIS BEFORE "FIXING" ANY EXPECTATION BELOW -- in one of these cases the
-- honest answer is that NEITHER side is right:
--
--   1. `wa.game_state` DOES NOT EXIST. Zero hits across the whole engine source
--      (`crates/`), recorded in compacted-context.md §11, absent from the developer's
--      own verb list, and re-confirmed by the user on 2026-10-03. Case 17 calls it.
--      So TS flagging `wa.game_state(...)` as `wa-namespace-typo` is CORRECT, and
--      Rust's silence is a false NEGATIVE.
--      THE REASON is worth stating precisely, because the obvious one is wrong: not
--      a "3+ path segments" rule, but that Rust's wa.* check hangs off
--      `visit_function_call`, and case 17 is a `Var` read with no call to hang it
--      on. Measured in case 17's comment. The A5 `state-key-typo` rule that used to
--      cover this line is GONE (compacted-context.md §19): it validated 63 keys
--      against an API the engine never had, so it was deleted rather than repaired.
--   2. TS MISSES the `startX` undefined-global (case 3) when the table key sits
--      INSIDE a function -- the documented bee.lua weakness. At top level TS
--      catches it; inside a function it does not. Rust catches it either way.
--      Here Rust is right.
--   3. Rust-only: `worm:set_state` names are checked (cases 13-16) against the
--      engine's `settable_worm_state()`; parser.ts has no such check. Adjudicated in
--      TS_WEAKER as Rust being more accurate, not noisy.
--
-- The sweep reports this file as AHEAD for `worm-state-typo` (point 3) and shows no
-- drift. Do NOT read either as "Rust winning everything" -- point 1 is a real gap.

------------------------------------------------------------------------------
-- 1. undefined-global, pass A: never bound ANYWHERE in this file.
------------------------------------------------------------------------------
local function passA()
  wa.log(tostring(totallyUnboundName))
  -- EXPECT: 1 finding, rule=undefined-global, on `totallyUnboundName`.
end

------------------------------------------------------------------------------
-- 2. undefined-global, pass B: bound in a DIFFERENT function's scope only
--    (the original headline bug this whole investigation started from).
------------------------------------------------------------------------------
local function passB_defines()
  local r = 5
  return r
end

local function passB_reads()
  wa.log(tostring(r))
  -- EXPECT: 1 finding, rule=undefined-global, on `r`.
  -- `r` is a real local, just in a sibling function's scope, not this one.
end

------------------------------------------------------------------------------
-- 3. undefined-global, the bee.lua case: a TABLE KEY must not look like a binding.
------------------------------------------------------------------------------
local function tableKeyIsNotABinding(opts)
  local spec = {
    startX = opts.x,     -- table KEY -- binds nothing, must not suppress the next line
  }
  local lastSafeX = startX
  -- EXPECT: 1 finding, rule=undefined-global, on `startX` (the bare read, not the key above).
  return spec, lastSafeX
end

------------------------------------------------------------------------------
-- 4. wa-namespace-typo: a real namespace, fake function.
------------------------------------------------------------------------------
local function namespaceTypo()
  wa.weapons.repalce({ weapon = "dynamite" })
  -- EXPECT: 1 finding, rule=wa-namespace-typo, on `repalce`. Message should
  -- suggest "replace".
end

------------------------------------------------------------------------------
-- 5. spec-key-typo: a typo'd key directly inside a wa.weapons.replace spec table.
------------------------------------------------------------------------------
local function specKeyTypo()
  wa.weapons.replace({
    weapon = "dynamite",
    copy_fromm = "bazooka",
    -- EXPECT: 1 finding, rule=spec-key-typo, on `copy_fromm`.
    -- Message should suggest "copy_from".
  })
end

------------------------------------------------------------------------------
-- 6. The SAME shape, but the typo'd key is inside a NESTED callback table,
--    not the spec table itself -- must stay SILENT (this is what the AST port
--    fixed: Field::NameKey only matches a direct spec-table member).
------------------------------------------------------------------------------
local function specKeyTypoInsideCallbackMustBeSilent()
  wa.weapons.replace({
    weapon = "bazooka",
    on_fire = function(a)
      local worm = { ra = 1 }  -- `ra` here looks like a key typo but is NOT inside the spec table
      return worm.ra
    end,
  })
  -- EXPECT: 0 findings from this function. `ra` is a local table field, not a spec key.
end

------------------------------------------------------------------------------
-- 7. worm-api: typo'd member on a `worm` receiver.
------------------------------------------------------------------------------
local function wormApiTypo(worm)
  worm:hurtt(10)
  -- EXPECT: 1 finding, rule=worm-api, on `hurtt`. (This exact snippet is the
  -- one used throughout the whole project as the canonical example.)
end

------------------------------------------------------------------------------
-- 8. actor-api: typo'd member on an `a`/`actor` receiver.
------------------------------------------------------------------------------
local function actorApiTypo(a)
  a:spwn({ sprite = false })
  -- EXPECT: 1 finding, rule=actor-api, on `spwn`.
  -- NOTE: I have not independently re-verified LuaActor's exact member list
  -- against the live engine this session -- if this does NOT fire, it may be
  -- because `spwn`/`spawn` member data drifted, not a checker bug. Tell me
  -- the real member list if so.
end

------------------------------------------------------------------------------
-- 9. handle-union: a `.kind`-ducked receiver calling a method that exists on
--    SOME of the unioned handle classes but not all -- real pattern, adapted
--    directly from highlander/rules.lua's own obj:hurt()/obj:hit() branching.
------------------------------------------------------------------------------
local function handleUnion(obj, amount)
  if obj.kind == "worm" then
    obj:hurt(amount)
    -- EXPECT: exactly ONE aggregated finding, rule=handle-union, severity=INFO,
    -- at THIS line, column 1 -- not a worm-api warning, because `obj` is
    -- ducked by the .kind test below.
  elseif obj.kind == "oil" or obj.kind == "crate" then
    obj:hit(amount)
    -- EXPECT: 0 additional findings here -- the union notice is aggregated
    -- once at the first call site, not repeated per branch.
  end
end

------------------------------------------------------------------------------
-- 10. lockstep-rng: math.random is a desync bug, not just a style nit.
------------------------------------------------------------------------------
local function lockstepRng()
  return math.random(1, 100)
  -- EXPECT: 1 finding, rule=lockstep-rng, severity likely WARNING or stronger
  -- (this is the project's core value-prop check). Message should mention
  -- wa.random as the replacement.
end

------------------------------------------------------------------------------
-- 11. lockstep-pairs: iterating a string-keyed table with pairs().
------------------------------------------------------------------------------
local function lockstepPairs(stateTable)
  for k, v in pairs(stateTable) do
    wa.log(k .. tostring(v))
  end
  -- EXPECT: 1 finding, rule=lockstep-pairs, severity=INFO (this was WARNING
  -- before the §15 fix -- confirm it now shows under the "Info (n)" pill,
  -- not "Warnings (n)").
end

------------------------------------------------------------------------------
-- 12. Indentation sanity check -- the exact bug class that made every
--     receiver-based check silently dead on real (non-column-0) code.
--     This is a duplicate of case 7, just deeply indented and inside nested
--     blocks, the way real pack code actually looks.
------------------------------------------------------------------------------
local function indentedSanityCheck(worm, cond)
    if cond then
        for i = 1, 3 do
            if i == 2 then
                worm:hurtt(5)
                -- EXPECT: 1 finding, rule=worm-api, on `hurtt`, same as case 7.
                -- If THIS one is silent while case 7 fires, the leading-trivia
                -- bug (or a variant of it) has come back.
            end
        end
    end
end

-------------------------------------------------------------------------------
-- 13. state-key-typo (A5): a key the engine never writes. The nastiest
--     failure class in the set -- the assignment SUCCEEDS (no syntax error,
--     no nil), and the value is simply never read back. Silent in-game.
--     RUST-ONLY: parser.ts has no set_state check. See point 3 at the top of file.
-------------------------------------------------------------------------------
local function setStateTypo(worm)
  worm:set_state("slidng")
  -- EXPECT (Rust): 1 finding, rule=worm-state-typo, on `slidng`, suggesting "sliding".
  -- TS: 0 findings.
end

-------------------------------------------------------------------------------
-- 14. The other kind of mistake: `jetpacking` IS a real worm state, but a script
--     may not enter it. The engine pins `settable_worm_state("jetpacking") == None`,
--     so "it exists" is not the same as "you may set it".
-- -------------------------------------------------------------------------------
local function realButNotSettable(worm)
  worm:set_state("jetpacking")
  -- EXPECT (Rust): 1 finding, rule=worm-state-typo, on `jetpacking`, and the message
  -- must say it is a REAL state that cannot be entered -- not call it a typo.
end

-------------------------------------------------------------------------------
-- 15. Every name the engine does accept, including the legacy alias.
-------------------------------------------------------------------------------
local function everySettableStateIsFine(worm)
  worm:set_state("standing")
  worm:set_state("sliding")
  worm:set_state("bungee")
  worm:set_state("tumbling")
  worm:set_state("sinking")   -- legacy alias of tumbling, still accepted
  worm:set_state("teleporting")
  -- EXPECT: 0 findings on both sides.
end

-------------------------------------------------------------------------------
-- 16. ...and the shapes that cannot be judged, or are the author's own. A
--     computed name is not a state we can read; `cfg:set_state` is a user's own
--     table; test_rules.lua DEFINES its own `Worm:set_state` mock, which is
--     nobody's business.
-------------------------------------------------------------------------------
local function setStateShapesThatMustStaySilent(worm, cfg, config)
  worm:set_state(config.state)
  cfg:set_state("whatever")
  -- EXPECT: 0 findings from both lines.
  return worm:set_state(cfg.state)
end

-------------------------------------------------------------------------------
-- 17. state-key-typo (A5) is GONE, and this line is why. `wa.game_state` does not
--     exist: zero hits across the engine's crates/, absent from the developer's own
--     verb list. The 63 keys it validated were generated, not measured.
--
--     MEASURED 2026-10-03, because the obvious explanation is WRONG. Rust is not
--     silent here because of a "3+ path segments" rule -- it is silent because this
--     line is a `Var` READ, not a `FunctionCall`, and the wa.* check only ever runs
--     off `visit_function_call`. Probes that pin the real rule:
--         wa.weapons.repalce()             -> FLAGS  (a call, 3 segments)
--         wa.weapons.repalce().x           -> silent (no call: `.x` is a field read)
--         wa.zzz.yyy()                     -> FLAGS
--         wa.game_state(1).states.AIR_TIME -> silent (no call: this is a Var)
--     So TS flagging `wa.game_state(...)` here is CORRECT and Rust's silence is a
--     false negative of the same family as §17 defect #1: a call-only visitor cannot
--     see a path that is only ever indexed.
--
--     KEEP AS A NEGATIVE: if a real `wa.game_state` ever ships, both findings disappear
--     and this case stops testing anything.
-------------------------------------------------------------------------------
local function gameStateDoesNotExist()
  wa.game_state(1).states.AIR_TIME = 30
  -- EXPECT (Rust): 1 finding, rule=wa-namespace-typo. Correct, for the same reason.
  -- TS: 1 finding, rule=wa-namespace-typo.
  --
  -- CHANGED this session. It used to say `EXPECT (Rust): 0 findings -- no such check
  -- exists, and no call to hang one on`, and Rust did produce zero. The gap was not a
  -- missing rule but a wrong SHAPE: the whole expression parses as a single `Var`, and
  -- the `wa.game_state(1)` inside it is that Var's PREFIX, not a FunctionCall node. A
  -- checker that only hooks `visit_function_call` therefore cannot see it at all, no
  -- matter what it looks for once it is there. `Checker::visit_var` now queues these, so
  -- the count is 1 on both sides.
  --
  -- The messages now AGREE on the path too. Rust says `wa.game_state`, TS says
  -- `wa.game_state`; the phrasing differs but the named API is identical. Getting there
  -- needed a second fix: Rust judges the first two segments after `wa`, which alone would
  -- name `wa.game_state.states` -- fields on the RESULT, not a callable namespace. So an
  -- indexed path is truncated at its call boundary before being named.
end

-------------------------------------------------------------------------------
-- 18. Receiver shapes that MUST stay silent. Each of these produced a real
--     false positive once: the receiver is the token IMMEDIATELY before the
--     colon, NOT the head of the path.
--       - M.sounds[1] is a STRING (string.find), not a handle named `m`
--       - M.sounds    is a field, not a registered receiver name
--       - (a or b)    is an expression, not an identifier
-------------------------------------------------------------------------------
local function receiverShapesThatMustStaySilent(M, a, b)
  local found = M.sounds[1]:find("inflate")
  local head = M.sounds:find("x")
  local either = (a or b):hurt(1)
  -- EXPECT: 0 findings from all three lines.
  return found, head, either
end

-------------------------------------------------------------------------------
-- 19. ...but a dotted name before the colon IS the receiver. `worm` is the
--     token immediately before the colon, so this typo is a real one.
-------------------------------------------------------------------------------
local function dotNameReceiverIsChecked(getWorm)
  getWorm().worm:hurtt(10)
  -- EXPECT: 1 finding, rule=worm-api, on `hurtt`.
end

-------------------------------------------------------------------------------
-- 20. Properties are members too -- parser.ts tests membership with no kind
--     filter, so both halves matter:
--       - ducked `obj:phase()` -> MissileEntity owns it -> handle-union INFO
--       - `m:id()`             -> the ASSUMED handle owns it -> silent
-------------------------------------------------------------------------------
local function propertyOwnership(obj, m)
  if obj.kind == "worm" then
    obj:phase(1)
    -- EXPECT: 1 finding, rule=handle-union, severity=INFO. A different method
    -- from case 9, so a separate aggregated notice.
  end
  m:id()
  -- EXPECT: 0 findings.
end

-------------------------------------------------------------------------------
-- 21. The capability probe: `if wa.x then wa.x() end` is asking "does this API
--     exist?" and handling both answers -- a legitimate question, not a typo.
--     bee.lua:457 does exactly this in the wild, in code that works.
-------------------------------------------------------------------------------
local function capabilityProbe()
  if wa.some_new_capability then
    wa.some_new_capability()
  end
  -- EXPECT: 0 findings.
-------------------------------------------------------------------------------
-- 22. `worm-msg-filter` (INFO): an UNFILTERED `wa.on.worm_message` handler whose
--     every use of `msg` is a comparison against `wa.msg`. The engine can skip
--     the Lua dispatch for every message the handler does not name.
--
--     This is an advisory, NOT a defect: the unfiltered code is correct and runs.
--     It is `info` for the same reason `lockstep-pairs` is.
--
--     The safety rule is what the three EXPECT lines below are really testing:
--     the suggestion is only made when the handler demonstrably ignores every
--     message it does not name. Suggesting the filter where `msg` is USED would
--     change what the handler receives.
-------------------------------------------------------------------------------

-- EXPECT: 1 finding, rule=worm-msg-filter, severity=INFO, naming wa.msg.FRAME_FINISH.
-- The `for` loop is deliberate. `for ... do` is two keywords opening ONE block;
-- counting both is what made the TypeScript half silently miss this case, and the
-- drift sweep is what caught it. A loop in the body is the common shape, so the
-- loopless fixtures would all have passed with the bug still in place.
local function unfilteredFrameHandler()
  wa.on.worm_message(function(worm, msg)
    if msg ~= wa.msg.FRAME_FINISH then
      return
    end
    for _, other in ipairs(wa.worms.all()) do
      other.hp = other.hp
    end
  end)
end

-- EXPECT: 0 findings. The filter is already there, so there is nothing to add.
local function alreadyFiltered()
  wa.on.worm_message(function(worm, msg)
    if msg == wa.msg.JUMP then
      return "eat"
    end
  end, { msgs = { wa.msg.JUMP } })
end

-- EXPECT: 0 findings. `wa.log(msg)` wants the message's VALUE. A filter that
-- dropped it would change what gets printed, so the check stays silent.
local function msgUsedAsAValue()
  wa.on.worm_message(function(worm, msg)
    wa.log(msg)
  end)
end

-- EXPECT: 0 findings. One unsafe use silences the WHOLE handler: the other branch
-- may need a message this check cannot see, so nothing about it can be proved.
local function oneSafeOneUnsafe()
  wa.on.worm_message(function(worm, msg)
    if msg == wa.msg.HIT then
      step()
    end
    wa.log(msg)
  end)
end

-- EXPECT: 0 findings. A named callback is a name, not a body; reading it would
-- mean reading the whole file, which is not something this check does.
local function namedCallback()
end

local function handlerNamed(worm, msg)
  if msg == wa.msg.HIT then
    step()
  end
end

local function useNamedCallback()
  wa.on.worm_message(handlerNamed)
end

-------------------------------------------------------------------------------
-- API 4 additions: new wa.* functions that MUST stay silent (no typo warning)
-- Regression probes for WormForge 0.9.1 / Lua API 4.
-------------------------------------------------------------------------------
local function api4_panel_functions()
  local layout = wa.panel.layout()
  wa.panel.set_layout({ ["px.ninja_star"] = { row = "F1", column = 1 } })
  -- EXPECT: 0 findings. wa.panel.layout and wa.panel.set_layout are real API 4 functions.
end

local function api4_weapons_data()
  local data = wa.weapons.data("stock.bazooka")
  -- EXPECT: 0 findings. wa.weapons.data is real API 4.
end

local function api4_world_set_turn_clock()
  wa.world.set_turn_clock(1000)
  -- EXPECT: 0 findings. wa.world.set_turn_clock is real API 4.
end

local function api4_assets_load()
  wa.assets.load({ sprites = { "sprites/star.png" }, gpu_prefix = "sprites/" })
  -- EXPECT: 0 findings. wa.assets.load is real API 4.
end

-------------------------------------------------------------------------------
-- lockstep-rng render-context scoping: math inside wa.on.draw is presentation
-------------------------------------------------------------------------------
local function math_sin_in_draw_is_silent()
  wa.on.draw(function()
    local x = math.sin(1)
    wa.draw.quad({ points = {{0, 0}, {1, 0}, {1, 1}, {0, 1}}, sprite = "a",
      color = 0xFFFFFFFF })
  end)
  -- EXPECT: 0 findings. math.sin inside wa.on.draw is presentation-only.
end

local function math_cos_outside_draw_is_error()
  local x = math.cos(1)
  -- EXPECT: 1 finding, rule=lockstep-rng, on math.cos.
end

local function math_atan_in_draw_is_silent()
  wa.on.draw(function()
    local a = math.atan(1, 2)
  end)
  -- EXPECT: 0 findings.
end

-------------------------------------------------------------------------------
-- wa.audit only exists in diagnostics builds; on the release surface it is a typo
-------------------------------------------------------------------------------
local function audit_is_a_typo_on_release()
  wa.audit.begin(7)
  -- EXPECT: 1 finding, rule=wa-namespace-typo, on wa.audit.
end

end
