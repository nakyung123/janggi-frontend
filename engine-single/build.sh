#!/usr/bin/env bash
# 단일 스레드 엔진(stockfish.js, stockfish.wasm)을 원본 소스에서 다시 만든다.
#
# 쓰는 법: bash engine-single/build.sh <빈 작업 폴더>
# 필요한 것: git, python, Docker
#
# 결과는 <작업 폴더>/out 에 생긴다. 저장소의 파일은 건드리지 않는다.
# 끝에 찍는 SHA-256 을 README.md 의 값과 비교한다. 같으면 저장소의 파일이 이 소스에서 나온 것이다.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="${1:?빈 작업 폴더를 주세요}"

REPO=https://github.com/fairy-stockfish/fairy-stockfish.wasm.git
COMMIT=b2e693ef1e111233ce3fb40685921708b3276ed6 # 태그 1.1.12
# 태그만 적으면 이미지가 바뀌어도 모른다. 지문으로 고정한다.
IMAGE=emscripten/emsdk:2.0.26@sha256:7b0cf19e492e5ea81db8a57b0c70ed2b4e1aec374add832b0104c25a18feafa9

mkdir -p "$WORK"
if [ -n "$(ls -A "$WORK")" ]; then
  echo "작업 폴더가 비어 있지 않습니다: $WORK" >&2
  exit 1
fi

git clone --quiet "$REPO" "$WORK/src"
git -C "$WORK/src" checkout --quiet "$COMMIT"
python -I "$HERE/patch.py" "$WORK/src"

# Windows 의 Git Bash 는 Docker 에 넘길 경로를 Windows 모양으로 줘야 한다.
SRC_PATH="$(cd "$WORK/src" && (pwd -W 2>/dev/null || pwd))"

# 원본의 복사 단계(emscripten_copy_files)는 쓰지 않는다. stockfish.worker.js 를 찾다가 실패하는데,
# 스레드가 없는 빌드라 그 파일이 원래 없다. 결과는 src/ 에 바로 생긴다.
#
# EM_COMMIT 은 엔진 이름(uci 의 id name)에 들어간다. 원본 Makefile 은 git rev-parse --short 로
# 채우는데, 짧은 해시의 길이가 받은 저장소의 크기에 따라 7글자나 8글자로 달라져 wasm 이 달라진다.
# 그래서 고정한다.
MSYS_NO_PATHCONV=1 docker run --rm -v "$SRC_PATH:/app" -w /app/src "$IMAGE" bash -c '
  git config --global --add safe.directory /app
  make build ARCH=wasm embedded_nnue=no EM_COMMIT=b2e693e -j4
'

mkdir -p "$WORK/out"
cp "$WORK/src/src/stockfish.js" "$WORK/src/src/stockfish.wasm" "$WORK/out/"
(cd "$WORK/out" && sha256sum stockfish.js stockfish.wasm)
