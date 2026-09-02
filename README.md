# 莯浴 SPA — Cloudflare 修正版

GitHub 根目錄必須直接包含：
- public/
- worker.js
- wrangler.toml
- package.json

Cloudflare Build settings:
- Build command: 留空
- Deploy command: npx wrangler deploy
- Root directory: /

這個版本修正 assets.directory 找不到 public 的問題。

注意：Cloudflare KV binding 尚未建立；如果先部署，Worker 的 API 會無法正常讀寫資料。網站靜態頁面仍可部署。下一步建立 KV 後，把 wrangler.toml 的 KV 區塊加入即可。
