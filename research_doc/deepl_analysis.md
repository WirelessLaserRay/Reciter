# DeepL 翻译逻辑检查与部署分析

对目前的 DeepL 翻译例句逻辑（`src/lib/dictionary.ts` 中的 `translateWithDeepL`）进行了审查，以下是分析结果：

## 1. 逻辑本身对不对？
**基本正确，但有细节瑕疵。**
- **鉴权格式**：`Authorization: DeepL-Auth-Key ${key}` 是标准且正确的。
- **请求体**：使用了 `application/json` 和 `{ text: [text], target_lang: "ZH" }`，符合 DeepL 最新的 JSON API 规范。
- **潜在瑕疵**：DeepL 官方已推荐将 `ZH` 细分为 `ZH-HANS` (简体) 或 `ZH-HANT` (繁体)。目前传 `ZH` 还能兼容（会被视为简体），但建议直接使用 `ZH-HANS` 更严谨。

## 2. 部署后能不能正常工作？
**结论：在 Tauri 桌面端完美运行，但在 Web 网页端（如 GitHub Pages部署）必然失败。**

### 为什么在网页端会失败？
1. **CORS（跨域限制）问题**：DeepL 官方 API (`api-free.deepl.com` 和 `api.deepl.com`) **完全不支持 CORS**（即不返回 `Access-Control-Allow-Origin` 头）。
2. **浏览器的安全策略**：网页环境（Web/PWA）下，浏览器发起带自定义 Header（如 `Authorization`）的跨域 POST 请求时，会先发一个 `OPTIONS` 预检请求，由于 DeepL 不允许跨域，预检会被浏览器直接拦截，抛出 CORS Error。
3. **静默失败的假象**：在 `translateText` 函数中，DeepL 如果报错抛出异常，你的代码中写了：
   ```typescript
   if (provider === "deepl") {
     const t = await translateWithDeepL(text);
     if (t) return t;
   }
   const t2 = await translateWithMyMemory(text); // 偷偷回退
   ```
   **这意味着，网页端用户即便填了正确的 DeepL Key，请求也会在后台因为跨域被拦截，然后系统偷偷用 MyMemory 免费词典甚至 AI 完成了翻译。用户看到有了翻译，会误以为自己的 DeepL 配置成功了，其实压根没用上。**

### Tauri 为什么没问题？
在桌面端（Tauri）运行时，代码使用了 `@tauri-apps/plugin-http` 发起底层 Rust 请求，这完全绕过了浏览器的跨域安全策略，因此可以正常调用。

---

## 3. 如何修复网页端的 DeepL 翻译？

如果要让网页端（PWA部署）也能真正使用 DeepL，有以下两个方案：

### 方案 A：允许用户自定义 CORS 代理（推荐）
在设置中增加一个输入框（如 AI 接口的自定义 URL 那样），允许用户填写自己的 CORS 代理（例如基于 Cloudflare Workers 搭建的代理）。
- 将现有的 `DeepL API URL` 描述修改为：“如果是网页端，请填写跨域代理地址；桌面端可保持默认。”

### 方案 B：代码层面增加判断提示
如果检测到当前是网页环境（`!isTauri()`），并且用户开启了 DeepL 但没有配置代理，就在 UI 上明确警告用户：“网页版 DeepL 存在跨域限制，需配置代理服务器”。

### 代码优化建议 (直接写入 `dictionary.ts`)
我建议对 `dictionary.ts` 稍作优化，将 `ZH` 改为 `ZH-HANS`，并对抛出异常进行打点或 Console 提示，避免它像个黑盒一样静默失败。

你希望我采取哪种方式（例如方案 A 增加跨域配置提示，或是直接帮你把目标语言改为 `ZH-HANS`）？点击 **Proceed** 查看，或直接告诉我你的需求。
