#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CODES_DIR="$SCRIPT_DIR/codes"
OUTPUT_DIR="$SCRIPT_DIR/docker_images"
LOG_FILE="$SCRIPT_DIR/build.log"
ENV_FILE="$SCRIPT_DIR/.env"

mkdir -p "$CODES_DIR" "$OUTPUT_DIR"

if docker compose version &>/dev/null 2>&1; then
  DC="docker compose"
elif command -v docker-compose &>/dev/null; then
  DC="docker-compose"
else
  echo "错误：未找到 docker compose 或 docker-compose，请先安装 Docker Compose。"
  exit 1
fi

COMPONENTS=(
  "QY-RAG|https://github.com/QY-NineClaw/QY-RAG|QY-RAG|main|ragflow|qy-rag:v0.26.1"
)

# 公开镜像（仅供导出功能使用）
PUBLIC_IMAGES=(
  "elasticsearch:8.11.3"
  "pgsty/minio:RELEASE.2026-03-25T00-00-00Z"
  "valkey/valkey:8"
  "pgvector/pgvector:pg17"
)

# ── 工具函数 ──────────────────────────────────────────────────────────────
load_env_for_images() {

  local image
  image=$(grep '^NINECLAW_IMAGE=' "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
  image="${image// /}"

  export NINECLAW_IMAGE="$image"
  for i in "${!COMPONENTS[@]}"; do
    IFS='|' read -r name url dir branch services images <<< "${COMPONENTS[$i]}"
    if [ "$name" = "NineClaw-Runtime" ]; then
      COMPONENTS[$i]="$name|$url|$dir|$branch|$services|$NINECLAW_IMAGE"
      break
    fi
  done
}

# ── 功能1: 系统集成打包 ───────────────────────────────────────────────────

do_build() {
  load_env_for_images || return

  SELECTED_NAMES=()
  for entry in "${COMPONENTS[@]}"; do
    IFS='|' read -r name _ <<< "$entry"
    SELECTED_NAMES+=("$name")
  done

  BUILD_SVCS=()
  declare -gA COMP_DIR COMP_BRANCH COMP_URL

  for entry in "${COMPONENTS[@]}"; do
    IFS='|' read -r name url dir branch services _ <<< "$entry"
    [[ " ${SELECTED_NAMES[*]} " == *" $name "* ]] || continue
    COMP_DIR["$name"]="$dir"
    COMP_BRANCH["$name"]="$branch"
    COMP_URL["$name"]="$url"

    for svc in $services; do
      BUILD_SVCS+=("$svc")
    done
  done

  # 初始化日志
  : > "$LOG_FILE"
  log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

  echo "========================================"
  echo " 构建镜像（共 ${#BUILD_SVCS[@]} 个服务）"
  echo "========================================"
  log "=== 开始构建镜像 ==="
  local build_failed=0
  local build_failed_list=()
  local total_svcs=${#BUILD_SVCS[@]}
  
  for i in "${!BUILD_SVCS[@]}"; do
    local svc="${BUILD_SVCS[$i]}"
    echo ""
    echo "── [$(( i + 1 ))/$total_svcs] 构建：$svc ──"
    log "[INFO] 开始构建：$svc"
    $DC --profile build build "$svc" 2>&1 | tee -a "$LOG_FILE"
    if [ ${PIPESTATUS[0]} -ne 0 ]; then
      log "[ERROR] 构建失败：$svc"
      echo -e "\033[41;37m[ERROR] 构建失败：$svc\033[0m"
      build_failed=1
      build_failed_list+=("$svc")
    else
      log "[INFO] 构建完成：$svc"
    fi
  done

  echo ""
  echo "========================================"
  if [ $build_failed -ne 0 ]; then
    log "=== 构建阶段出现错误 ==="
    echo "以下构建出现错误："
    for failed_svc in "${build_failed_list[@]}"; do
      echo "- $failed_svc"
    done
    exit 1
  else
    log "=== 构建镜像完成 ==="
    echo " 全部构建完成"
    echo "========================================"
  fi
}

# ── 功能2: 容器镜像导出 ───────────────────────────────────────────────────

# 把字节数转成人类可读大小（保留两位小数，如 6.25GB / 512.00MB）
human_size() {
  local s="$1"
  if   (( s >= 1073741824 )); then awk -v b="$s" 'BEGIN{printf "%.2fGB", b/1073741824}'
  elif (( s >= 1048576 ));    then awk -v b="$s" 'BEGIN{printf "%.2fMB", b/1048576}'
  else                             awk -v b="$s" 'BEGIN{printf "%.2fKB", b/1024}'
  fi
}

# 按显示列宽截断字符串（中文按 2 列计），保证不超过 max 列，单行不换行
# 超出部分用 ASCII "..." 表示（避免多字节省略号在部分终端下显示异常）
fit_line() {
  local str="$1" max="$2"
  local mark="..." mlen=3
  local i ch code total=0

  # 第一遍：计算总显示宽度
  for ((i=0; i<${#str}; i++)); do
    ch="${str:i:1}"; printf -v code '%d' "'$ch"
    (( code > 127 )) && total=$(( total + 2 )) || total=$(( total + 1 ))
  done
  if (( total <= max )); then
    printf '%s' "$str"
    return
  fi

  # 第二遍：需要截断，预留 mark 的宽度
  local out="" w=0 cw
  for ((i=0; i<${#str}; i++)); do
    ch="${str:i:1}"; printf -v code '%d' "'$ch"
    (( code > 127 )) && cw=2 || cw=1
    (( w + cw > max - mlen )) && break
    out+="$ch"; w=$(( w + cw ))
  done
  printf '%s%s' "$out" "$mark"
}


do_export() {
  load_env_for_images || return

  # 收集所有可导出镜像
  ALL_IMAGES=("${PUBLIC_IMAGES[@]}")
  for entry in "${COMPONENTS[@]}"; do
    IFS='|' read -r _ _ _ _ _ images <<< "$entry"
    for img in $images; do
      ALL_IMAGES+=("$img")
    done
  done
  SELECTED_IMAGES=("${ALL_IMAGES[@]}")
  local PACK_MODE=2
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] === 开始：容器镜像导出 ===" >> "$LOG_FILE"
  local total=${#SELECTED_IMAGES[@]}

  # 预先获取所有镜像大小，计算加权区间
  declare -a SIZES=()
  local total_size=0
  for image in "${SELECTED_IMAGES[@]}"; do
    sz=$(docker image inspect "$image" --format='{{.Size}}' 2>/dev/null || echo 0)
    [ -z "$sz" ] && sz=0
    SIZES+=("$sz")
    total_size=$(( total_size + sz ))
  done
  # 防止 total_size 为 0
  (( total_size == 0 )) && total_size=1

  local INTERRUPT_FLAG="$SCRIPT_DIR/.export_interrupted"
  rm -f "$INTERRUPT_FLAG"
  EXPORT_PID=""

  if [ "$PACK_MODE" = "2" ]; then
    # ── 文件命名（循环，支持返回重填）────────────────────────────────
    local default_name="qy-rag-images-bundle-$(date '+%Y%m%d').tar.gz"
    local bundle="$OUTPUT_DIR/$default_name"
    printf '%s\n' "XXX" "0" "正在将 $total 个镜像打包为单包..." "XXX"
    docker save "${SELECTED_IMAGES[@]}" 2>>"$LOG_FILE" | gzip > "$bundle" &
    EXPORT_PID=$!

    local est_hr; est_hr="$(human_size "$total_size")"
    while kill -0 "$EXPORT_PID" 2>/dev/null; do
      local cur=0
      [ -f "$bundle" ] && cur=$(stat -c%s "$bundle" 2>/dev/null || echo 0)
      local cur_hr pct
      cur_hr="$(human_size "$cur")"
      pct=$(( cur * 100 / total_size ))
      (( pct > 99 )) && pct=99
      printf '%s\n' "XXX" "$pct" "$(fit_line "正在导出并压缩... 已写入 $cur_hr / ${est_hr}(预估)" "${TEXT_W:-70}")" "XXX"
      sleep 0.5
    done

    wait "$EXPORT_PID"
    if [ $? -ne 0 ]; then
      echo "FAILED: docker save 合并包失败" >> "$LOG_FILE"
      rm -f "$bundle"
      exit 1
    else
      printf '%s\n' "XXX" "100" "✓ 合并单包导出完成" "XXX"
    fi
  else
    # ── 分别导出模式 ──────────────────────────────────────────────────
    local cursor=0
    for ((i=0; i<total; i++)); do
      image="${SELECTED_IMAGES[$i]}"
      output="$OUTPUT_DIR/$(echo "$image" | tr '/:' '-_').tar"
      start_pct=$(( cursor * 100 / total_size ))
      cursor=$(( cursor + SIZES[i] ))
      end_pct=$(( cursor * 100 / total_size ))
      export_image_with_progress "$image" "$output" "$((i+1))" "$total" "$start_pct" "$end_pct" "${SIZES[i]}"
    done
    printf '%s\n' "XXX" "100" "$(fit_line "✓ 全部导出完成（共 $total 个镜像）" "$TEXT_W")" "XXX"
  fi
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] === 结束：容器镜像导出 ===" >> "$LOG_FILE"

}

# ── 主菜单 ────────────────────────────────────────────────────────────────

ACTION="$1"

case "$ACTION" in
    build)
        do_build
        ;;
    export)
        do_export
        ;;
    *)
        # 如果没有传参，或者传了不支持的参数，给出提示
        echo "用法: $0 {build|export}"
        echo "  build  - 执行镜像构建"
        echo "  export - 执行镜像导出/打包"
        exit 1
        ;;
esac
