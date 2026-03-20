#!/bin/bash
# 设置每日定时任务 - 每天早上9点自动抓取 GitHub 趋势数据

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLIST_NAME="com.github.trending.fetch"
PLIST_PATH="$HOME/Library/LaunchAgents/${PLIST_NAME}.plist"

# 创建 LaunchAgent plist 文件
cat > "$PLIST_PATH" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${PLIST_NAME}</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>${SCRIPT_DIR}/fetch_data.js</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>9</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>${SCRIPT_DIR}/cron.log</string>
    <key>StandardErrorPath</key>
    <string>${SCRIPT_DIR}/cron.log</string>
    <key>RunAtLoad</key>
    <false/>
</dict>
</plist>
EOF

# 加载定时任务
launchctl unload "$PLIST_PATH" 2>/dev/null
launchctl load "$PLIST_PATH"

echo "✅ 定时任务已设置！"
echo "   - 每天早上 9:00 自动抓取 GitHub 趋势数据"
echo "   - 数据保存在: ${SCRIPT_DIR}/data.json"
echo "   - 日志文件: ${SCRIPT_DIR}/cron.log"
echo ""
echo "管理命令:"
echo "   查看状态: launchctl list | grep github.trending"
echo "   停用任务: launchctl unload $PLIST_PATH"
echo "   启用任务: launchctl load $PLIST_PATH"
echo "   手动运行: node ${SCRIPT_DIR}/fetch_data.js"
