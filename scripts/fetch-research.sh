#!/usr/bin/env bash
# Re-creates research/repos/ — community OP-XY projects studied for this app.
# Shallow clones; safe to re-run. See docs/research/INDEX.md for what each one is for.
set -euo pipefail
cd "$(dirname "$0")/../research"
mkdir -p repos && cd repos
REPOS=(
  kmorrill/xy-format kmorrill/op-xy-vibing kmorrill/op-xy-generator jshph/opxy-reactive
  ish-/te-opxy-patchstudio buba447/opxy-drum-tool buba447/OPXY-Multisample-Tool
  sixthlaw/opxy-multisampler-preset-builder kennethreitz/pytheory-opxy aliosa27/op-xy-slicer
  niekert/op-xy-drum-builder charlesvestal/sf2-to-opxy matthewjschultz/swift-te brian3kb/digichain
  foxxyz/op-xy-patch-generator YYUUGGOO/OP-XY-Drum-Utility paul-sneddon/teopxy legsmechanical/opxy-to-sfz
  cfurrow7/dx7-opxy cfurrow7/opxy-converter cfurrow7/rings-multisampler akselele/xympler
  DimaDake/maschine-multisample-to-op-xy-converter inrainbws/logic_pro_drums_for_opxy
  om3opr/stembounce mofongo/opxy-stems gobelinor/stem-extractor
  buba447/LaunchpadPrefs-OPXY kazuochi/opxy-deck benjaminr/mcp-koii
  bnjreece/awesome-te gravitinos/opxy-tutor chrisyoung0101/op-xy-cheat-sheet
  mitchivin/te-opxy arnaudgreiner/nts-radio idroz/mezmer thinkthoughts/te-op-xy-app
  langchain-ai/deepagentsjs
)
for r in "${REPOS[@]}"; do
  d="${r//\//_}"
  [ -d "$d" ] && continue
  git clone --depth 1 -q "https://github.com/$r.git" "$d" && echo "cloned $r" || echo "FAILED $r"
done
