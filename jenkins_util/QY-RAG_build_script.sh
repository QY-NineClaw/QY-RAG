cd ../QY-RAG
expect -c '
set timeout 600
eval spawn -noecho env TERM=xterm ./build.sh
expect "系统集成打包"
send "\r"
expect "打包模式"
send "\r"
expect "所有组件构建成功"
'