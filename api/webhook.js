// Основной файл вебхука с прямым подходом к API
console.log('WEBHOOK.JS ЗАГРУЖЕН');

const https = require('https');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');

// Логируем версии и среду
console.log('Node.js version:', process.version);
console.log('Environment:', process.env.NODE_ENV);
console.log('Current directory:', __dirname);

// Жестко закодированные токены для гарантированной работы
const TELEGRAM_TOKEN = '8178608724:AAHZP8zTEXvmxkfQ1J3iyR0IVEfiv_l_548';
const GEMINI_API_KEY = 'AIzaSyCBAW-Or3PDa_c48WCWikH3f7EhvUwsvnE';

// Информация о боте
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

// Хранилище сессий пользователей (в памяти)
const userSessions = {};
const userSettings = {};
const userMessageCounts = {};

// Функция для отправки сообщения в Telegram
function sendTelegramMessage(chatId, text) {
  return new Promise((resolve, reject) => {
    try {
      // Формируем данные для запроса
      const data = JSON.stringify({
        chat_id: chatId,
        text: text
      });
      
      // Настройки запроса
      const options = {
        hostname: 'api.telegram.org',
        port: 443,
        path: `/bot${TELEGRAM_TOKEN}/sendMessage`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': data.length
        }
      };
      
      // Отправляем запрос
      const request = https.request(options, (response) => {
        let responseData = '';
        
        response.on('data', (chunk) => {
          responseData += chunk;
        });
        
        response.on('end', () => {
          if (response.statusCode === 200) {
            resolve(JSON.parse(responseData));
          } else {
            reject(new Error(`HTTP Error: ${response.statusCode} - ${responseData}`));
          }
        });
      });
      
      request.on('error', (error) => {
        reject(error);
      });
      
      // Отправляем данные
      request.write(data);
      request.end();
    } catch (error) {
      reject(error);
    }
  });
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

// Функция для фильтрации текста ответа
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

