# 莯浴 SPA Cloudflare 版
此專案使用 Cloudflare Workers + KV + Assets。正式部署前需在 Cloudflare 建立 KV namespace，將 ID 填入 wrangler.toml，並設定 ADMIN_PASSWORD、ADMIN_TOKEN secrets。
目前管理後台可管理文字資料；照片正式上傳儲存建議下一步接 Cloudflare R2。
