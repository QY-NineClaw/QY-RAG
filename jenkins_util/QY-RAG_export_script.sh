rm -f ../QY-RAG/docker_images/*
cd ../QY-RAG
expect -c '
set timeout 600
eval spawn -noecho env TERM=xterm ./build.sh
expect "容器镜像导出"
send "\033\[B"
send "\r"
expect "导出模式"
send "\r"
expect "打包方式"
send "\033\[B"
send "\r"
expect "保存文件名"
send "\r"
expect "导出至"
send "\r"
expect "文件切分"
send "\r"
expect "切分大小"
send "\r"
expect "确认切分大小"
send "\r"
expect "无需切分"
send "\r"
expect "容器镜像导出"
'