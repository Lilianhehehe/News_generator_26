# 每日邮件发送问题 —— 交接总结

> 用于跨对话交接。记录截至 2026-07-08 的排查进展、结论与卡点。

## 项目背景
- 项目路径:`/Users/lisa/Desktop/AI Projects/News Generator`(注意在**桌面**上,这点很关键,见文末)
- 功能:每天早上生成英文新闻早报,通过 Gmail 发到 `zh2652@barnard.edu`
- 存储:线上用 Upstash Redis(`.env.local` 里有 `KV_REST_API_URL/TOKEN`);本地用 `data/*.json`
- GitHub:`Lilianhehehe/News_generator_26`,主分支 main
- Vercel:`.vercel/project.json` 显示项目名 `news-generator`,cron 配置 `vercel.json` = `"0 12 * * *"`(即美东早 8 点)

## 核心问题:项目里有"新旧两套"发信系统,互相脱节

| | **每天真正发邮件的**(老) | **本地/GitHub 上的**(新) |
|---|---|---|
| 发信方式 | Gmail 应用专用密码 `GMAIL_APP_PASSWORD` | Google 账号登录 OAuth |
| 成功文案 | `"Email sent."` | `"Email sent from X to Y."`(server.js:2313) |
| 写入历史 | 全局 `news-generator:history` | 每用户 `news-generator:user:<email>:history` |

## 已确认的事实(来自 Redis 历史 + 代码对比)
1. **每日邮件其实一直正常在发**,包括今天:全局历史里 `2026-07-08T12:21:17Z sent=True`,6 栏目 8 篇文章,内容完整。用户确认最近两天都收到了。
2. **发送时间是每天约 12:21 UTC(美东 8:21),不是配置的 8:00**,且每天精确到同一秒 —— 不太像 Vercel Hobby cron 的随机延迟,原因待查。
3. 用户一度以为"今早没收到" → 实际发了,可能没注意/进垃圾箱。**这条已不是重点。**
4. **新功能(要点切换 bullet points + 中英文翻译)不会出现在每日邮件里**,因为发信的是老代码。新代码只在本地和 GitHub main 上(已 commit 并 push,commit message: `bullet point and Chinese translation added`)。

## 当前卡点(下一个对话要解决的)
**搞清楚"每天发邮件的到底是哪个部署",然后把它更新到新代码 / 统一成一套。**

关键疑点:
- 用户说 Vercel 后台**只有一个项目** `news-generator`。
- 但抓取 `https://news-generator.vercel.app` 发现那是**别人的另一个 Next.js 新闻站**,不是本项目(光名字被占了,用户真正的项目网址带后缀,没猜出来)。
- 昨晚已 `git push origin main`,但**线上仍是老代码**(线上 `app.js` 里 `applyLanguage` / `formatToggle` 均为 0 次;`/api/bullets` 返回 404)。说明 Vercel 要么没自动部署 main、要么部署失败、要么发信的根本不是这个 Vercel 项目。

## 下一步需要用户提供
1. **Vercel 项目真正的线上网址**(项目页顶部那个 `xxx.vercel.app` 链接)—— 有了它就能直接 curl 确认:是不是发信的、跑新码还是老码、cron 时间。
2. 或装好 **Claude in Chrome 扩展**并在侧边栏登录**同一账号**,让助手直接进 Vercel 后台看(Deployments / Cron Jobs / Settings→Git 连的哪个仓库和分支)。扩展地址:https://chromewebstore.google.com/detail/fcoeoabgfenejglbffodgkkbkcdhcgfn
3. Vercel 后台 **Settings → Environment Variables** 里已有哪些变量名(截图)。特别注意:令牌是用 `AUTH_SECRET` 加密存 Redis 的(server.js:644),**Vercel 的 AUTH_SECRET 必须和本地一致**,否则新 OAuth 路径解不开令牌发不出去;新路径还需要 `OPENAI_API_KEY`、`GOOGLE_CLIENT_ID/SECRET`。

## 其他相关背景
- 本地 launchd 后台服务(`launchd/com.lisa.news-generator.plist`)一直**崩溃循环(退出码 78)**,因为 macOS 隐私保护(TCC)不允许后台服务访问"桌面"文件夹;所以本地这条发信路径不可靠(且 Mac 睡眠时也不发)。永久修复需给 `/opt/homebrew/bin/node` 完全磁盘访问权限,或把项目移出桌面。
- Google OAuth 令牌前几天过期过("Token has been expired or revoked"),用户 2026-07-08 01:13 已重新登录修好(Redis 里 `needsReconnect: False`),且已把 Google OAuth 应用**发布到生产**(解决测试模式令牌每 7 天过期的问题)。
- 新功能能用的前提:环境里要有 `ANTHROPIC_API_KEY` 或 `OPENAI_API_KEY`(本地 `.env.local` 有 OPENAI,没 ANTHROPIC,代码会自动回退用 OPENAI)。
- 本地开发服务器当前跑在 `http://127.0.0.1:3131`(`.env.local` 里 `PORT=3131`),是手动 `nohup` 起的,重启/关机会没。

## 排查用的小工具(读 Redis)
用 `.env.local` 里的 `KV_REST_API_URL` + `KV_REST_API_TOKEN`,POST 一个 JSON 数组命令即可,例如:
`["GET","news-generator:history"]` 看全局历史,
`["KEYS","news-generator:*"]` 看所有 key,
`["GET","news-generator:user:zh2652%40barnard.edu:auth"]` 看用户授权状态(邮箱里的 `@` 要 URL 编码成 `%40`)。
