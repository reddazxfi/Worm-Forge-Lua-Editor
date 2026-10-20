#!/usr/bin/env bash
# ---------------------------------------------------------------------------
#  check-mods.sh -- check a folder of WormForge Lua mods (macOS and Linux).
#
#  The counterpart to check-mods.bat, with the same behaviour:
#
#      ./check-mods.sh                     check this folder
#      ./check-mods.sh ~/Mods/mymod        check one pack
#      ./check-mods.sh --strict ~/Mods     warnings fail too
#      ./check-mods.sh --format json . > out.json
#
#  Unlike the .bat there is nothing to pause, so no /nopause switch is needed.
#  Colour turns itself off when the output is a pipe, so redirecting to a file
#  never writes escape codes into it.
# ---------------------------------------------------------------------------
set -u

# Resolve this script's own directory, following symlinks, so the script works
# when it is linked onto a PATH directory.
SOURCE="${BASH_SOURCE[0]}"
while [ -L "$SOURCE" ]; do
    DIR="$(cd -P "$(dirname "$SOURCE")" && pwd)"
    SOURCE="$(readlink "$SOURCE")"
    [[ "$SOURCE" != /* ]] && SOURCE="$DIR/$SOURCE"
done
HERE="$(cd -P "$(dirname "$SOURCE")" && pwd)"

# --- find the binary: beside this script, then the cargo output dirs --------
EXE=""
for candidate in \
    "$HERE/wfcheck" \
    "$HERE/target/release/wfcheck" \
    "$HERE/target/debug/wfcheck"
do
    if [ -x "$candidate" ]; then
        EXE="$candidate"
        break
    fi
done

if [ -z "$EXE" ]; then
    echo "wfcheck was not found."
    echo
    echo "  looked next to this script:  $HERE"
    echo "  looked in the build folder:  target/release/wfcheck"
    echo
    echo "If someone sent you this file, ask them for the wfcheck binary and put"
    echo "the two files in the same folder. If you cloned the repository:"
    echo
    echo "  cd compiler-cli"
    echo "  cargo build --release"
    echo
    exit 2
fi

# --- a bare invocation checks this folder ------------------------------------
if [ "$#" -eq 0 ]; then
    "$EXE" --clear .
else
    "$EXE" "$@"
fi
CODE=$?

echo
if [ "$CODE" -eq 0 ]; then
    echo "All good - nothing to fix."
else
    echo "wfcheck finished with exit code $CODE."
    echo "  1 = it found something   2 = bad arguments   3 = the tool broke"
fi

exit "$CODE"