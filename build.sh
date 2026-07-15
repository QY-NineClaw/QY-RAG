#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CODES_DIR="$SCRIPT_DIR/codes"
OUTPUT_DIR="$SCRIPT_DIR/docker_images"
LOG_FILE="$SCRIPT_DIR/build.log"
ENV_FILE="$SCRIPT_DIR/.env"

mkdir -p "$CODES_DIR" "$OUTPUT_DIR"

# ── 前置依赖检测 ──────────────────────────────────────────────────────────────

if ! command -v git &>/dev/null; then
  echo "错误：未找到 git，请先安装：sudo apt install git"
  exit 1
fi

if ! command -v docker &>/dev/null; then
  echo "错误：未找到 docker，请先安装 Docker：https://docs.docker.com/get-started/"
  exit 1
fi

if docker compose version &>/dev/null 2>&1; then
  DC="docker compose"
elif command -v docker-compose &>/dev/null; then
  DC="docker-compose"
else
  echo "错误：未找到 docker compose 或 docker-compose，请先安装 Docker Compose。"
  exit 1
fi

if ! command -v whiptail &>/dev/null; then
  echo "错误：未找到 whiptail，请先安装：sudo apt install whiptail"
  exit 1
fi

# 组件定义: 名称|仓库URL|目录|分支|compose服务(空格分隔)|镜像(空格分隔)
COMPONENTS=(
  "QY-RAG|https://github.com/QY-NineClaw/QY-RAG|QY-RAG|main|ragflow|qy-rag:v0.26.0"
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
  if [ ! -f "$ENV_FILE" ]; then
    whiptail --title ".env 缺失" --ok-button "确认[Enter]" \
      --msgbox "未找到 .env 文件。\n\n请先执行：\n  cp env.example .env\n\n然后确认 .env 中的 RAGFLOW_IMAGE 已设置为合适的镜像 tag。" 12 68
    return 1
  fi

  local image
  image=$(grep '^RAGFLOW_IMAGE=' "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
  image="${image// /}"
  if [ -z "$image" ]; then
    whiptail --title "RAGFLOW_IMAGE 缺失" --ok-button "确认[Enter]" \
      --msgbox ".env 中未设置 RAGFLOW_IMAGE。\n\n请先执行或检查：\n  cp env.example .env\n\n然后设置：\n  RAGFLOW_IMAGE=qy-rag:你的版本号" 13 68
    return 1
  fi
}

# 带进度条执行任务列表
# 用法: run_with_progress "标题" "步骤描述数组名" "命令数组名"
run_with_progress() {
  local title="$1"
  local -n _descs="$2"
  local -n _cmds="$3"
  local total=${#_cmds[@]}

  : > "$LOG_FILE"
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] === 开始：$title ===" >> "$LOG_FILE"

  (
    for ((i=0; i<total; i++)); do
      local pct=$(( (i * 100) / total ))
      echo "$pct"
      echo "# [${_descs[$i]}]"
      echo "[$(date '+%Y-%m-%d %H:%M:%S')] [INFO] 开始：${_descs[$i]}" >> "$LOG_FILE"
      if eval "${_cmds[$i]}" >> "$LOG_FILE" 2>&1; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] [INFO] 完成：${_descs[$i]}" >> "$LOG_FILE"
      else
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] [ERROR] 失败：${_descs[$i]}" >> "$LOG_FILE"
        echo "FAILED:${_descs[$i]}" >> "$LOG_FILE"
      fi
    done
    echo "100"
    echo "# 完成"
  ) | whiptail --title "$title" --gauge "正在处理..." 8 70 0

  echo "[$(date '+%Y-%m-%d %H:%M:%S')] === 结束：$title ===" >> "$LOG_FILE"

  if grep -q "^FAILED:" "$LOG_FILE"; then
    whiptail --title "出现错误" --ok-button "确认[Enter]" --msgbox "部分步骤执行失败，请查看日志：\n$LOG_FILE" 10 60
    return 1
  fi
  return 0
}

