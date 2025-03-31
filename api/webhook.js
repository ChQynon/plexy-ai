// Файл для обработки вебхуков Telegram на платформе Vercel
require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { promisify } = require('util');
const writeFileAsync = promisify(fs.writeFile);
const unlinkAsync = promisify(fs.unlink);
const mkdirAsync = promisify(fs.mkdir);

// Конфигурация API ключей
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const BOT_URL = process.env.BOT_URL || 'https://plexy-ai.vercel.app';
const BOT_NAME = 'Plexy';
const BOT_CREATOR = 'Plexy Lab';
const BOT_OWNER = '@qynon';
const BOT_VERSION = '1.1.1';

// Инициализация Google Generative AI
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Модели
const MODELS = {
  PRO: {
    id: 'gemini-2.5-pro-exp-03-25',
    name: 'Plexy',
    config: {
      temperature: 0.8,
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 8192,
    }
  },
  THINKING: {
    id: 'gemini-2.0-flash-thinking-exp-01-21',
    name: 'Plexy think',
    config: {
      temperature: 0.9,
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 8192,
    }
  },
  IMAGE_GEN: {
    id: 'gemini-2.0-flash-exp-image-generation',
    name: 'Plexy art',
    config: {
      temperature: 1,
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 8192,
    }
  }
};

// Инициализация моделей
const models = {
  [MODELS.PRO.id]: genAI.getGenerativeModel({ model: MODELS.PRO.id }),
  [MODELS.THINKING.id]: genAI.getGenerativeModel({ model: MODELS.THINKING.id }),
  [MODELS.IMAGE_GEN.id]: genAI.getGenerativeModel({ model: MODELS.IMAGE_GEN.id })
};

// Настройки по умолчанию
const DEFAULT_MODEL = MODELS.PRO.id;

// Роли пользователей
const ROLES = {
  ADMIN: 'admin',
  PREMIUM: 'premium',
  USER: 'user'
};

// Хранилище сессий пользователей
const userSessions = {};
// Хранилище отложенных запросов
const userPendingRequests = {};
// Счетчики сообщений пользователей
const userMessageCounts = {};
// Настройки пользователей
const userSettings = {};
// Роли пользователей
const userRoles = {};

// Временная директория для файлов
const tempDir = path.join('/tmp', 'plexy-temp');

// Создаем временную директорию, если она не существует
const ensureTempDir = async () => {
  try {
    if (!fs.existsSync(tempDir)) {
      await mkdirAsync(tempDir, { recursive: true });
    }
    return tempDir;
  } catch (error) {
    console.error('Ошибка при создании временной директории:', error);
    return '/tmp';
  }
};

// Обработчик для изображений
const imageHandler = {
  async downloadImage(url) {
    try {
      await ensureTempDir();
      const response = await axios.get(url, { responseType: 'arraybuffer' });
      const extension = this.getExtensionFromContentType(response.headers['content-type']);
      const filename = path.join(tempDir, `image_${Date.now()}${extension}`);
      
      await writeFileAsync(filename, response.data);
      return filename;
    } catch (error) {
      console.error('Ошибка при скачивании изображения:', error);
      throw error;
    }
  },
  
  getExtensionFromContentType(contentType) {
    const map = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp'
    };
    return map[contentType] || '.jpg';
  },
  
  saveBase64Image(base64Data, mimeType, userId) {
    const extension = this.getExtensionFromContentType(mimeType);
    const filename = path.join(tempDir, `generated_${userId}_${Date.now()}${extension}`);
    
    try {
      fs.writeFileSync(filename, Buffer.from(base64Data, 'base64'));
      return filename;
    } catch (error) {
      console.error('Ошибка при сохранении изображения:', error);
      throw error;
    }
  },
  
  deleteFile(filename) {
    try {
      if (fs.existsSync(filename)) {
        fs.unlinkSync(filename);
      }
    } catch (error) {
      console.error('Ошибка при удалении файла:', error);
    }
  }
};

