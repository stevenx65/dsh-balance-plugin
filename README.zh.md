# dsh-balance-plugin

[![Awesome DSH Plugin](https://awesome-dsh-plugin.com/badge.svg)](https://awesome-dsh-plugin.com)

DeepSeek Harness(dsh)web 插件:在 3080 端口的侧边栏底部显示 **DeepSeek API 余额** 和 **token 用量**,支持 **今日/累计** 切换,并按 provider 过滤(只统计 `deepseek-official`,忽略其他厂商)。

## 功能

- 💰 余额:调 DeepSeek 官方 `GET /user/balance`,key 复用 dsh 的 credentials(`~/.dsh/.credentials.yaml`),无需手动填
- 📊 token 用量:读取 dsh 原始 session 日志(`session.jsonl.zstd`),按 provider 过滤后聚合
  - 未缓存输入 / 缓存读取 / 输出 / 模型调用次数
- 🔄 今日/累计切换:今日(北京时间当天)或全部历史
- 🎨 深色/浅色自动适配 + 刷新按钮 + 关闭按钮

## 一键安装(从插件市场)

```sh
dsh plugin --profile web add dsh-balance-plugin
```

重启 `dsh web` 后刷新页面,侧边栏底部出现余额按钮。

## 架构

```
浏览器(3080 页面)
  client.js ──fetch──▶ /dsh-balance/data?scope=today|all
                              │
node 端(index.js,运行在 dsh 进程内)
  ├── credentials.resolve("DEEPSEEK_API_KEY")  ← 复用 dsh 的 key
  ├── fetch(https://api.deepseek.com/user/balance)
  └── 解压 ~/.dsh/sessions/*/*/session.jsonl.zstd
      逐行过滤 assistant/message + provider=deepseek-official
```

- `index.js`:node 端 cordis 插件,注册 HTTP 路由 `/dsh-balance/data`
- `client.js`:浏览器端插件,注入 `sidebar.footer.action`(侧边栏底部按钮 + 黑色浮层)
- `package.json`:`dsh.client.platform: "web"` + `exports["./client"]`,供 `dsh-client-modules` 扫描

## 安装

1. 把 `dsh-balance-plugin` 目录放到 web profile 的 node_modules:

```sh
mkdir -p ~/.dsh/profiles/web/node_modules/dsh-balance-plugin
cp index.js client.js package.json ~/.dsh/profiles/web/node_modules/dsh-balance-plugin/
```

2. 编辑 `~/.dsh/profiles/web/cordis.patch.yml`,加入:

```yaml
- insert:
    - id: dsh-balance
      name: 'dsh-balance-plugin'
```

3. 重启 dsh web(如 tmux 里:`tmux send-keys -t dsh C-c` 然后 `dsh web`)

4. 刷新浏览器 3080 页面,侧边栏底部出现余额按钮

## 依赖

- node 端:仅 Node 内置模块(`node:fs`、`node:child_process`、`node:path` 等),需要系统有 `zstd` CLI 用于解压 session 日志
- 浏览器端:依赖 dsh 自带的 `@deepseek-ai/dsh-client-ui-primitives`(图标组件),dsh 0.1.0-rc.6 自带,无需额外安装

## 数据来源

原始会话日志位置:`~/.dsh/sessions/<scope>/<session-id>/session.jsonl.zstd`

每条 `assistant/message` 行含:

```json
{
  "type": "assistant/message",
  "time": 1786635270943,
  "data": {
    "message": { "source": { "kind": "model", "provider": "deepseek-official", "model": "deepseek-v4-pro" } },
    "usage": { "inputTokens": 8702, "outputTokens": 298, "cacheReadTokens": 0 }
  }
}
```

## 打包

```sh
npm pack   # 生成 dsh-balance-plugin-0.1.0.tgz
```

## License

MIT
