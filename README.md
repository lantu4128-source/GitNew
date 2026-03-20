# GitHub 每日趋势

一个简洁的本地工具，每日自动抓取 GitHub 热门项目并展示。

## 功能

- **今日最高星标 Top 10** - 当天有更新的所有项目中，总星标数最高的 10 个
- **近期新项目 Top 10** - 过去 7 天新创建且当天有更新的热门项目
- **历史数据浏览** - 支持查看过去 30 天的数据
- **一键翻译** - 将英文描述翻译成中文
- **定时抓取** - 支持配置每日自动更新

## 快速开始

```bash
# 1. 克隆项目
git clone https://github.com/你的用户名/github-trending.git
cd github-trending

# 2. 抓取数据
node fetch_data.js

# 3. 启动本地服务器
python3 -m http.server 8080

# 4. 打开浏览器访问
open http://localhost:8080
```

## 定时任务（macOS）

```bash
# 设置每天早上 9:00 自动抓取
./setup_cron.sh
```

## 文件说明

```
├── index.html        # 网页界面
├── fetch_data.js     # 数据抓取脚本
├── data.json         # 本地数据存储（自动生成）
├── setup_cron.sh     # macOS 定时任务配置
└── README.md
```

## 截图

![screenshot](screenshot.png)

## License

MIT
