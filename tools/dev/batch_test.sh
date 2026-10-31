#!/usr/bin/env bash
# 批量把卡带编译成官方 sim 的 binary.js 并跑 2 秒，输出首帧 PNG
# 用法: bash tools/build/batch_test.sh <card.png>... [--extdir=DIR]
set -u
cd "$(dirname "$0")/../.." || exit 1

EXTDIR=""
CARDS=()
for a in "$@"; do
  case "$a" in
    --extdir=*) EXTDIR="${a#--extdir=}" ;;
    *) CARDS+=("$a") ;;
  esac
done

OUTROOT="${TMPDIR:-/tmp}/batchout"
mkdir -p "$OUTROOT"

pass=0; fail=0; failed_list=()
printf "%-28s %-10s %-12s %s\n" "CARD" "COMPILE" "FRAMES" "NONBLACK"
printf "%.0s-" $(seq 1 66); echo

for card in "${CARDS[@]}"; do
  name=$(basename "$card" .png)
  work="$OUTROOT/$name"
  rm -rf "$work"; mkdir -p "$work"
  extarg=""
  [ -n "$EXTDIR" ] && extarg="--extdir=$EXTDIR"

  if timeout 300 node tools/dev/cart_build.js "$card" -o "$work" $extarg > "$work/build.log" 2>&1; then
    comp="ok"
  else
    printf "%-28s %-10s %-12s %s\n" "$name" "FAIL" "-" "$(tail -1 "$work/build.log" | cut -c1-40)"
    fail=$((fail+1)); failed_list+=("$name(compile)")
    continue
  fi

  if timeout 60 node tools/dev/sim_run.js "$work/binary.js" --ppm="$work/frame.ppm" > "$work/run.log" 2>&1; then
    frames=$(grep -o "screen pushes: [0-9]*" "$work/run.log" | head -1 | awk '{print $3}')
    nonblack=$(grep -o "non-black px: [0-9]*" "$work/run.log" | head -1 | awk '{print $3}')
    if node tools/dev/ppm2png.js "$work/frame.ppm" "$work/frame.png" > /dev/null 2>&1; then :; fi
    printf "%-28s %-10s %-12s %s\n" "$name" "$comp" "${frames:-0}" "${nonblack:-0}"
    pass=$((pass+1))
  else
    printf "%-28s %-10s %-12s %s\n" "$name" "ok" "CRASH" "$(grep -m1 'crash\|FAILED\|Error' "$work/run.log" | cut -c1-40)"
    fail=$((fail+1)); failed_list+=("$name(run)")
  fi
done

echo
echo "PASS=$pass FAIL=$fail"
[ ${#failed_list[@]} -gt 0 ] && echo "failed: ${failed_list[*]}"
echo "artifacts: $OUTROOT"
