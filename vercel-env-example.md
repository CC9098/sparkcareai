# Vercel Environment Variables Configuration

在 Vercel Dashboard 中設置以下環境變量：

## 必需的環境變量 (Required)

### Database
```
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/sparkcare-ai?retryWrites=true&w=majority
```

### Security
```
JWT_SECRET=your-super-secure-jwt-secret-at-least-32-characters-long
ENCRYPTION_KEY=your-32-character-encryption-key-here
```

### Application
```
NODE_ENV=production
CLIENT_URL=https://your-vercel-app.vercel.app
```

## 可選的環境變量 (Optional)

### AI Services
```
AI_WEBHOOK_SECRET=your-ai-webhook-secret
OPENAI_API_KEY=sk-your-openai-api-key
```

### External Integration
```
GP_CONNECT_API_KEY=your-gp-connect-key
NHS_DIGITAL_API_KEY=your-nhs-digital-key
```

### Email Configuration
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-email-password
```

### File Upload
```
MAX_FILE_SIZE=10485760
ALLOWED_FILE_TYPES=image/jpeg,image/png,application/pdf
```

### Rate Limiting
```
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

## 如何在 Vercel 中設置環境變量

1. 進入你的 Vercel Dashboard
2. 選擇你的項目
3. 點擊 "Settings" 選項卡
4. 點擊 "Environment Variables"
5. 添加上述環境變量

## 重要提示

- 請確保 MONGODB_URI 使用 MongoDB Atlas 或其他雲端 MongoDB 服務
- JWT_SECRET 和 ENCRYPTION_KEY 必須足夠長且安全
- CLIENT_URL 應該設置為你的 Vercel 應用 URL 