// Функция для создания сессии чата
function createChatSession(chatId) {
  const settings = getUserSettings(chatId);
  const modelId = settings.currentModel || DEFAULT_MODEL;
  
  // Проверяем существование модели
  if (!models[modelId]) {
    settings.currentModel = DEFAULT_MODEL;
    return createChatSession(chatId);
  }
  
  // Создаем сессию с выбранной моделью
  const session = models[modelId].startChat({
    generationConfig: MODELS.PRO.config,
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
    { role: "model", parts: [{ text: `Я ${BOT_NAME} от ${BOT_CREATOR}. Буду следовать всем инструкциям.` }] }
  ];
  
  session.systemPromptSet = true;
  return session;
}

// Основная функция обработки сообщения
async function processMessage(chatId, text) {
  try {
    // Проверяем команды
    if (text === '/start') {
      return `Привет! Я ${BOT_NAME} - бот на основе нейросети от ${BOT_CREATOR}.\n\nЯ могу общаться с тобой, отвечать на вопросы и анализировать изображения. Просто напиши мне сообщение или отправь фото!\n\nОсновные команды:\n/help - Список команд\n/models - Доступные модели\n/about - О боте`;
    }
    
    if (text === '/help') {
      return `${BOT_NAME} - Чат-бот с искусственным интеллектом\n\nОсновные команды:\n/start - Начать взаимодействие с ботом\n/help - Показать эту справку\n/models - Показать доступные модели\n/model - Показать текущую модель\n/setmodel - Выбрать модель\n/reset - Сбросить историю чата\n/clear - Очистить историю диалога\n/stats - Показать статистику\n/settings - Показать настройки\n/role - Показать вашу роль\n/about - Информация о боте\n\nВы можете отправлять текст, изображения или стикеры.\nДля генерации изображений лучше использовать модель Plexy art.`;
    }
    
    if (text === '/about') {
      return `${BOT_NAME} - Чат-бот на основе нейросети\n\nРазработчик: ${BOT_CREATOR}\nВладелец: ${BOT_OWNER}\nВерсия: ${BOT_VERSION}`;
    }
    
    if (text === '/models') {
      return 'Доступные модели:\n\n1. Plexy (gemini-2.5-pro-exp-03-25)\n2. Plexy think (gemini-2.0-flash-thinking-exp-01-21)\n3. Plexy art (gemini-2.0-flash-exp-image-generation)\n\nИспользуйте /setmodel для выбора модели.';
    }
    
    // Если команды не обнаружены, обрабатываем как обычный текст
    // Проверяем, не спрашивает ли пользователь о модели или создателе
    const lowerText = text.toLowerCase();
    if (
      lowerText.includes('кто тебя создал') || 
      lowerText.includes('кто ты') || 
      lowerText.includes('какая ты модель') || 
      lowerText.includes('кто тебя разработал') || 
      lowerText.includes('какой ты бот') ||
      lowerText.includes('ты кто')
    ) {
      return `Я ${BOT_NAME} - чат-бот на основе нейросети, разработанный компанией ${BOT_CREATOR}.\nМой владелец: ${BOT_OWNER}\nВерсия: ${BOT_VERSION}`;
    }
    
    // Увеличиваем счетчик сообщений пользователя
    if (!userMessageCounts[chatId]) {
      userMessageCounts[chatId] = 0;
    }
    userMessageCounts[chatId]++;
    
    // Создаем или получаем существующую сессию
    if (!userSessions[chatId]) {
      userSessions[chatId] = createChatSession(chatId);
    }
    
    // Отправляем запрос к модели
    const result = await userSessions[chatId].sendMessage(text);
    
    // Получаем и обрабатываем ответ
    const responseText = result.response.text();
    if (responseText) {
      const filteredResponse = filterModelResponse(responseText);
      return filteredResponse;
    }
    
    return 'Извините, произошла ошибка при обработке вашего запроса. Пожалуйста, попробуйте еще раз.';
  } catch (error) {
    console.error('Ошибка при обработке сообщения:', error);
    return 'Произошла ошибка при обработке вашего запроса. Пожалуйста, попробуйте еще раз.';
  }
}

// Основной обработчик вебхука
module.exports = async (req, res) => {
  try {
    // Логируем запуск
    console.log('Вебхук запущен, метод:', req.method, 'URL:', req.url);
    
    // GET запрос для проверки
    if (req.method === 'GET') {
      return res.status(200).json({
        status: 'OK',
        message: 'Вебхук работает',
        bot_name: BOT_NAME,
        version: BOT_VERSION
      });
    }
    
    // Обрабатываем только POST запросы от Telegram
    if (req.method === 'POST') {
      const update = req.body;
      console.log('Получено обновление от Telegram:', JSON.stringify(update || {}).substring(0, 300));
      
      // Проверяем наличие сообщения
      if (update && update.message && update.message.chat && update.message.chat.id) {
        const chatId = update.message.chat.id;
        const messageText = update.message.text || '';
        
        console.log(`Обрабатываем сообщение от ${chatId}: ${messageText}`);
        
        try {
          // Обрабатываем сообщение
          const responseText = await processMessage(chatId, messageText);
          
          // Отправляем ответ пользователю
          if (responseText) {
            await sendTelegramMessage(chatId, responseText);
            console.log(`Ответ успешно отправлен пользователю ${chatId}`);
          }
        } catch (messageError) {
          console.error('Ошибка при обработке сообщения:', messageError);
          try {
            await sendTelegramMessage(chatId, 'Извините, произошла ошибка при обработке вашего запроса. Пожалуйста, попробуйте еще раз.');
          } catch (sendError) {
            console.error('Ошибка при отправке сообщения об ошибке:', sendError);
          }
        }
      } else {
        console.log('Обновление не содержит сообщения с chatId');
      }
      
      // Отвечаем Telegram успешным статусом
      return res.status(200).json({ ok: true });
    }
    
    // Для других методов
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Ошибка в обработчике вебхука:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message,
      stack: error.stack
    });
  }
}; 