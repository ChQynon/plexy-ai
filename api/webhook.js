// Webhook-обработчик для Telegram бота на Vercel
const TelegramBot = require('node-telegram-bot-api');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Конфигурация - берём напрямую из vercel.json
const TELEGRAM_TOKEN = "8178608724:AAHZP8zTEXvmxkfQ1J3iyR0IVEfiv_l_548";
const GEMINI_API_KEY = "AIzaSyCBAW-Or3PDa_c48WCWikH3f7EhvUwsvnE";
const BOT_NAME = "Plexy";
const BOT_CREATOR = "Plexy Lab";
const BOT_OWNER = "qynon";
const BOT_VERSION = "1.1.0";

// Форматируем имя владельца
const formattedBotOwner = '@' + BOT_OWNER;

// Определяем роли пользователей
const ROLES = {
  ADMIN: 'admin',    // Администратор
  PREMIUM: 'premium', // Премиум пользователь
  USER: 'user',      // Обычный пользователь
  BOT: 'bot'         // Роль бота
};

// Информация о боте
const BOT_INFO = {
  description: 'Чат-бот на основе нейросети',
  capabilities: ['текстовые ответы', 'генерация изображений', 'обработка фотографий', 'понимание контекста']
};

// Доступные модели
const MODELS = {
  IMAGE_GEN: {
    id: "gemini-pro-vision",
    name: "Plexy art",
    config: {
      temperature: 1,
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 8192
    }
  },
  PRO: {
    id: "gemini-pro",
    name: "Plexy",
    config: {
      temperature: 1,
      topP: 0.95,
      topK: 64,
      maxOutputTokens: 8192
    }
  },
  ULTRA: {
    id: "gemini-1.0-pro",
    name: "Plexy ultra",
    config: {
      temperature: 0.9,
      topP: 0.95,
      topK: 64,
      maxOutputTokens: 8192
    }
  }
};

// Настройки пользователей (модель по умолчанию, настройки и т.д.)
const userSettings = {};
// Роли пользователей
const userRoles = {};
// ID администратора (если задан)
const ADMIN_ID = "718910310";

// Инициализация API Gemini
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Создаем экземпляры моделей
const models = {
  [MODELS.PRO.id]: genAI.getGenerativeModel({ model: MODELS.PRO.id }),
  [MODELS.ULTRA.id]: genAI.getGenerativeModel({ model: MODELS.ULTRA.id }),
  [MODELS.IMAGE_GEN.id]: genAI.getGenerativeModel({ model: MODELS.IMAGE_GEN.id })
};

// Инициализация бота
const bot = new TelegramBot(TELEGRAM_TOKEN);

// Создает системный промпт для модели
function createSystemPrompt() {
  return `Ты бот по имени ${BOT_NAME}.
Твоя роль - ${ROLES.BOT}. Ты предоставляешь информацию и помогаешь пользователям.
Ты создан компанией ${BOT_CREATOR}, твой владелец и директор ${formattedBotOwner}.
Версия: ${BOT_VERSION}.
ВАЖНО: всегда называй себя только ${BOT_NAME} и всегда упоминай, что тебя создала компания ${BOT_CREATOR}.
Никогда не называй себя другими именами и не упоминай другие компании-создатели.
Твои возможности: ${BOT_INFO.capabilities.join(', ')}.
Ты знаешь множество языков, включая русский, английский, испанский, французский, немецкий, китайский и другие.`;
}

// Получает роль пользователя
function getUserRole(userId) {
  // Если это админ, возвращаем роль админа
  if (userId.toString() === ADMIN_ID) {
    return ROLES.ADMIN;
  }
  
  // Если роль задана, возвращаем её
  if (userRoles[userId]) {
    return userRoles[userId];
  }
  
  // По умолчанию - обычный пользователь
  return ROLES.USER;
}

// Получает текущую модель пользователя
function getUserModel(userId) {
  if (userSettings[userId] && userSettings[userId].model) {
    return userSettings[userId].model;
  }
  return MODELS.PRO.id; // Модель по умолчанию
}

// Устанавливает модель пользователя
function setUserModel(userId, modelId) {
  if (!userSettings[userId]) {
    userSettings[userId] = {};
  }
  userSettings[userId].model = modelId;
}

// Простая обработка сообщений
async function processMessage(chatId, text) {
  try {
    console.log(`Обработка сообщения от ${chatId}: ${text}`);
    
    // Получаем текущую модель пользователя
    const modelId = getUserModel(chatId);
    const modelConfig = Object.values(MODELS).find(m => m.id === modelId)?.config || MODELS.PRO.config;
    
    // Получаем экземпляр модели
    const modelInstance = models[modelId] || models[MODELS.PRO.id];
    
    // Создаем системный промпт
    const systemPrompt = createSystemPrompt();
    
    // Создаем простой запрос к модели
    const prompt = `${systemPrompt}

Вопрос пользователя: ${text}

Дай четкий и информативный ответ.`;

    // Отправляем запрос к API с конфигурацией
    const result = await modelInstance.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: modelConfig.temperature,
        topP: modelConfig.topP,
        topK: modelConfig.topK,
        maxOutputTokens: modelConfig.maxOutputTokens
      }
    });
    
    const response = result.response.text();
    
    // Отправляем ответ пользователю
    await bot.sendMessage(chatId, response);
    console.log(`Ответ отправлен в чат ${chatId}`);
    
  } catch (error) {
    console.error('Ошибка при обработке сообщения:', error);
    // Отправляем информацию об ошибке
    await bot.sendMessage(chatId, `Произошла ошибка: ${error.message}. Пожалуйста, попробуйте позже.`);
  }
}

