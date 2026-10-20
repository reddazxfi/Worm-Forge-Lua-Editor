# Working with the user — always loaded

## Their background
- Comfortable in C++. Learning Python and Lua. **TypeScript is outside their
  current knowledge**, and the product they are building is a Lua tool.
- Do not assume familiarity with TS/JS ecosystem idioms, React hooks, or the
  type system.
- When you must explain TypeScript, bridge from C++ or Python. Useful maps:
  - type annotation -> like a C++ declaration or Python annotation
  - `interface` -> a C++ `struct` with only member declarations (no body)
  - `type X = A | B` -> a tagged union, like `std::variant` (discriminated)
  - `?` and `!` -> `std::optional` and an unchecked cast
  - generics `<T>` -> C++ templates; note the JS version is erased at runtime
  - `as` -> a static_cast, with no runtime check
- Lua is the language the user is *modding in*. When explaining parser changes,
  show the Lua behaviour being detected, not just the TypeScript.

## How to explain changes
- Say what changed and why in plain terms, then show the diff.
- Call out anything that affects the user's own Lua mods.
- Prefer one small correct step over a large speculative refactor. This codebase
  was heavily AI-generated and the README already flags it as "vibecoded" with
  rough edges; match that caution.
- The user has been burned by overconfident AI descriptions of this code. If a
  claim about the code is not verified by reading it, do not make it.
