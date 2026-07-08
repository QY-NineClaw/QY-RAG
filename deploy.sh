#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"
ENV_EXAMPLE="$SCRIPT_DIR/env.example"
IMAGES_DIR="$SCRIPT_DIR/docker_images"
NETWORK_NAME="qiyuan_net"

# ── 前置依赖检测 ──────────────────────────────────────────────────────────────

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

validate_env_required() {
  if [ ! -f "$ENV_FILE" ]; then
    whiptail --title ".env 缺失" --ok-button "确认[Enter]" \
      --msgbox "未找到 .env 文件。\n\n请先执行：\n  cp env.example .env\n\n然后按部署环境修改 .env。" 11 62
    return 1
  fi

  local required_keys=(
    ELASTIC_PASSWORD
    MINIO_USER
    MINIO_PASSWORD
    REDIS_PASSWORD
    PG_PASSWORD
    ES_HOST
    ES_PORT
    MINIO_HOST
    MINIO_PORT
    MINIO_CONSOLE_PORT
    REDIS_HOST
    REDIS_PORT
    PG_USER
    PG_EXPOSE_PORT
    RAGFLOW_PG_DBNAME
    SVR_WEB_HTTP_PORT
    SVR_WEB_HTTPS_PORT
    SVR_HTTP_PORT
    ADMIN_SVR_HTTP_PORT
    SVR_MCP_PORT
    GO_HTTP_PORT
    GO_ADMIN_PORT
    MEM_LIMIT
    TZ
    REGISTER_ENABLED
    DOC_BULK_SIZE
    EMBEDDING_BATCH_SIZE
    THREAD_POOL_MAX_WORKERS
    DISABLE_PASSWORD_LOGIN
    DOTNET_SYSTEM_GLOBALIZATION_INVARIANT
    USE_DOCLING
  )
  local missing=()
  local key value

  for key in "${required_keys[@]}"; do
    value=$(grep "^${key}=" "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
    value="${value// /}"
    if [ -z "$value" ]; then
      missing+=("$key")
    fi
  done

  if [ ${#missing[@]} -gt 0 ]; then
    whiptail --title ".env 配置不完整" --ok-button "确认[Enter]" \
      --msgbox ".env 缺少以下必填项或值为空：\n$(printf '  %s\n' "${missing[@]}")\n请参考 env.example 补齐后重试。" \
      $(( ${#missing[@]} + 9 )) 68
    return 1
  fi
}

configure_public_ip_or_domain() {
  local public_host

  while true; do
    public_host=$(whiptail --title "网络配置" \
      --ok-button "确认[Enter]" --cancel-button "取消[ESC]" \
      --inputbox "请输入部署机对外访问 IP 地址。" \
      8 55 \
      3>&1 1>&2 2>&3) || return 1

    public_host="${public_host// /}"
    if [ -z "$public_host" ]; then
      whiptail --title "错误" --ok-button "重新输入[Enter]" \
        --msgbox "IP 地址不能为空，请重新输入。" 7 50
      continue
    fi

    if [[ "$public_host" =~ ^https?:// ]] || [[ "$public_host" == *":"* ]] || [[ "$public_host" == *"/"* ]]; then
      whiptail --title "错误" --ok-button "重新输入[Enter]" \
        --msgbox "这里只填写 IP 或域名本身，不要包含 http://、端口或路径。\n例如：172.18.33.24" 8 65
      continue
    fi

    if whiptail --title "确认对外地址" \
      --yes-button "确认[Enter]" --no-button "重新输入[ESC]" \
      --yesno "以下内容将写入 .env：\n\n  PUBLIC_IP_OR_DOMAIN=${public_host}\n\n确认无误？" 9 60; then
      break
    fi
  done

  if grep -q '^PUBLIC_IP_OR_DOMAIN=' "$ENV_FILE"; then
    sed -i "s|^PUBLIC_IP_OR_DOMAIN=.*|PUBLIC_IP_OR_DOMAIN=${public_host}|" "$ENV_FILE"
  else
    cat >> "$ENV_FILE" <<EOF

PUBLIC_IP_OR_DOMAIN=${public_host}
EOF
  fi

  clear
  echo "========================================"
  echo " 配置 .env"
  echo "========================================"
  echo "PUBLIC_IP_OR_DOMAIN=${public_host} 已写入 .env"
  echo ""
}

# ── RAG 安装 ──────────────────────────────────────────────────────────────

do_install() {
  # 1. 检查并创建 .env
  if [ ! -f "$ENV_FILE" ]; then
    if [ ! -f "$ENV_EXAMPLE" ]; then
      whiptail --title "错误" --ok-button "确认[Enter]" \
        --msgbox "未找到 env.example，无法创建 .env。" 7 50
      return
    fi
    cp "$ENV_EXAMPLE" "$ENV_FILE"
  fi
  validate_env_required || return
  configure_public_ip_or_domain || return

  # 2. 创建 skills_storage 目录
  local skills_dir="$SCRIPT_DIR/skills_storage"
  mkdir -p "$skills_dir"
  chmod 777 "$skills_dir"
  echo "✓ skills_storage 目录已就绪：$skills_dir"

  # 3. 创建 Docker 网络
  clear
  echo "========================================"
  echo " 创建 Docker 网络：$NETWORK_NAME"
  echo "========================================"
  if docker network inspect "$NETWORK_NAME" &>/dev/null; then
    echo "网络 $NETWORK_NAME 已存在，跳过。"
  else
    docker network create "$NETWORK_NAME"
    echo "✓ 网络 $NETWORK_NAME 创建成功。"
  fi

  # 4. 导入镜像
  echo ""
  echo "========================================"
  echo " 导入镜像"
  echo "========================================"

  # 自动检测碎片并合并（支持任意文件名，按 xxx.tar.gz.part* 规律还原）
  local split_dir="$IMAGES_DIR/bundle-split"
  if ls "$split_dir"/*.part* &>/dev/null 2>&1; then
    # 取第一个碎片，去掉 .part### 后缀还原原文件名
    local first_part; first_part=$(ls "$split_dir"/*.part* | sort | head -1)
    local base_name; base_name=$(basename "$first_part" | sed 's/\.part[0-9]*$//')
    local merged="$IMAGES_DIR/$base_name"
    if [ ! -f "$merged" ]; then
      echo "检测到切分文件（$base_name），正在合并..."
      cat "$split_dir/${base_name}.part"* > "$merged"
      echo "✓ 合并完成：$merged"
    else
      echo "检测到切分文件，合并包已存在，跳过合并。"
    fi
  fi

  # 收集所有 .tar / .tar.gz（排除 bundle-split 目录）
  local files=()
  while IFS= read -r f; do
    files+=("$f")
  done < <(find "$IMAGES_DIR" -maxdepth 1 \( -name "*.tar" -o -name "*.tar.gz" \) | sort)

  if [ ${#files[@]} -eq 0 ]; then
    whiptail --title "提示" --ok-button "确认[Enter]" \
      --msgbox "docker_images/ 目录下未找到任何镜像文件。\n请先将镜像包放入该目录。" 9 60
    return
  fi

  local total=${#files[@]}
  local failed=0
  for i in "${!files[@]}"; do
    local f="${files[$i]}"
    local size_bytes; size_bytes=$(stat -c%s "$f" 2>/dev/null || echo 0)
    # 按 80MB/s 估算（HDD 保守值），gzip 解压额外乘 1.8
    local est_sec=$(( size_bytes * 18 / 80 / 1024 / 1024 / 10 ))
    local est_str
    if (( est_sec < 60 )); then
      est_str="预估 < 1 分钟"
    else
      local m=$(( est_sec / 60 )) s=$(( est_sec % 60 ))
      (( s > 0 )) && est_str="预估约 ${m} 分 ${s} 秒" || est_str="预估约 ${m} 分钟"
    fi
    echo ""
    echo "── [$(( i + 1 ))/$total] $(basename "$f")（${est_str}）──"
    docker load -i "$f"
    [ $? -ne 0 ] && echo "[ERROR] 导入失败：$f" && failed=1
  done

  echo ""
  echo "========================================"
  if [ $failed -ne 0 ]; then
    echo " 部分镜像导入失败"
    echo "========================================"
    read -rp "按 Enter 返回..."
    return
  fi
  echo " 全部镜像导入完成"
  echo "========================================"

  # 5. 询问是否启动
  if whiptail --title "安装完成" \
    --yes-button "立即启动[Enter]" --no-button "稍后启动[ESC]" \
    --yesno "所有准备工作已就绪，是否立即启动 RAG？" 8 50; then
    clear
    echo "========================================"
    echo " 启动 RAG"
    echo "========================================"
    $DC -f "$SCRIPT_DIR/docker-compose.yml" up -d
    echo ""
    whiptail --title "启动完成" --ok-button "确认[Enter]" \
      --msgbox "✓ RAG 已启动。" 7 40
  fi
}

# ── RAG 管理 ──────────────────────────────────────────────────────────────

do_manage() {
  validate_env_required || return

  while true; do
    local running
    running=$($DC -f "$SCRIPT_DIR/docker-compose.yml" ps --services --filter status=running 2>/dev/null | wc -l)
    local status_text
    (( running > 0 )) && status_text="运行中（$running 个服务）" || status_text="已停止"

    local choice
    choice=$(whiptail --title "NineClaw 管理" \
      --ok-button "执行[Enter]" --cancel-button "返回[ESC]" \
      --menu "当前状态：$status_text" \
      14 60 4 \
      "1" "随系统开机启动（docker compose up -d）" \
      "2" "关闭随系统启动（docker compose down）" \
      "3" "启动或恢复服务（docker compose restart）" \
      "4" "暂停至下次重启（docker compose stop）" \
      3>&1 1>&2 2>&3) || return

    clear
    case "$choice" in
      1)
        echo "========================================"
        echo " 随系统开机启动"
        echo "========================================"
        $DC -f "$SCRIPT_DIR/docker-compose.yml" up -d
        whiptail --title "完成" --ok-button "确认[Enter]" --msgbox "✓ RAG 已启动，并将随系统自动启动。" 7 55
        ;;
      2)
        if whiptail --title "确认" \
          --yes-button "确认[Enter]" --no-button "取消[ESC]" \
          --yesno "将执行 compose down，容器将被停止并移除。\n确认继续？" 8 55; then
          echo "========================================"
          echo " 关闭随系统启动"
          echo "========================================"
          $DC -f "$SCRIPT_DIR/docker-compose.yml" down
          whiptail --title "完成" --ok-button "确认[Enter]" --msgbox "✓ RAG 已关闭，不再随系统启动。" 7 55
        fi
        ;;
      3)
        echo "========================================"
        echo " 启动或恢复服务"
        echo "========================================"
        $DC -f "$SCRIPT_DIR/docker-compose.yml" restart
        whiptail --title "完成" --ok-button "确认[Enter]" --msgbox "✓ RAG 服务已启动。" 7 45
        ;;
      4)
        echo "========================================"
        echo " 暂停至下次重启"
        echo "========================================"
        $DC -f "$SCRIPT_DIR/docker-compose.yml" stop
        whiptail --title "完成" --ok-button "确认[Enter]" --msgbox "✓ RAG 已暂停，重启宿主机后不会自动恢复。" 7 55
        ;;
    esac
  done
}

# ── RAG 卸载 ─────────────────────────────────────────────────────────

do_uninstall() {
  # 第一步：二次确认
  whiptail --title "RAG 卸载" \
    --yes-button "继续[Enter]" --no-button "取消[ESC]" \
    --yesno "即将卸载 RAG，此操作不可逆。\n\n确认继续？" 8 50 || return

  # 第二步：询问是否删除用户数据
  if whiptail --title "用户数据" \
    --yes-button "删除数据[Enter]" --no-button "保留数据[ESC]" \
    --yesno "是否同时删除用户数据？\n\n【删除】将移除 .env、network、volume 及所有相关镜像\n【保留】仅停止并移除容器，数据保留" \
    10 60; then

    # ── 删除模式 ──
    clear
    echo "========================================"
    echo " 卸载 RAG（删除数据）"
    echo "========================================"

    echo ""
    echo "── 停止并移除容器及数据卷 ──"
    $DC -f "$SCRIPT_DIR/docker-compose.yml" down -v

    echo ""
    echo "── 删除镜像 ──"
    local images
    images=$(grep '^\s*image:' "$SCRIPT_DIR/docker-compose.yml" | awk '{print $2}')
    while IFS= read -r img; do
      echo "删除：$img"
      docker rmi "$img" 2>/dev/null || echo "（跳过，镜像不存在或被其他容器使用）"
    done <<< "$images"

    echo ""
    echo "── 删除 Docker 网络：$NETWORK_NAME ──"
    docker network rm "$NETWORK_NAME" 2>/dev/null && echo "✓ 已删除" || echo "（跳过，网络不存在）"

    echo ""
    echo "── 删除 .env ──"
    rm -f "$ENV_FILE" && echo "✓ 已删除" || echo "（跳过，文件不存在）"

    echo ""
    echo "========================================"
    echo " 卸载完成"
    echo "========================================"
    whiptail --title "卸载完成" --ok-button "确认[Enter]" \
      --msgbox "✓ RAG 已卸载，数据已清除。" 7 50

  else
    # ── 保留模式 ──
    clear
    echo "========================================"
    echo " 卸载 RAG（保留数据）"
    echo "========================================"
    $DC -f "$SCRIPT_DIR/docker-compose.yml" down
    echo ""
    echo "========================================"
    echo " 卸载完成"
    echo "========================================"
    whiptail --title "卸载完成" --ok-button "确认[Enter]" \
      --msgbox "✓ NineClaw 已停止，用户数据已保留。" 7 50
  fi
}

# ── 服务局部更新 ──────────────────────────────────────────────────────────

do_partial_update() {
  validate_env_required || return

  # 从 docker-compose.yml 动态读取所有服务名
  local all_services
  all_services=$($DC -f "$SCRIPT_DIR/docker-compose.yml" config --services 2>/dev/null)
  if [ -z "$all_services" ]; then
    whiptail --title "错误" --ok-button "确认[Enter]" \
      --msgbox "无法读取服务列表，请检查 docker-compose.yml。" 7 55
    return
  fi

  local args=()
  local max_len=0
  while IFS= read -r svc; do
    args+=("$svc" "" "OFF")
    (( ${#svc} > max_len )) && max_len=${#svc}
  done <<< "$all_services"

  # 4（复选框）+ 1（空格）+ 服务名 + 8（边框边距）
  local box_w=$(( max_len + 13 ))
  (( box_w < 40 )) && box_w=40

  local choices
  choices=$(whiptail --title "选择要更新的服务" \
    --ok-button "确认[Enter]" --cancel-button "取消[ESC]" \
    --checklist "空格切换，回车确认：" \
    20 "$box_w" $(wc -l <<< "$all_services") \
    "${args[@]}" \
    3>&1 1>&2 2>&3) || return

  if [ -z "$choices" ]; then
    whiptail --title "提示" --ok-button "确认[Enter]" --msgbox "未选择任何服务。" 7 40
    return
  fi

  # 去掉引号，转成数组
  local selected=()
  for s in $choices; do
    selected+=("${s//\"/}")
  done

  clear
  echo "========================================"
  echo " 局部更新：${selected[*]}"
  echo "========================================"
  echo ""
  echo "── 停止并移除容器 ──"
  $DC -f "$SCRIPT_DIR/docker-compose.yml" down "${selected[@]}"
  echo ""
  echo "── 重新启动 ──"
  $DC -f "$SCRIPT_DIR/docker-compose.yml" up -d "${selected[@]}"
  echo ""
  echo "========================================"
  echo " 更新完成"
  echo "========================================"
  whiptail --title "更新完成" --ok-button "确认[Enter]" \
    --msgbox "✓ 以下服务已更新：\n$(printf '  • %s\n' "${selected[@]}")" \
    $(( ${#selected[@]} + 7 )) 45
}

# ── 主菜单 ────────────────────────────────────────────────────────────────

while true; do
  CHOICE=$(whiptail --title "RAG 部署工具" \
    --ok-button "进入[Enter]" --cancel-button "退出[ESC]" \
    --menu "请选择功能：" 14 50 4 \
    "1" "RAG 安装" \
    "2" "RAG 管理" \
    "3" "RAG 更新" \
    "4" "RAG 卸载" \
    3>&1 1>&2 2>&3) || break

  case "$CHOICE" in
    1) do_install ;;
    2) do_manage ;;
    3) do_partial_update ;;
    4) do_uninstall ;;
  esac
done
