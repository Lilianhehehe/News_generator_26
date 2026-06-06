# Old Draft - Do Not Use As Current Requirements

This file is an old design draft. It contains outdated requirements, including Chinese-summary rules.

Use `AGENTS.md` as the current default project instruction file.

# 每日新闻简报工具 Agent 设计草案

## 目标

做一个只给个人本地使用的网页工具。用户可以在网页里配置自己关心的新闻方向、关键词、接收邮箱和每天发送时间。系统每天早上自动搜索相关新闻，用中文整理成简报，然后通过 Gmail 发到用户邮箱。

## 第一版范围

第一版先做 MVP，重点是能跑通完整流程：

1. 网页端配置
   - 设置发送邮箱：`lilianhe347208@gmail.com`。
   - 设置接收邮箱：`zh2652@barnard.edu`。
   - 设置每天发送时间。
   - 选择新闻方向：
     - 神经科学前沿研究
     - 生物学前沿研究
     - 美国重大新闻
     - 中国重大新闻
     - 世界政治新闻
     - 世界经济新闻
   - 开关每个新闻方向。
   - 编辑每个方向对应的关键词。
   - 每个新闻方向可以单独设置抓取数量。
   - 例如：世界经济新闻可以设置 3 条，中国重大新闻可以设置 1 条。
   - 不再只使用一个全局“每类新闻数量”。

2. 新闻搜索
   - 使用 Google 网页搜索或 Google News 搜索。
   - 根据新闻方向和关键词组合查询。
   - 优先抓取最近一天或近期新闻。
   - 对重复标题做简单去重。
   - 神经科学前沿研究和生物学前沿研究需要更 research focused。
   - 神经科学和生物学方向应优先搜索顶级期刊、论文发布、研究成果或学术机构新闻，而不是泛新闻或科普/宠物/生活类内容。
   - 神经科学和生物学方向的关键词需要收窄到 publication、paper、study、research article、Nature、Science、Cell、Neuron、Nature Neuroscience、Nature Medicine、PNAS、The Lancet 等来源或论文语境。
   - 如果 Google News 返回的结果明显不是研究论文或顶级期刊相关内容，应尽量过滤或降低优先级。
   - 世界经济新闻需要更 company focused。
   - 世界经济方向应优先关注全球大公司和跨国企业相关新闻，例如财报、并购、裁员、监管、产品战略、供应链、市场份额、股价影响和行业竞争。
   - 世界经济方向不优先抓泛宏观评论，除非它直接影响大公司或主要行业。
   - 世界经济方向可优先使用关键词 company earnings、major companies、Big Tech、market leaders、merger、acquisition、layoffs、regulation、supply chain 等。

3. 中文总结
   - 按新闻方向分组。
   - 邮件里的新闻标题必须改写成中文。
   - 中文标题不能只是直译英文标题，要能概括这条新闻的核心事件或核心发现。
   - 每条新闻都需要配一段中文介绍，让读者不点开链接也能知道大概在讲什么。
   - 每条中文介绍长度为 5-7 个短句。
   - 中文介绍需要包含重要细节，例如事件主体、地点、时间背景、研究发现、影响、争议点或后续值得关注的地方。
   - 摘要语气要像中文新闻简报，清楚、自然、信息密度高。
   - 这一版不再接受只用英文标题和 Google News 片段拼接成摘要。
   - 为了达到这个质量，需要接入 OpenAI API 或同类大模型，把搜索到的新闻信息改写成中文标题和中文介绍。
   - 邮件正文里每条新闻的绿色中文标题需要比现在更大、更醒目。
   - 新闻标题字号应明显大于正文介绍，但不能压过分类标题。
   - 每条新闻总结不能空泛，要具体解释“这篇新闻到底说了什么”。
   - 总结要写清楚哪个公司、行业、国家、政策或研究发生了什么，为什么重要，可能影响什么。
   - 如果原文提到公司、产品、政策、价格、市场变化、财报数据、管理层表态或技术进展，要尽量写出来。
   - 如果原文没有给具体公司名单、目标价、数据或公司名字，要明确写“原文没有提供具体公司/数据”，不能编造。
   - 语言要简单易懂，像给普通人解释新闻。
   - 用简单的词，不要用太复杂、太书面化的表达。
   - 尽量减少长句，把长句拆成短句。
   - 每句话只表达一个主要意思。
   - 避免太金融化、太抽象的词，例如“战略地位”“长期价值”“市场格局”“基本面改善”；必须使用时要用简单话解释。
   - 必须使用专业词时顺手解释。
   - 每条新闻正文不要显示小标题，要写成一段自然中文。
   - 正文仍然要覆盖核心事件、具体例子、为什么重要和一句直白结论，但要用连接词串起来，避免生硬。
   - 每条新闻控制在 150-250 个中文字左右。
   - 美国重大新闻和中国重大新闻要更偏政治重大新闻，优先关注政府政策、外交、法院、选举、监管、官方表态等。

4. Gmail 发信
   - 使用用户自己的 Gmail 发送。
   - 本地通过环境变量读取 Gmail 地址和 Gmail 应用专用密码。
   - 不把邮箱密码或密钥写进代码。
   - 如果没有配置 Gmail 环境变量，则只生成网页预览，不真正发信。

5. 定时任务
   - 本地服务运行时，每分钟检查一次当前时间。
   - 到达用户设置的发送时间后自动生成并发送。
   - 第一版不保证电脑关机或服务未运行时仍能发送。

