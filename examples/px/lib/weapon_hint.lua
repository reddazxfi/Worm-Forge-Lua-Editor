-- Weapon hints and notices: the shared tooltip window (wf-lib/tooltip).

local tooltip = require("wf-lib/tooltip")
return { register = tooltip.hint, hint = tooltip.hint, notice = tooltip.notice }