select_components() {
  local default="$1"  # ON 或 OFF
  local args=()
  for entry in "${COMPONENTS[@]}"; do
    IFS='|' read -r name _ <<< "$entry"
    args+=("$name" "" "$default")
  done

  local choices
  choices=$(whiptail --title "选择组件" \
    --ok-button "确认[Enter]" --cancel-button "取消[ESC]" \
    --checklist "空格切换，回车确认：" \
    15 60 ${#COMPONENTS[@]} \
    "${args[@]}" \
    3>&1 1>&2 2>&3) || return 1

  SELECTED_NAMES=()
  for name in $choices; do
    SELECTED_NAMES+=("${name//\"/}")
  done
  return 0
}

# 为已选组件选择各自的分支
# 出参：SELECTED_BRANCHES 关联数组  name -> branch
select_branches() {
  declare -gA SELECTED_BRANCHES
  for entry in "${COMPONENTS[@]}"; do
    IFS='|' read -r name _ _ branch _ _ <<< "$entry"
    [[ " ${SELECTED_NAMES[*]} " == *" $name "* ]] || continue
    SELECTED_BRANCHES["$name"]="$branch"
  done

  while true; do
    # 生成当前分支清单文本
    local summary=""
    for name in "${SELECTED_NAMES[@]}"; do
      summary+="  $name（${SELECTED_BRANCHES[$name]}）\n"
    done

    if whiptail --title "分支确认" \
      --yes-button "下一步[Enter]" --no-button "修改分支[ESC]" \
      --yesno "当前各组件分支如下：\n\n${summary}\n是否继续构建过程？" \
      $(( ${#SELECTED_NAMES[@]} + 10 )) 55; then
      return 0
    fi

    # 用户选择修改分支：循环让用户逐个修改
    local args=() idx=1
    for name in "${SELECTED_NAMES[@]}"; do
      args+=("$idx" "$name（${SELECTED_BRANCHES[$name]}）")
      (( idx++ ))
    done

    local choice
    choice=$(whiptail --title "修改分支" \
      --ok-button "选择[Enter]" --cancel-button "返回[ESC]" \
      --menu "选中组件后按回车修改其分支：" \
      $(( ${#SELECTED_NAMES[@]} + 8 )) 60 "${#SELECTED_NAMES[@]}" \
      "${args[@]}" \
      3>&1 1>&2 2>&3) || continue

    local target_name="${SELECTED_NAMES[$(( choice - 1 ))]}"

    local branch_list
    echo "正在读取 $target_name 本地分支信息..." >&2
    branch_list=$(git -C "$CODES_DIR/${COMP_DIR[$target_name]}" branch -r 2>/dev/null | grep -v '\->' | sed 's|.*origin/||' | tr -d ' ')
    if [ -z "$branch_list" ]; then
      whiptail --title "查询失败" --ok-button "确认[Enter]" \
        --msgbox "无法查询 $target_name 的远程分支，请检查网络或仓库权限。" 8 55
      continue
    fi

    local br_args=() i=1
    while IFS= read -r b; do
      br_args+=("$i" "$b")
      (( i++ ))
    done <<< "$branch_list"

    local br_choice
    br_choice=$(whiptail --title "选择分支：$target_name" \
      --ok-button "确认[Enter]" --cancel-button "返回[ESC]" \
      --menu "当前分支：${SELECTED_BRANCHES[$target_name]}" \
      $(( i + 6 )) 50 $(( i - 1 )) \
      "${br_args[@]}" \
      3>&1 1>&2 2>&3) || continue

    SELECTED_BRANCHES["$target_name"]=$(sed -n "${br_choice}p" <<< "$branch_list")
  done
}

select_images() {
  local default="$1"
  shift
  local pool=("$@")
  local args=()
  for img in "${pool[@]}"; do
    args+=("$img" "" "$default")
  done

  local cols; cols=$(tput cols 2>/dev/null || echo 80)
  local max_item=0
  for img in "${pool[@]}"; do
    (( ${#img} > max_item )) && max_item=${#img}
  done
  # 4（复选框）+ 1（空格）+ 条目宽 + 8（边框边距）
  local box_w=$(( max_item + 13 ))
  (( box_w > cols - 4 )) && box_w=$(( cols - 4 ))
  (( box_w > 140 )) && box_w=140
  (( box_w < 60 ))  && box_w=60

  local choices
  choices=$(whiptail --title "选择镜像" \
    --ok-button "确认[Enter]" --cancel-button "取消[ESC]" \
    --checklist "空格切换，回车确认：" \
    20 "$box_w" ${#pool[@]} \
    "${args[@]}" \
    3>&1 1>&2 2>&3) || return 1

  SELECTED_IMAGES=()
  for img in $choices; do
    SELECTED_IMAGES+=("${img//\"/}")
  done
  return 0
}

# ── 功能1: 系统集成打包 ───────────────────────────────────────────────────

do_build() {
  load_env_for_images || return

  # 选择打包范围
  if whiptail --title "打包模式" \
    --yes-button "完整打包" --no-button "局部打包" \
    --yesno "完整打包 → 构建所有组件\n局部打包 → 手动勾选" 8 50; then
    SELECTED_NAMES=()
    for entry in "${COMPONENTS[@]}"; do
      IFS='|' read -r name _ <<< "$entry"
      SELECTED_NAMES+=("$name")
    done
  else
    select_components "OFF" || return
    if [ ${#SELECTED_NAMES[@]} -eq 0 ]; then
      whiptail --title "提示" --ok-button "确认[Enter]" --msgbox "未选择任何组件。" 7 40
      return
    fi
  fi
  # 收集各组件信息 & 构建镜像步骤
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

  # 构建镜像（逐个构建，显示进度）
  clear
  echo "========================================"
  echo " 构建镜像（共 ${#BUILD_SVCS[@]} 个服务）"
  echo "========================================"
  log "=== 开始构建镜像 ==="
  local build_failed=0
  local total_svcs=${#BUILD_SVCS[@]}
  for i in "${!BUILD_SVCS[@]}"; do
    local svc="${BUILD_SVCS[$i]}"
    echo ""
    echo "── [$(( i + 1 ))/$total_svcs] 构建：$svc ──"
    log "[INFO] 开始构建：$svc"
    $DC --profile build build "$svc" 2>&1 | tee -a "$LOG_FILE"
    if [ ${PIPESTATUS[0]} -ne 0 ]; then
      log "[ERROR] 构建失败：$svc"
      echo "[ERROR] 构建失败：$svc"
      build_failed=1
    else
      log "[INFO] 构建完成：$svc"
    fi
  done

  echo ""
  echo "========================================"
  if [ $build_failed -ne 0 ]; then
    log "=== 构建阶段出现错误 ==="
    echo " 构建出现错误"
    echo "========================================"
    read -rp "按 Enter 返回..."
  else
    log "=== 构建镜像完成 ==="
    echo " 全部构建完成"
    echo "========================================"
    local summary=""
    for name in "${SELECTED_NAMES[@]}"; do
      local br="${COMP_BRANCH[$name]}"
      local imgs=""
      for entry in "${COMPONENTS[@]}"; do
        IFS='|' read -r n _ _ _ _ images <<< "$entry"
        [[ "$n" == "$name" ]] && imgs="$images" && break
      done
      for img in $imgs; do
        summary+="  • $img\n"
      done
    done
    whiptail --title "打包完成" --ok-button "确认[Enter]" \
      --msgbox "✓ 所有组件构建成功！\n\n已构建镜像：\n${summary}" \
      $(( ${#BUILD_SVCS[@]} + 10 )) 55
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

# 导出单个镜像，单行显示进度。start_pct/end_pct 为该镜像在全局进度中的区间
export_image_with_progress() {
  local image="$1" output="$2" idx="$3" total="$4"
  local start_pct="$5" end_pct="$6" size="$7"
  local range=$(( end_pct - start_pct ))
  local size_hr; size_hr="$(human_size "$size")"
  local w="${TEXT_W:-70}"
  local line; line="$(fit_line "【$idx/$total】正在导出 $image（$size_hr）..." "$w")"
  local fail; fail="$(fit_line "【$idx/$total】✗ 导出失败 $image" "$w")"

  docker save "$image" > "$output" 2>>"$LOG_FILE" &
  EXPORT_PID=$!
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] [INFO] 开始导出：$image" >> "$LOG_FILE"

  local cur img_pct overall
  while kill -0 "$EXPORT_PID" 2>/dev/null; do
    cur=$(stat -c%s "$output" 2>/dev/null || echo 0)
    (( size > 0 )) && img_pct=$(( cur * 100 / size )) || img_pct=0
    (( img_pct > 99 )) && img_pct=99
    overall=$(( start_pct + img_pct * range / 100 ))
    printf '%s\n' "XXX" "$overall" "$line" "XXX"
    sleep 0.3
  done

  wait "$EXPORT_PID"
  if [ $? -ne 0 ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [ERROR] 导出失败：$image" >> "$LOG_FILE"
    echo "FAILED: docker save 失败: $image" >> "$LOG_FILE"
    rm -f "$output"
    printf '%s\n' "XXX" "$end_pct" "$fail" "XXX"
    return 1
  fi
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] [INFO] 导出完成：$image → $output" >> "$LOG_FILE"
  printf '%s\n' "XXX" "$end_pct" "$line" "XXX"
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

  # 选择导出范围
  if whiptail --title "导出模式" \
    --yes-button "完整导出" --no-button "局部导出" \
    --yesno "完整导出 → 导出所有镜像\n局部导出 → 手动勾选" 8 50; then
    SELECTED_IMAGES=("${ALL_IMAGES[@]}")
  else
    select_images "OFF" "${ALL_IMAGES[@]}" || return
    if [ ${#SELECTED_IMAGES[@]} -eq 0 ]; then
      whiptail --title "提示" --ok-button "确认[Enter]" --msgbox "未选择任何镜像。" 7 40
      return
    fi
  fi

  # 选择打包方式
  local PACK_MODE
  PACK_MODE=$(whiptail --title "打包方式" \
    --ok-button "确认[Enter]" --cancel-button "取消[ESC]" \
    --menu "请选择导出方式：" 10 60 2 \
    "1" "分别导出（每个镜像单独 .tar）" \
    "2" "合并单包（所有镜像压缩为一个 .tar.gz）" \
    3>&1 1>&2 2>&3) || return

  : > "$LOG_FILE"
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] === 开始：容器镜像导出 ===" >> "$LOG_FILE"
  local total=${#SELECTED_IMAGES[@]}

  # 根据终端宽度自适应进度框宽度，尽量完整显示单行内容
  local cols; cols=$(tput cols 2>/dev/null || echo 80)
  local BOX_W=$(( cols - 4 ))
  (( BOX_W > 140 )) && BOX_W=140
  (( BOX_W < 60 ))  && BOX_W=60
  local TEXT_W=$(( BOX_W - 8 ))   # 留出边框与边距，确保单行不换行

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
    local bundle_name bundle
    while true; do
      bundle_name=$(whiptail --title "保存文件名" \
        --ok-button "确认[Enter]" --cancel-button "取消[ESC]" \
        --inputbox "请输入导出文件名：" 8 60 "$default_name" \
        3>&1 1>&2 2>&3) || return
      bundle="$OUTPUT_DIR/$bundle_name"
      if [ -f "$bundle" ]; then
        if whiptail --title "文件已存在" \
          --yes-button "覆盖[Enter]" --no-button "返回重填[ESC]" \
          --yesno "文件已存在：\n$bundle\n\n是否覆盖？" 9 65; then
          break
        fi
        default_name="$bundle_name"
      else
        break
      fi
    done

    # ── 合并单包模式 ──────────────────────────────────────────────────
    (
      trap '
        [ -n "$EXPORT_PID" ] && kill "$EXPORT_PID" 2>/dev/null
        touch "'"$INTERRUPT_FLAG"'"
        exit 1
      ' INT TERM

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
      else
        printf '%s\n' "XXX" "100" "✓ 合并单包导出完成" "XXX"
        sleep 0.6
      fi
    ) | whiptail --title "容器镜像导出（合并单包）" --gauge "准备中..." 8 "$BOX_W" 0
  else
    # ── 分别导出模式 ──────────────────────────────────────────────────
    (
      trap '
        [ -n "$EXPORT_PID" ] && kill "$EXPORT_PID" 2>/dev/null
        touch "'"$INTERRUPT_FLAG"'"
        exit 1
      ' INT TERM

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
      sleep 0.6
    ) | whiptail --title "容器镜像导出" --gauge "准备中..." 8 "$BOX_W" 0
  fi

  if [ -f "$INTERRUPT_FLAG" ]; then
    rm -f "$INTERRUPT_FLAG"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [WARN] 导出被用户中断" >> "$LOG_FILE"
    whiptail --title "已中断" --ok-button "确认[Enter]" --msgbox "导出已被用户中断。" 7 45
    return
  fi

  echo "[$(date '+%Y-%m-%d %H:%M:%S')] === 结束：容器镜像导出 ===" >> "$LOG_FILE"

  if grep -q "^FAILED:" "$LOG_FILE"; then
    local failed_count; failed_count=$(grep -c "^FAILED:" "$LOG_FILE")
    whiptail --title "导出失败" --ok-button "确认[Enter]" --msgbox "$failed_count 个镜像导出失败，请查看日志：\n$LOG_FILE" 9 60
  elif [ "$PACK_MODE" = "2" ]; then
    local bundle_bytes; bundle_bytes=$(stat -c%s "$bundle" 2>/dev/null || echo 0)
    local bundle_size; bundle_size=$(human_size "$bundle_bytes")
    local msg1="✓ 合并单包（$bundle_size）已导出至："
    local msg2="$bundle"
    local mw=$(( ${#msg2} > ${#msg1} ? ${#msg2} : ${#msg1} ))
    (( mw += 6 )); (( mw < 60 )) && mw=60
    whiptail --title "导出完成" --ok-button "确认[Enter]" --msgbox "$msg1\n$msg2" 8 "$mw"

    # 询问是否切分
    if whiptail --title "文件切分" \
      --yes-button "切分[Enter]" --no-button "不切分[ESC]" \
      --yesno "当前文件大小：$bundle_size\n\n是否切分为多个文件？\n（提示：刻录至光盘通常需按 4.35GB 切分）" 10 55; then

      local chunk_str chunk_bytes chunk_str_last="4.35"
      while true; do
        chunk_str=$(whiptail --title "切分大小" \
          --ok-button "确认[Enter]" --cancel-button "取消[ESC]" \
          --inputbox "请输入每个分块的大小（单位 GB，支持小数）：" 8 50 "$chunk_str_last" \
          3>&1 1>&2 2>&3) || return
        chunk_str_last="$chunk_str"

        chunk_bytes=$(awk -v g="$chunk_str" 'BEGIN{printf "%d", g*1024*1024*1024}')
        if (( chunk_bytes <= 0 )); then
          whiptail --title "错误" --ok-button "确认[Enter]" --msgbox "无效的切分大小：$chunk_str" 7 45
          continue
        fi

        local chunk_mb; chunk_mb=$(awk -v b="$chunk_bytes" 'BEGIN{printf "%.0f", b/1024/1024}')
        if whiptail --title "确认切分大小" \
          --yes-button "确认[Enter]" --no-button "上一步[ESC]" \
          --yesno "将按照 ${chunk_str}GB（${chunk_mb}MB）切分" 7 45; then
          break
        fi
      done

      if (( bundle_bytes <= chunk_bytes )); then
        whiptail --title "无需切分" --ok-button "确认[Enter]" \
          --msgbox "文件大小（$bundle_size）未超过切分块大小（${chunk_str}GB），无需切分。" 8 60
        return
      fi

      local split_dir="$OUTPUT_DIR/bundle-split"
      mkdir -p "$split_dir"

      if [ -n "$(ls -A "$split_dir" 2>/dev/null)" ]; then
        if whiptail --title "目录非空" \
          --yes-button "清空[Enter]" --no-button "取消[ESC]" \
          --yesno "切分目录已有文件：\n$split_dir\n\n继续将清空该目录，确认？" 9 65; then
          rm -f "$split_dir"/*
        else
          return
        fi
      fi

      split -b "$chunk_bytes" -d --suffix-length=3 "$bundle" "$split_dir/${bundle_name}.part"

      rm -f "$bundle"

      local part_count; part_count=$(ls "$split_dir/${bundle_name}.part"* 2>/dev/null | wc -l)
      whiptail --title "切分完成" --ok-button "确认[Enter]" \
        --msgbox "✓ 已切分为 $part_count 个文件（每块 ${chunk_str}GB）\n输出目录：$split_dir\n\n合并命令：\n  cat ${bundle_name}.part* > ${bundle_name}" \
        12 70
    fi
  else
    local msg1="✓ 全部 $total 个镜像已导出至："
    local mw=$(( ${#OUTPUT_DIR} > ${#msg1} ? ${#OUTPUT_DIR} : ${#msg1} ))
    (( mw += 6 )); (( mw < 60 )) && mw=60
    whiptail --title "导出完成" --ok-button "确认[Enter]" --msgbox "$msg1\n$OUTPUT_DIR" 8 "$mw"
  fi
}

# ── 主菜单 ────────────────────────────────────────────────────────────────

while true; do
  CHOICE=$(whiptail --title "RAGFLOW 构建工具" \
    --ok-button "进入[Enter]" --cancel-button "退出[ESC]" \
    --menu "请选择功能：" 12 50 2 \
    "1" "系统集成打包" \
    "2" "容器镜像导出" \
    3>&1 1>&2 2>&3) || break

  case "$CHOICE" in
    1) do_build ;;
    2) do_export ;;
  esac
done