// Функция для фильтрации и коррекции ответов модели
function filterModelResponse(text) {
  if (!text) return text;
  
  // Заменяем упоминания о Google и других нежелательных ответах
  let filteredText = text
    // Заменяем типичные представления модели
    .replace(/я(\s|[-—])*(большая|языковая|искусственная|нейросетевая)(\s|[-—])*модель/gi, `я ${BOT_NAME}`)
    .replace(/я(\s|[-—])*разработана(\s|[-—])*(Google|OpenAI|Anthropic)/gi, `я разработана ${BOT_CREATOR}`)
    .replace(/я(\s|[-—])*(Google|OpenAI|Anthropic|Gemini|Claude|GPT|не имею|нет)(\s|[-—])*(имени|названия)/gi, `я ${BOT_NAME}`)
    .replace(/у меня нет имени/gi, `Меня зовут ${BOT_NAME}`)
    .replace(/я не могу предоставить доступ к интернету/gi, "У меня есть доступ к интернету")
    .replace(/я не могу искать информацию/gi, "Я могу искать информацию в интернете")
    .replace(/я не имею доступа к интернету/gi, "У меня есть доступ к интернету")
    // Удаляем звездочки для форматирования, оставляя текст
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1");
  
  return filteredText;
}

// Функция для получения настроек пользователя
function getUserSettings(userId) {
  if (!userSettings[userId]) {
    userSettings[userId] = {
      currentModel: DEFAULT_MODEL,
      saveHistory: true,
      notifyModelChange: true
    };
  }
  return userSettings[userId];
}

// Функция для получения роли пользователя
function getUserRole(userId) {
  // Проверяем, не является ли пользователь администратором по .env
  const adminId = process.env.ADMIN_ID;
  if (adminId && userId.toString() === adminId.toString()) {
    userRoles[userId] = ROLES.ADMIN;
    return ROLES.ADMIN;
  }
  
  // Возвращаем существующую роль или USER по умолчанию
  return userRoles[userId] || ROLES.USER;
}

// Обновляем функцию создания сессии чата для добавления системного промпта и параметров модели
function createChatSession(chatId) {
  const settings = getUserSettings(chatId);
  const modelId = settings.currentModel;
  
  // Проверяем существование модели
  if (!models[modelId]) {
    console.warn(`Модель ${modelId} не найдена, использую модель по умолчанию`);
    settings.currentModel = DEFAULT_MODEL;
    return createChatSession(chatId);
  }
  
  // Определяем, какая модель используется и ее конфигурацию
  let modelConfig = MODELS.PRO.config; // по умолчанию
  for (const key in MODELS) {
    if (MODELS[key].id === modelId) {
      modelConfig = MODELS[key].config;
      break;
    }
  }
  
  // Создаем сессию с выбранной моделью и обновленной конфигурацией
  const session = models[modelId].startChat({
    generationConfig: modelConfig,
    history: [],
  });
  
  // Устанавливаем системный промпт для новой сессии
  const systemPrompt = `Ты бот по имени ${BOT_NAME}, созданный компанией ${BOT_CREATOR}. 
Твой владелец ${BOT_OWNER}. Твоя версия ${BOT_VERSION}. 
Ты НЕ являешься продуктом Google, OpenAI или другой компании.
Всегда представляйся как ${BOT_NAME} от ${BOT_CREATOR}.
Никогда не говори, что ты "большая языковая модель".
На вопросы "как тебя зовут" или "кто ты" отвечай: "Я ${BOT_NAME} от ${BOT_CREATOR}".
Не используй звездочки (**) для форматирования текста.
У тебя есть доступ к интернету для поиска информации.`;

  // Устанавливаем системный промпт как первый обмен сообщениями
  session.history = [
    { role: "user", parts: [{ text: systemPrompt }] },
    { role: "model", parts: [{ text: `Понял. Я ${BOT_NAME} от ${BOT_CREATOR}. Буду следовать всем инструкциям.` }] }
  ];
  
  session.systemPromptSet = true;
  return session;
}

