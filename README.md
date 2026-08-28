# 部署指南
## 前置要求

- [Docker & Docker Compose](https://www.docker.com/get-started/) 
```
docker --version   # 版本 Docker Engine >= v23.0
docker compose version  # 版本 Docker Compose >= v2.20
```

### 项目结构

```
├── docker-compose.yml			# 服务编排（所有服务定义 + 构建路径）
├── env.example             	# 环境变量模板（需改名为 .env 并结合实际情况配置）
├── deploy.sh               	# 交互式部署工具（TUI）
├── load_images.sh				# 批量导入镜像包脚本（用于手工部署安装）
├── docker_images/          	# 镜像包存放目录
│   └── bundle-split/       	# 切分文件输出目录
├── service_conf.yaml.template  # ragflow 系统级配置模板
└── entrypoint.sh           	# ragflow 启动入口脚本
```

## 一键部署安装
> 一键部署脚本依赖 `whiptail`（大多数 Linux 发行版已预装）如果没有安装请参考下方《手工部署安装》
```
./deploy.sh  # 根据界面引导安装
```

## 手工部署安装
```
./load_images.sh
cp env.example .env

docker compose up  # 启动系统