6. 手动测试
   - 网页提供“立即生成”按钮。
   - 点击后保存当前配置，马上搜索新闻并生成一次简报。
   - 如果 Gmail 配置完整，则发送邮件；否则显示预览。

## 不在第一版范围内

- 多用户账号系统。
- 登录权限管理。
- 云端部署。
- 手机 App。
- 复杂新闻源管理。
- 新闻全文抓取。
- 历史简报的高级检索。
- 邮件多人群发。
- Gmail OAuth 登录。
- 电脑关机后仍自动运行的云端任务。

## 推荐本地技术方案

为了先简单跑通，可以使用一个轻量的本地 Node.js 服务：

- 后端：Node.js 原生 HTTP 服务或 Express。
- 前端：普通 HTML、CSS、JavaScript。
- 配置保存：本地 JSON 文件。
- 新闻来源：Google News RSS 搜索，作为 Google 搜索的轻量替代。
- 邮件发送：Gmail SMTP。
- 定时任务：服务内置定时检查。

这个方案的优点是：

- 本地即可运行。
- 不需要数据库。
- 不需要账号系统。
- 方便快速测试邮件和新闻结果。

## 配置数据结构草案

```json
{
  "senderEmail": "lilianhe347208@gmail.com",
  "recipientEmail": "zh2652@barnard.edu",
  "sendTime": "08:00",
  "timezone": "America/New_York",
  "categories": [
    {
      "id": "neuroscience",
      "name": "神经科学前沿研究",
      "enabled": true,
      "itemCount": 1,
      "researchFocused": true,
      "keywords": [
        "neuroscience paper",
        "neuroscience publication",
        "Nature Neuroscience",
        "Neuron",
        "Science neuroscience",
        "Cell neuroscience"
      ]
    },
    {
      "id": "biology",
      "name": "生物学前沿研究",
      "enabled": true,
      "itemCount": 1,
      "researchFocused": true,
      "keywords": [
        "biology paper",
        "biology publication",
        "Nature biology",
        "Science biology",
        "Cell biology",
        "PNAS biology"
      ]
    },
    {
      "id": "us_major_news",
      "name": "美国重大新闻",
      "enabled": true,
      "itemCount": 1,
      "keywords": ["美国", "重大新闻", "US breaking news"]
    },
    {
      "id": "china_major_news",
      "name": "中国重大新闻",
      "enabled": true,
      "itemCount": 1,
      "keywords": ["中国", "重大新闻", "China breaking news"]
    },
    {
      "id": "world_politics",
      "name": "世界政治新闻",
      "enabled": true,
      "itemCount": 1,
      "keywords": ["国际政治", "地缘政治", "world politics"]
    },
    {
      "id": "world_economy",
      "name": "世界经济新闻",
      "enabled": true,
      "itemCount": 3,
      "companyFocused": true,
      "keywords": [
        "major companies earnings",
        "global companies",
        "Big Tech earnings",
        "merger acquisition",
        "company layoffs",
        "supply chain company news",
        "market leaders regulation"
      ]
    }
  ]
}
```

## 生成邮件格式草案

邮件标题：

```text
今日新闻
```

邮件正文：

```text
今日新闻

【神经科学前沿研究】
1. 中文概括标题
   这是一段 5-6 句话的中文介绍。它需要说明这条新闻或研究的核心内容，而不是只重复标题。介绍里应包含关键背景、重要发现、相关人物或机构、可能影响，以及为什么值得关注。
   来源：媒体名
   链接：https://...

【世界经济新闻】
1. 中文概括标题
   这是一段 5-6 句话的中文介绍。它需要让读者快速理解新闻在讲什么，以及它和更大的经济趋势有什么关系。
   来源：媒体名
   链接：https://...
```

网页和邮件都可以使用更清晰的 HTML 排版。

## 需要你审查确认的点

1. 第一版是否接受使用 Google News RSS 作为 Google 搜索的实现方式？
   - 它更稳定、简单，也更适合获取新闻标题和链接。

2. 中文总结需要升级为“大模型中文改写”。
   - 邮件中不能直接显示英文标题作为主标题。
   - 每条新闻需要中文概括标题。
   - 每条新闻需要 5-6 句中文介绍。
   - 仅依靠 Google News 标题和片段不够，需要接入 OpenAI API 或同类模型。

3. Gmail 是否接受用“应用专用密码”方式？
   - 这是本地测试最简单的方式。
   - 前提是 Gmail 开启两步验证，然后生成 App Password。
   - 发送邮箱暂定为 `lilianhe347208@gmail.com`。

4. 定时发送是否只要求在本地服务运行时生效？
   - 如果你希望电脑没开、服务没跑也能发，需要后续部署到云端。

5. 网页风格偏好：
   - 简洁工作台风格。
   - 更像报纸/晨报风格。
   - 更像现代 dashboard 风格。

## 后续可扩展方向

- 接入 OpenAI API 做更高质量中文摘要。
- 增加“今日最重要三件事”。
- 增加新闻来源白名单或黑名单。
- 增加顶级期刊白名单，例如 Nature、Science、Cell、Neuron、PNAS、The Lancet 等。
- 支持多邮箱接收。
- 支持历史简报列表。
- 支持云端部署和持续运行。
- 支持 Gmail OAuth，避免应用专用密码。