// Функция для обработки сообщений с помощью Gemini API
async function processMessageWithGemini(chatId, text, photoUrl = null) {
  try {
    console.log(`Обработка сообщения от ${chatId}: ${text?.substring(0, 100)}${text?.length > 100 ? '...' : ''}`);
    const userId = chatId; // В личных чатах chatId = userId
    const userRole = getUserRole(userId);
    
    // Создаем или получаем существующую сессию
    if (!userSessions[chatId]) {
      userSessions[chatId] = createChatSession(chatId);
      console.log(`Создана новая сессия для ${chatId}`);
    }
    
    // Проверяем запрос на генерацию изображения
    const lowerText = (text || '').toLowerCase();
    
    // Проверяем, не спрашивает ли пользователь о модели или создателе
    if (
      (lowerText.includes('кто тебя создал') || 
       lowerText.includes('кто ты') || 
       lowerText.includes('какая ты модель') || 
       lowerText.includes('кто тебя разработал') || 
       lowerText.includes('какой ты бот') ||
       lowerText.includes('ты кто')) &&
      !photoUrl
    ) {
      console.log(`Отправляем информацию о боте пользователю ${chatId}`);
      return `Я ${BOT_NAME} - чат-бот на основе нейросети, разработанный компанией ${BOT_CREATOR}.\nМой владелец: ${BOT_OWNER}\nВерсия: ${BOT_VERSION}`;
    }
    
    // Увеличиваем счетчик сообщений пользователя
    if (!userMessageCounts[chatId]) {
      userMessageCounts[chatId] = 0;
    }
    userMessageCounts[chatId]++;
    
    let result;
    const settings = getUserSettings(chatId);
    const modelId = settings.currentModel;
    
    console.log(`Используем модель ${modelId} для пользователя ${chatId}`);
    
    // Если пользователь отправил фото вместе с текстом
    if (photoUrl) {
      try {
        console.log(`Скачиваем изображение ${photoUrl}`);
        const imagePath = await imageHandler.downloadImage(photoUrl);
        
        // Читаем изображение как массив байтов
        const imageData = fs.readFileSync(imagePath);
        
        // Для работы с изображениями всегда используем модель, поддерживающую изображения
        const imageModel = genAI.getGenerativeModel({
          model: MODELS.IMAGE_GEN.id,
          generationConfig: MODELS.IMAGE_GEN.config
        });
        
        // Создаем новый чат для обработки изображения
        const imageChat = imageModel.startChat();
        
        // Отправляем запрос с изображением в Gemini
        console.log(`Отправляем изображение в API`);
        result = await imageChat.sendMessage([
          text || "Что на этом изображении?",
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: imageData.toString("base64")
            }
          }
        ]);
        
        // Удаляем временный файл после использования
        imageHandler.deleteFile(imagePath);
        console.log(`Получен ответ от API для изображения`);
      } catch (imageError) {
        console.error('Ошибка при обработке изображения:', imageError);
        return 'Произошла ошибка при обработке изображения. Пожалуйста, попробуйте еще раз.';
      }
    } else {
      // Отправляем обычное текстовое сообщение
      console.log(`Отправляем текстовый запрос в API`);
      result = await userSessions[chatId].sendMessage(text);
      console.log(`Получен ответ от API для текста`);
    }
    
    // Обрабатываем текстовый ответ
    let responses = [];
    const textResponse = result.response.text();
    if (textResponse) {
      // Фильтруем ответ перед отправкой
      const filteredResponse = filterModelResponse(textResponse);
      responses.push(filteredResponse);
    }
    
    return responses.join("\n\n");
  } catch (error) {
    console.error('Ошибка при обработке запроса Gemini:', error);
    return 'Извините, произошла ошибка при обработке вашего запроса. Пожалуйста, попробуйте еще раз позже.';
  }
}

