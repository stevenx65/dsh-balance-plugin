/**
 * dsh-balance-plugin — 浏览器端(client.js)
 *
 * dsh 客户端插件:向 sidebar 底部(sidebar.footer.action)注册一个余额按钮,
 * 点击弹出浮层展示余额与 token 用量。数据来自 node 端插件注册的
 * /dsh-balance/data 路由。
 */
window.__ModuleLoader__.load({
  id: "dsh-balance-plugin",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    let react = require("react");
    let primitives = require("@deepseek-ai/dsh-client-ui-primitives");

    const { useEffect, useState, useCallback } = react;
    const { IconDataOutline16, IconRefreshOutline14 } = primitives;

    //#region 余额面板组件
    function fmt(n, digits = 2) {
      return Number.isFinite(n) ? n.toFixed(digits) : "—";
    }

    function fmtTokens(n) {
      if (!Number.isFinite(n)) return "—";
      return n.toLocaleString("zh-CN");
    }

    const rowStyle = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", padding: "4px 0", fontSize: "12.5px", lineHeight: "1.4", color: "#e5e7eb" };
    const labelStyle = { color: "#9aa0a6" };
    const valueStyle = { fontVariantNumeric: "tabular-nums", fontWeight: 600, color: "#fff" };
    const errStyle = { color: "#ff6b6b", fontSize: "12px", padding: "4px 0" };

    /**
     * footer action 组件:余额按钮 + 展开浮层。
     * @param {object} props - { wide, renderSlot, ... }(slot 注入参数)
     */
    function BalanceAction({ wide }) {
      const [open, setOpen] = useState(false);
      const [scope, setScope] = useState("today"); // "today" | "all"
      const [data, setData] = useState(null);
      const [error, setError] = useState(null);
      const [loading, setLoading] = useState(false);

      const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
          const res = await fetch(`/dsh-balance/data?scope=${scope}`, { cache: "no-store" });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const json = await res.json();
          setData(json);
        } catch (e) {
          setError(e.message);
        } finally {
          setLoading(false);
        }
      }, [scope]);

      useEffect(() => {
        if (open) load();
      }, [open, load, scope]);

      const balance = data?.balance;
      const totals = data?.tokens?.totals;
      const badge = balance && Number.isFinite(balance.total)
        ? `¥${fmt(balance.total)}`
        : data?.balanceError ? "—" : "…";

      return react.createElement(
        react.Fragment,
        null,
        react.createElement(
          "button",
          {
            type: "button",
            "aria-label": "DeepSeek 余额",
            "aria-expanded": open,
            onClick: () => setOpen((v) => !v),
            style: {
              display: "flex", alignItems: "center", gap: "6px",
              background: "transparent", border: "none", cursor: "pointer",
              color: "var(--ds-c-text-2, #8a8f98)", padding: "6px 8px",
              borderRadius: "6px", fontSize: "13px", width: "100%",
            },
          },
          react.createElement(IconDataOutline16, { size: 16 }),
          wide && react.createElement("span", { style: { flex: 1, textAlign: "left" } }, "余额"),
          wide && react.createElement("span", { style: { fontWeight: 600, fontVariantNumeric: "tabular-nums" } }, badge)
        ),
        open &&
          react.createElement(
            "div",
            {
              style: {
                position: "absolute", left: "8px", right: "8px", bottom: "44px",
                background: "#000000", border: "1px solid #333",
                borderRadius: "10px", padding: "10px 12px", boxShadow: "0 8px 24px rgba(0,0,0,.5)",
                zIndex: 100, color: "#e5e7eb",
              },
            },
            react.createElement(
              "div",
              { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" } },
              react.createElement("b", { style: { fontSize: "13px", color: "#fff" } }, "DeepSeek 余额"),
              react.createElement(
                "div",
                { style: { display: "flex", alignItems: "center", gap: "6px" } },
                // 今日 / 累计 切换
                react.createElement(
                  "div",
                  { style: { display: "flex", background: "#1a1a1a", borderRadius: "6px", padding: "2px", gap: "2px" } },
                  ["today", "all"].map((s) =>
                    react.createElement(
                      "button",
                      {
                        type: "button",
                        key: s,
                        onClick: () => setScope(s),
                        style: {
                          background: scope === s ? "#333" : "transparent",
                          border: "none", cursor: "pointer", color: scope === s ? "#fff" : "#8a8f98",
                          fontSize: "11.5px", padding: "3px 8px", borderRadius: "4px",
                        },
                      },
                      s === "today" ? "今日" : "累计"
                    )
                  )
                ),
                react.createElement(
                  "button",
                  {
                    type: "button",
                    onClick: load,
                    disabled: loading,
                    style: { background: "none", border: "none", cursor: "pointer", color: "#4d9fff", display: "flex", alignItems: "center", gap: "4px", fontSize: "12px" },
                  },
                  react.createElement(IconRefreshOutline14, { size: 14 }),
                  loading ? "刷新中" : "刷新"
                ),
                react.createElement(
                  "button",
                  {
                    type: "button",
                    "aria-label": "关闭余额面板",
                    onClick: () => setOpen(false),
                    style: {
                      background: "none", border: "none", cursor: "pointer",
                      color: "#8a8f98", fontSize: "16px", lineHeight: "1",
                      padding: "2px 6px", borderRadius: "4px",
                    },
                  },
                  "✕"
                )
              )
            ),
            error
              ? react.createElement("div", { style: errStyle }, "加载失败: " + error)
              : react.createElement(
                  "div",
                  null,
                  react.createElement(
                    "div",
                    { style: rowStyle },
                    react.createElement("span", { style: labelStyle }, "余额"),
                    react.createElement("span", { style: valueStyle }, balance && Number.isFinite(balance.total) ? `¥${fmt(balance.total)}` : "—")
                  ),
                  react.createElement(
                    "div",
                    { style: rowStyle },
                    react.createElement("span", { style: labelStyle }, "充值 / 赠金"),
                    react.createElement("span", { style: valueStyle }, balance ? `¥${fmt(balance.toppedUp)} / ¥${fmt(balance.granted)}` : "—")
                  ),
                  totals
                    ? react.createElement(
                        react.Fragment,
                        null,
                        react.createElement("div", { style: { height: "1px", background: "#2a2a2a", margin: "6px 0" } }),
                        react.createElement(
                          "div",
                          { style: rowStyle },
                          react.createElement("span", { style: labelStyle }, "范围"),
                          react.createElement("span", { style: valueStyle }, scope === "today" ? "今日(北京时间)" : "全部历史")
                        ),
                        react.createElement(
                          "div",
                          { style: rowStyle },
                          react.createElement("span", { style: labelStyle }, "未缓存输入"),
                          react.createElement("span", { style: valueStyle }, fmtTokens(totals.uncachedInputTokens))
                        ),
                        react.createElement(
                          "div",
                          { style: rowStyle },
                          react.createElement("span", { style: labelStyle }, "缓存读取"),
                          react.createElement("span", { style: valueStyle }, fmtTokens(totals.cacheReadTokens))
                        ),
                        react.createElement(
                          "div",
                          { style: rowStyle },
                          react.createElement("span", { style: labelStyle }, "输出"),
                          react.createElement("span", { style: valueStyle }, fmtTokens(totals.outputTokens))
                        ),
                        react.createElement(
                          "div",
                          { style: rowStyle },
                          react.createElement("span", { style: labelStyle }, "模型调用"),
                          react.createElement("span", { style: valueStyle }, fmtTokens(data.tokens.messageCount))
                        )
                      )
                    : react.createElement("div", { style: { color: "#9aa0a6", fontSize: "12px", padding: "4px 0" } }, "暂无 token 数据")
                ),
            (data?.balanceError || data?.tokenError) &&
              react.createElement(
                "div",
                { style: { marginTop: "6px", fontSize: "11.5px", color: "#ff6b6b" } },
                data?.balanceError && react.createElement("div", null, "余额: " + data.balanceError),
                data?.tokenError && react.createElement("div", null, "用量: " + data.tokenError)
              )
          )
      );
    }
    //#endregion

    //#region 插件主体
    /** Required services: slots(布局挂载点)。 */
    const inject = ["slots"];

    /**
     * Client plugin body: register the balance action into the sidebar footer.
     * @param ctx - client root context.
     */
    function apply(ctx) {
      ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
        name: "sidebar.footer.action",
        id: "dsh-balance",
        order: 90,
      }, BalanceAction));
    }
    //#endregion

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
