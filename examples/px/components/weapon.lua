-- Common component entry; each weapon owns its declaration and runtime code.
return {
  defaults = function(id)
    local path = require("weapons/index")[id]
    return path and require(path).defaults
  end,
  install = function(ctx) require("components/loader").install(ctx) end,
}