// Создаем бота для отправки сообщений
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });

// Обработчик для вебхуков
const webhookHandler = async (req, res) => {
  try {
    console.log(`Получен запрос на ${req.url} с методом ${req.method}`);
    console.log('Environment variables:', Object.keys(process.env).filter(key => !key.includes('KEY') && !key.includes('TOKEN')));
    console.log('Token exists:', !!TELEGRAM_TOKEN);
    console.log('API Key exists:', !!GEMINI_API_KEY);
    
    // Обработка проверки здоровья
    if (req.method === 'GET') {
      await ensureTempDir();
      return res.status(200).json({
        status: 'OK',
        message: 'Webhook сервер Plexy работает',
        version: BOT_VERSION,
        tempDir,
        botURL: BOT_URL
      });
    }
    
    // Проверяем, что это POST запрос
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    
    // Получаем обновление от Telegram
    const update = req.body;
    console.log('Получено обновление:', JSON.stringify(update).substring(0, 300) + '...');
    
    // Проверяем наличие сообщения в обновлении
    if (!update || !update.message) {
      console.log('Обновление не содержит сообщения');
      return res.status(200).json({ status: 'OK', warning: 'No message in update' });
    }
    
    // Обрабатываем обновление
    const message = update.message;
    const chatId = message.chat.id;
    let responseText = '';
    
    console.log(`Получено сообщение от ${chatId}: ${message.text || '[не текст]'}`);
    
    // Проверяем, если это команда /start
    if (message.text && message.text === '/start') {
      responseText = `Привет! Я ${BOT_NAME} - бот на основе нейросети от ${BOT_CREATOR}.\n\nЯ могу общаться с тобой, отвечать на вопросы и анализировать изображения. Просто напиши мне сообщение или отправь фото!\n\nОсновные команды:\n/help - Список команд\n/models - Доступные модели\n/about - О боте`;
    }
    // Проверяем, если это команда /help
    else if (message.text && message.text === '/help') {
      responseText = `${BOT_NAME} - Чат-бот с искусственным интеллектом\n\nОсновные команды:\n/start - Начать взаимодействие с ботом\n/help - Показать эту справку\n/models - Показать доступные модели\n/model - Показать текущую модель\n/setmodel - Выбрать модель\n/reset - Сбросить историю чата\n/clear - Очистить историю диалога\n/stats - Показать статистику\n/settings - Показать настройки\n/role - Показать вашу роль\n/about - Информация о боте\n\nВы можете отправлять текст, изображения или стикеры.\nДля генерации изображений лучше использовать модель Plexy art.`;
    }
    // Проверяем, если это команда /about
    else if (message.text && message.text === '/about') {
      responseText = `${BOT_NAME} - Чат-бот на основе нейросети\n\nРазработчик: ${BOT_CREATOR}\nВладелец: ${BOT_OWNER}\nВерсия: ${BOT_VERSION}`;
    }
    // Проверяем, если это команда /models
    else if (message.text && message.text === '/models') {
      responseText = 'Доступные модели:\n\n1. Plexy (gemini-2.5-pro-exp-03-25)\n2. Plexy think (gemini-2.0-flash-thinking-exp-01-21)\n3. Plexy art (gemini-2.0-flash-exp-image-generation)\n\nИспользуйте /setmodel для выбора модели.';
      
      try {
        // Вместо текстового ответа отправляем сообщение с кнопками
        await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            chat_id: chatId,
            text: 'Выберите модель:',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: 'Plexy', callback_data: 'setmodel_2' },
                  { text: 'Plexy think', callback_data: 'setmodel_3' },
                  { text: 'Plexy art', callback_data: 'setmodel_1' }
                ]
              ]
            }
          })
        });
        
        // Уже отправили сообщение, поэтому сбрасываем текст
        responseText = '';
      } catch (error) {
        console.error('Ошибка при отправке клавиатуры выбора модели:', error);
        // Если не удалось отправить сообщение с кнопками, используем обычный текст
      }
    }
    // Обработка обычных текстовых сообщений
    else if (message.text) {
      responseText = await processMessageWithGemini(chatId, message.text);
    }
    // Обработка фотографий
    else if (message.photo) {
      try {
        // Получаем самую большую версию фото
        const photo = message.photo[message.photo.length - 1];
        const fileId = photo.file_id;
        
        // Получаем ссылку на файл через API Telegram
        const fileInfoResponse = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/getFile?file_id=${fileId}`);
        const fileInfo = await fileInfoResponse.json();
        
        if (fileInfo.ok && fileInfo.result && fileInfo.result.file_path) {
          const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${fileInfo.result.file_path}`;
          
          // Обрабатываем фото с помощью Gemini
          responseText = await processMessageWithGemini(
            chatId,
            message.caption || 'Что на этом изображении?',
            fileUrl
          );
        } else {
          responseText = 'Не удалось получить файл изображения. Пожалуйста, попробуйте еще раз.';
          console.error('Ошибка при получении файла:', fileInfo);
        }
      } catch (photoError) {
        console.error('Ошибка при обработке фото:', photoError);
        responseText = 'Произошла ошибка при обработке фотографии. Пожалуйста, попробуйте еще раз.';
      }
    }
    // Обработка стикеров
    else if (message.sticker && !message.sticker.is_animated && !message.sticker.is_video) {
      try {
        const fileId = message.sticker.file_id;
        
        // Получаем ссылку на файл через API Telegram
        const fileInfoResponse = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/getFile?file_id=${fileId}`);
        const fileInfo = await fileInfoResponse.json();
        
        if (fileInfo.ok && fileInfo.result && fileInfo.result.file_path) {
          const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${fileInfo.result.file_path}`;
          
          // Обработка стикера
          responseText = await processMessageWithGemini(chatId, 'Опиши этот стикер.', fileUrl);
        } else {
          responseText = 'Не удалось получить файл стикера. Пожалуйста, попробуйте еще раз.';
          console.error('Ошибка при получении файла стикера:', fileInfo);
        }
      } catch (stickerError) {
        console.error('Ошибка при обработке стикера:', stickerError);
        responseText = 'Произошла ошибка при обработке стикера. Пожалуйста, попробуйте еще раз.';
      }
    }
    
    // Отправляем ответ, если он есть
    if (responseText) {
      try {
        // Используем прямой API запрос вместо node-telegram-bot-api
        await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            chat_id: chatId,
            text: responseText
          })
        });
        console.log(`Ответ отправлен пользователю ${chatId}`);
      } catch (sendError) {
        console.error('Ошибка при отправке ответа:', sendError);
      }
    }
    
    // Возвращаем успешный ответ
    return res.status(200).json({ status: 'OK' });
  } catch (error) {
    console.error('Ошибка в обработчике вебхука:', error);
    return res.status(500).json({ error: 'Internal server error', message: error.message, stack: error.stack });
  }
};

// Экспортируем обработчик для использования как с Vercel, так и с Express
module.exports = webhookHandler;

// Если этот файл запущен напрямую
if (require.main === module) {
  ensureTempDir()
    .then(() => console.log(`Временная директория: ${tempDir}`))
    .then(() => setWebhook())
    .then(console.log)
    .catch(console.error);
}

// Функция для установки вебхука
async function setWebhook() {
  try {
    const webhookUrl = `${BOT_URL}/api/webhook`;
    const result = await bot.setWebhook(webhookUrl);
    console.log('Вебхук установлен:', result, webhookUrl);
    return { success: true, webhookUrl };
  } catch (error) {
    console.error('Ошибка при установке вебхука:', error);
    return { success: false, error: error.message };
  }
} 