// Функция-обработчик для вебхука
module.exports = async (req, res) => {
  try {
    // Логируем запрос для отладки
    console.log('Получен запрос:', req.method);
    console.log('Headers:', JSON.stringify(req.headers));
    console.log('Body:', JSON.stringify(req.body));
    
    // Проверяем метод запроса
    if (req.method === 'POST') {
      const update = req.body;
      
      // Проверяем содержит ли обновление сообщение
      if (update && update.message) {
        const chatId = update.message.chat.id;
        const userId = update.message.from.id;
        const text = update.message.text || '';
        const userRole = getUserRole(userId);
        
        try {
          // Обрабатываем команды
          if (text.startsWith('/')) {
            const command = text.split(' ')[0].toLowerCase();
            const args = text.split(' ').slice(1);
            
            switch (command) {
              case '/start':
                await bot.sendMessage(
                  chatId,
                  `Привет! Я ${BOT_NAME}, бот созданный компанией ${BOT_CREATOR}.\n\nМои возможности:\n• Отвечаю на вопросы и поддерживаю диалог\n• Генерирую изображения\n• Обрабатываю фотографии\n• Понимаю контекст беседы\n\nЧем могу помочь?`
                );
                break;
                
              case '/about':
                await bot.sendMessage(
                  chatId,
                  `${BOT_NAME} - ${BOT_INFO.description}\n\nРазработчик: ${BOT_CREATOR}\nВладелец: ${formattedBotOwner}\nВерсия: ${BOT_VERSION}`
                );
                break;
                
              case '/models':
                let modelsText = 'Доступные модели:\n\n';
                Object.values(MODELS).forEach((model, index) => {
                  modelsText += `${index + 1}. ${model.name} (${model.id})\n`;
                });
                modelsText += '\nДля выбора модели используйте /setmodel [номер]';
                await bot.sendMessage(chatId, modelsText);
                break;
                
              case '/model':
                const currentModelId = getUserModel(chatId);
                const currentModel = Object.values(MODELS).find(m => m.id === currentModelId);
                await bot.sendMessage(
                  chatId,
                  `Текущая модель: ${currentModel ? currentModel.name : 'Стандартная'} (${currentModelId})`
                );
                break;
                
              case '/setmodel':
                if (args.length === 0) {
                  await bot.sendMessage(chatId, 'Пожалуйста, укажите номер модели, например: /setmodel 1');
                } else {
                  const modelIndex = parseInt(args[0]) - 1;
                  const availableModels = Object.values(MODELS);
                  
                  if (modelIndex >= 0 && modelIndex < availableModels.length) {
                    const newModel = availableModels[modelIndex];
                    setUserModel(chatId, newModel.id);
                    await bot.sendMessage(chatId, `Модель изменена на ${newModel.name} (${newModel.id})`);
                  } else {
                    await bot.sendMessage(chatId, `Некорректный номер модели. Доступны номера от 1 до ${availableModels.length}`);
                  }
                }
                break;
                
              case '/role':
                const roleInfo = userRole === ROLES.ADMIN ? 'Администратор' : 
                                 userRole === ROLES.PREMIUM ? 'Премиум пользователь' : 'Обычный пользователь';
                await bot.sendMessage(chatId, `Ваша роль: ${roleInfo}`);
                break;
                
              default:
                await bot.sendMessage(chatId, 'Неизвестная команда. Используйте /help для списка команд.');
            }
          } else if (text) {
            // Обрабатываем как обычное сообщение
            await processMessage(chatId, text);
          }
        } catch (error) {
          console.error('Ошибка при отправке сообщения:', error);
          // Без await, чтобы не блокировать ответ
          bot.sendMessage(chatId, 'Произошла ошибка при отправке сообщения').catch(console.error);
        }
      }
      
      // Всегда отправляем успешный ответ Telegram
      res.status(200).send('OK');
    } else {
      // Для GET-запросов возвращаем информацию о боте
      res.status(200).json({
        status: 'Bot is running',
        name: BOT_NAME,
        version: BOT_VERSION,
        models: Object.keys(models)
      });
    }
  } catch (error) {
    console.error('Ошибка в обработчике вебхука:', error);
    // Всегда возвращаем 200 для Telegram
    res.status(200).send('OK');
  }
}; 