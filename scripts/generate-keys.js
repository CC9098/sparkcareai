#!/usr/bin/env node

const crypto = require('crypto');

console.log('🔐 SparkCare AI - 生成部署密鑰\n');

// 生成 JWT Secret
const jwtSecret = crypto.randomBytes(32).toString('hex');
console.log('JWT_SECRET:');
console.log(jwtSecret);
console.log('');

// 生成 Encryption Key  
const encryptionKey = crypto.randomBytes(16).toString('hex');
console.log('ENCRYPTION_KEY:');
console.log(encryptionKey);
console.log('');

// 生成 AI Webhook Secret
const aiWebhookSecret = crypto.randomBytes(24).toString('hex');
console.log('AI_WEBHOOK_SECRET:');
console.log(aiWebhookSecret);
console.log('');

console.log('📋 請將這些密鑰複製到 Vercel Dashboard 的環境變量中');
console.log('⚠️  請妥善保存這些密鑰，它們無法被恢復');
console.log('');

console.log('🚀 完整的環境變量列表:');
console.log('MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/sparkcare-ai');
console.log(`JWT_SECRET=${jwtSecret}`);
console.log(`ENCRYPTION_KEY=${encryptionKey}`);
console.log('NODE_ENV=production');
console.log('CLIENT_URL=https://your-app-name.vercel.app');
console.log(`AI_WEBHOOK_SECRET=${aiWebhookSecret}`);
console.log('');
console.log('✅ 設置完成後，你的應用就可以在 Vercel 上運行了！'); 