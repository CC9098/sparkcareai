# SparkCare AI - Vercel 部署指南

## 🚀 完整部署步驟

### 1. 準備工作

#### 必須完成的前置條件：
- [ ] 設置 MongoDB Atlas 數據庫（必須使用雲端數據庫）
- [ ] 獲取所有必需的 API 密鑰
- [ ] 準備好環境變量

### 2. MongoDB Atlas 設置

1. **創建 MongoDB Atlas 帳戶**: https://cloud.mongodb.com/
2. **創建新集群**:
   - 選擇免費層 (M0)
   - 選擇適當的地區（建議選擇離用戶較近的）
3. **設置數據庫用戶**:
   - Database Access → Add New Database User
   - 創建用戶名和密碼（記住這些憑證）
4. **設置網絡訪問**:
   - Network Access → Add IP Address
   - 選擇 "Allow access from anywhere" (0.0.0.0/0)
5. **獲取連接字符串**:
   - Clusters → Connect → Connect your application
   - 複製連接字符串，格式如下：
   ```
   mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/<database_name>?retryWrites=true&w=majority
   ```

### 3. Vercel 部署

#### 方法一：通過 GitHub（推薦）

1. **將代碼推送到 GitHub**:
   ```bash
   git add .
   git commit -m "Vercel deployment configuration"
   git push origin main
   ```

2. **連接 Vercel**:
   - 前往 https://vercel.com/
   - 點擊 "New Project"
   - 從 GitHub 導入你的倉庫
   - 選擇 "SparkCare AI" 項目

3. **配置構建設置**:
   - Framework Preset: 選擇 "Other"
   - Build Command: `npm run build`
   - Output Directory: `client/build`
   - 安裝 Command: `npm run install:all`

#### 方法二：通過 Vercel CLI

1. **安裝 Vercel CLI**:
   ```bash
   npm i -g vercel
   ```

2. **登錄並部署**:
   ```bash
   vercel login
   vercel --prod
   ```

### 4. 設置環境變量

在 Vercel Dashboard 中設置以下環境變量：

#### 🔴 必需變量（缺少會導致部署失敗）

```env
# 數據庫連接
MONGODB_URI=mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/sparkcare-ai?retryWrites=true&w=majority

# 安全密鑰（必須是隨機生成的長字符串）
JWT_SECRET=你的超長安全JWT密鑰至少32個字符
ENCRYPTION_KEY=你的32位加密密鑰1234567890123456

# 應用配置
NODE_ENV=production
CLIENT_URL=https://your-app-name.vercel.app
```

#### 🟡 可選變量（功能增強）

```env
# AI 服務（如果使用 AI 功能）
OPENAI_API_KEY=sk-your-openai-api-key
AI_WEBHOOK_SECRET=your-ai-webhook-secret

# 郵件服務（如果需要發送郵件）
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# 文件上傳限制
MAX_FILE_SIZE=10485760
ALLOWED_FILE_TYPES=image/jpeg,image/png,application/pdf

# 速率限制
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

### 5. 生成安全密鑰

運行以下命令生成安全的密鑰：

```bash
# 生成 JWT Secret（32+ 字符）
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 生成 Encryption Key（32 字符）
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
```

### 6. 部署後驗證

部署成功後，檢查以下內容：

1. **健康檢查**: `https://your-app.vercel.app/health`
2. **API 端點**: `https://your-app.vercel.app/api/auth/login`
3. **前端頁面**: `https://your-app.vercel.app`

### 7. 常見錯誤及解決方案

#### 錯誤 1: `Module not found: Can't resolve './config/api'`
**解決方案**: 確保創建了 `client/src/config/api.js` 文件並正確導入。

#### 錯誤 2: `MongoDB connection failed`
**解決方案**: 
- 檢查 `MONGODB_URI` 環境變量是否正確
- 確保 MongoDB Atlas 網絡訪問設置為允許所有 IP
- 驗證數據庫用戶憑證

#### 錯誤 3: `JWT must be provided`
**解決方案**: 確保 `JWT_SECRET` 環境變量已設置且足夠長。

#### 錯誤 4: `Build failed`
**解決方案**: 
- 檢查 `package.json` 中的構建腳本
- 確保所有依賴項都已正确安裝
- 查看 Vercel 構建日誌獲取詳細錯誤信息

#### 錯誤 5: `Function exceeded maximum duration`
**解決方案**: 
- 檢查 `vercel.json` 中的 `maxDuration` 設置
- 優化數據庫查詢性能
- 考慮使用分頁來減少單次請求的數據量

### 8. 性能優化建議

1. **啟用 Vercel Analytics**:
   ```bash
   npm install @vercel/analytics
   ```

2. **優化圖片資源**：
   - 使用 Vercel Image Optimization
   - 壓縮上傳的圖片

3. **啟用緩存**：
   - 設置適當的 Cache-Control 標頭
   - 使用 Vercel Edge Network

### 9. 監控和日誌

1. **查看部署日誌**: Vercel Dashboard → Deployments → View Logs
2. **查看函數日誌**: Vercel Dashboard → Functions → View Logs
3. **設置錯誤監控**: 集成 Sentry 或其他監控服務

### 10. 更新部署

每次更新代碼後：
```bash
git add .
git commit -m "Update: describe your changes"
git push origin main
```

Vercel 會自動重新部署。

## 🆘 故障排除檢查清單

當部署失敗時，按以下順序檢查：

- [ ] MongoDB Atlas 連接字符串是否正确
- [ ] 所有必需的環境變量是否已設置
- [ ] `vercel.json` 配置是否正確
- [ ] 構建命令是否成功執行
- [ ] Node.js 版本是否兼容（需要 18+）
- [ ] 所有依賴項是否已正确安裝

## 📞 需要幫助？

如果遇到問題，請檢查：
1. Vercel 部署日誌
2. MongoDB Atlas 連接日誌
3. 瀏覽器開發者工具的網絡和控制台選項卡

記住：第一次部署可能需要 5-10 分鐘才能完全生效。 