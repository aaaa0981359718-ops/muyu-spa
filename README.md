# 莯浴 SPA 正式版

## 功能
- 手機版前台
- 今日報班
- 美容師照片上傳／更換
- 新增、編輯、刪除美容師
- 營業時間、電話、LINE 設定
- 管理員登入
- SEO 基本設定

## 本機啟動
1. 安裝 Node.js 18+
2. 在此資料夾執行 `npm install`
3. 設定環境變數 `ADMIN_PASSWORD`
4. 執行 `npm start`
5. 開啟 `http://localhost:3000`
6. 管理後台：`http://localhost:3000/admin.html`

## 正式上線
需要部署 Node.js 伺服器，並設定：
- `ADMIN_PASSWORD`
- `ADMIN_TOKEN`（設定為與登入密碼 hash 對應的安全 token，或改用正式 JWT/session）
- HTTPS
- 自有網域

Google 搜尋索引需在網站正式上線後提交 Google Search Console。
