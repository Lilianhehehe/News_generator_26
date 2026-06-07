# 每日新闻简报 MVP

一个本地运行的小工具：在网页里选择新闻方向、关键词、接收邮箱和发送时间，然后用 Google News 搜索结果生成中文简报，并通过 Gmail 发给自己。

## 启动

```bash
npm start
```

打开：

```text
http://localhost:3000
```

## 后台自动运行

本项目可以安装成 macOS 后台服务。安装后不需要一直开着 terminal，只要电脑开机、已登录并联网，服务会在后台运行，并按网页里的发送时间自动发邮件。

后台服务配置文件：

```text
launchd/com.lisa.news-generator.plist
```

后台日志：

```text
data/launchd.out.log
data/launchd.err.log
```

注意：如果电脑关机或睡眠，到点时不能保证发送。

## Gmail 发信设置

本工具不会把 Gmail 密码写进代码。要真正发送邮件，请先设置环境变量：

```bash
export GMAIL_APP_PASSWORD="你的 Gmail 应用专用密码"
npm start
```

发送邮箱在网页里配置，第一版默认是 `lilianhe347208@gmail.com`。如果没有设置 `GMAIL_APP_PASSWORD`，点击“立即生成”会生成网页预览，但不会发送邮件。

## OpenAI 英文简报设置

要让每条新闻生成英文概括标题，以及信息更完整的英文介绍，请设置 `OPENAI_API_KEY`：

```bash
export OPENAI_API_KEY="你的 OpenAI API Key"
export GMAIL_APP_PASSWORD="你的 Gmail 应用专用密码"
npm start
```

默认使用 `gpt-5-mini`。如果没有设置 `OPENAI_API_KEY`，工具仍然会搜索新闻，但只显示基础预览，不会生成高质量英文改写。

## 数据保存位置

- 配置：`data/config.json`
- 最近生成记录：`data/history.json`

## 当前第一版范围

- Google News RSS 搜索，并过滤掉超过 10 天、缺少日期或日期无效的结果
- OpenAI 生成英文概括标题和约 90-130 个简单英文词的详细介绍
- 英文新闻页面与英文邮件正文
- 新闻方向开关
- 默认新闻方向：神经科学前沿研究、生物学前沿研究、美国重大新闻、中国重大新闻、世界政治新闻、世界经济新闻
- 每个新闻方向可以单独设置篇数
- 神经科学和生物学方向更偏顶级期刊、论文和研究发表
- 世界经济方向更偏大公司新闻、财报、并购、裁员、监管和供应链
- 自定义关键词、发送邮箱、接收邮箱和每日发送时间
- 手动立即生成
- 本地服务运行时的每日定时发送
