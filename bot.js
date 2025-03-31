require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} = require("@google/generative-ai");
const fs = require("node:fs");
const path = require('path');
const imageHandler = require('./imageHandler');

// Конфигурация API ключей
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyCBAW-Or3PDa_c48WCWikH3f7EhvUwsvnE';
const DEFAULT_MODEL = process.env.BOT_DEFAULT_MODEL || 'gemini-2.5-pro-exp-03-25';
const TEMP_DIR = process.env.BOT_TEMP_DIR || './temp';

// Информация о боте
const BOT_NAME = 'Plexy';
const BOT_CREATOR = 'Plexy Lab';
const BOT_OWNER = '@qynon';
const BOT_VERSION = '1.1.0';

// Инициализация Google Gemini API
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Доступные модели
const MODELS = {
  IMAGE_GEN: {
    id: "gemini-2.0-flash-exp-image-generation",
    name: "Plexy art",
    config: {
      temperature: 1,
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 8192,
      responseModalities: ["image", "text"],
      responseMimeType: "text/plain"
    }
  },
  PRO: {
    id: "gemini-2.5-pro-exp-03-25",
    name: "Plexy",
    config: {
      temperature: 1,
      topP: 0.95,
      topK: 64,
      maxOutputTokens: 65536,
      responseModalities: ["text"],
      responseMimeType: "text/plain"
    }
  },
  THINKING: {
    id: "gemini-2.0-flash-thinking-exp-01-21",
    name: "Plexy think",
    config: {
      temperature: 0.7,
      topP: 0.95,
      topK: 64,
      maxOutputTokens: 65536,
      responseModalities: ["text"],
      responseMimeType: "text/plain"
    }
  }
};

// Инициализация моделей
const models = {
  [MODELS.IMAGE_GEN.id]: genAI.getGenerativeModel({
    model: MODELS.IMAGE_GEN.id
  }),
  [MODELS.PRO.id]: genAI.getGenerativeModel({
    model: MODELS.PRO.id
  }),
  [MODELS.THINKING.id]: genAI.getGenerativeModel({
    model: MODELS.THINKING.id
  })
};

// Инициализация Telegram бота
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// Настройки пользователей (модель по умолчанию, настройки и т.д.)
const userSettings = {};
// Сессии чатов для пользователей
const userSessions = {};
// Счетчик сообщений пользователей
const userMessageCounts = {};
// Роли пользователей
const userRoles = {};

// Константы для ролей
const ROLES = {
  ADMIN: 'admin',    // Администратор - полный доступ
  PREMIUM: 'premium', // Премиум пользователь - доступ ко всем моделям
  USER: 'user'       // Обычный пользователь - базовый доступ
};

// ID администратора (установите здесь ID вашего аккаунта в Telegram)
const ADMIN_ID = parseInt(process.env.ADMIN_ID || '0');

// Функция для получения или создания настроек пользователя
function getUserSettings(chatId) {
  if (!userSettings[chatId]) {
    userSettings[chatId] = {
      currentModel: DEFAULT_MODEL,
      saveHistory: true,
      notifyModelChange: true
    };
  }
  return userSettings[chatId];
}

// Функция для получения роли пользователя
function getUserRole(userId) {
  // Если роль не задана, назначаем роль по умолчанию
  if (!userRoles[userId]) {
    // Если это администратор, даем права администратора
    if (userId === ADMIN_ID) {
      userRoles[userId] = ROLES.ADMIN;
    } else {
      userRoles[userId] = ROLES.USER;
    }
  }
  return userRoles[userId];
}

// Функция для проверки, имеет ли пользователь определенную роль или выше
function hasRole(userId, requiredRole) {
  const userRole = getUserRole(userId);
  
  if (userRole === ROLES.ADMIN) return true; // Администратор имеет доступ ко всему
  
  if (requiredRole === ROLES.PREMIUM) {
    return userRole === ROLES.PREMIUM; // Только премиум и админ
  }
  
  if (requiredRole === ROLES.USER) {
    return true; // Все роли имеют базовый доступ
  }
  
  return false;
}

// Функция для установки роли пользователя
function setUserRole(userId, role) {
  // Проверяем валидность роли
  if (!Object.values(ROLES).includes(role)) {
    throw new Error(`Неправильная роль: ${role}`);
  }
  
  userRoles[userId] = role;
  return role;
}

// Обработчик команды /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const userName = msg.from.first_name || 'пользователь';
  
  // Инициализируем счетчик сообщений
  userMessageCounts[chatId] = 0;
  
  // Создаем клавиатуру с инлайн кнопками
  const keyboard = {
    inline_keyboard: [
      [
        { text: '📝 Помощь', callback_data: 'help' },
        { text: '🧠 Модели', callback_data: 'models' }
      ],
      [
        { text: '🔄 Сбросить историю', callback_data: 'reset' },
        { text: 'ℹ️ О боте', callback_data: 'about' }
      ]
    ]
  };
  
  bot.sendMessage(
    chatId,
    `Привет, ${userName}! Я ${BOT_NAME}, созданный компанией ${BOT_CREATOR}.\n\n` +
    'Я могу генерировать текст и изображения, отвечать на вопросы и поддерживать диалог.',
    { reply_markup: keyboard }
  );
});

// Обработчик команды /help
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const role = getUserRole(userId);
  
  let helpMessage = `${BOT_NAME} - Чат-бот с искусственным интеллектом\n\n` +
    'Основные команды:\n' +
    '/start - Начать взаимодействие с ботом\n' +
    '/help - Показать эту справку\n' +
    '/models - Показать доступные модели\n' +
    '/model - Показать текущую модель\n' +
    '/setmodel - Выбрать модель (с аргументом 1-3)\n' +
    '/reset - Сбросить историю чата\n' +
    '/clear - Очистить историю диалога\n' +
    '/stats - Показать статистику\n' +
    '/settings - Показать настройки\n' +
    '/role - Показать вашу роль\n' +
    '/about - Информация о боте\n\n';
  
  // Добавляем команды администратора, если пользователь админ
  if (role === ROLES.ADMIN) {
    helpMessage += 'Команды администратора:\n' +
      '/setrole [id] [роль] - Установить роль пользователя\n' +
      '/users - Показать список пользователей и их роли\n\n';
  }
  
  helpMessage += 'Вы можете отправлять текст, изображения или стикеры.';
  
  bot.sendMessage(chatId, helpMessage);
});

// Обработчик команды /models - показать все доступные модели
bot.onText(/\/models/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const settings = getUserSettings(chatId);
  const userRole = getUserRole(userId);
  
  // Создаем клавиатуру выбора модели
  const modelsKeyboard = {
    inline_keyboard: [
      [
        { text: 'Plexy', callback_data: 'setmodel_2' },
        { text: 'Plexy think', callback_data: 'setmodel_3' },
        { text: 'Plexy art', callback_data: 'setmodel_1' }
      ]
    ]
  };
  
  let message = 'Доступные модели:\n\n';
  Object.keys(MODELS).forEach((key, index) => {
    const model = MODELS[key];
    const isCurrent = model.id === settings.currentModel;
    
    message += `${index + 1}. ${model.name} ${isCurrent ? '✓' : ''}\n`;
  });
  
  message += '\nВыберите модель ниже или используйте команду /setmodel с номером модели (например: /setmodel 2)';
  
  bot.sendMessage(chatId, message, { reply_markup: modelsKeyboard });
});

// Обработчик команды /model - показать текущую модель
bot.onText(/\/model/, (msg) => {
  const chatId = msg.chat.id;
  const settings = getUserSettings(chatId);
  
  // Находим название модели по ID
  let modelName = "Неизвестная модель";
  for (const key in MODELS) {
    if (MODELS[key].id === settings.currentModel) {
      modelName = MODELS[key].name;
      break;
    }
  }
  
  bot.sendMessage(chatId, `Текущая модель: ${modelName}`);
});

// Обработчик команды /setmodel - установить модель
bot.onText(/\/setmodel/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const settings = getUserSettings(chatId);
  
  // Создаем клавиатуру выбора модели
  const modelsKeyboard = {
    inline_keyboard: [
      [
        { text: 'Plexy', callback_data: 'setmodel_2' },
        { text: 'Plexy think', callback_data: 'setmodel_3' },
        { text: 'Plexy art', callback_data: 'setmodel_1' }
      ]
    ]
  };
  
  bot.sendMessage(
    chatId,
    'Выберите модель:',
    { reply_markup: modelsKeyboard }
  );
});

// Обработчик команды /reset - сбросить историю чата
bot.onText(/\/reset/, (msg) => {
  const chatId = msg.chat.id;
  if (userSessions[chatId]) {
    delete userSessions[chatId];
    bot.sendMessage(chatId, 'История чата сброшена!');
  } else {
    bot.sendMessage(chatId, 'У вас еще нет активной сессии чата.');
  }
});

// Обработчик команды /clear - очистить историю диалога, идентично /reset
bot.onText(/\/clear/, (msg) => {
  const chatId = msg.chat.id;
  if (userSessions[chatId]) {
    delete userSessions[chatId];
    bot.sendMessage(chatId, 'История диалога очищена!');
  } else {
    bot.sendMessage(chatId, 'У вас еще нет активной сессии чата.');
  }
});

// Обработчик команды /stats - показать статистику использования
bot.onText(/\/stats/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const messageCount = userMessageCounts[chatId] || 0;
  const settings = getUserSettings(chatId);
  const role = getUserRole(userId);
  
  let currentModelName = "Неизвестная модель";
  for (const key in MODELS) {
    if (MODELS[key].id === settings.currentModel) {
      currentModelName = MODELS[key].name;
      break;
    }
  }
  
  bot.sendMessage(
    chatId,
    `Статистика использования:\n\n` +
    `Ваша роль: ${role}\n` +
    `Отправлено сообщений: ${messageCount}\n` +
    `Активная модель: ${currentModelName}\n` +
    `Сохранение истории: ${settings.saveHistory ? 'Включено' : 'Выключено'}\n`
  );
});

// Обработчик команды /settings - показать настройки пользователя
bot.onText(/\/settings/, (msg) => {
  const chatId = msg.chat.id;
  const settings = getUserSettings(chatId);
  
  let currentModelName = "Неизвестная модель";
  for (const key in MODELS) {
    if (MODELS[key].id === settings.currentModel) {
      currentModelName = MODELS[key].name;
      break;
    }
  }
  
  bot.sendMessage(
    chatId,
    `Настройки ${BOT_NAME}:\n\n` +
    `Модель: ${currentModelName}\n` +
    `Сохранение истории диалогов: ${settings.saveHistory ? 'Включено' : 'Выключено'}\n` +
    `Уведомления о смене модели: ${settings.notifyModelChange ? 'Включено' : 'Выключено'}\n\n` +
    'Для изменения модели используйте команду /setmodel'
  );
});

// Обработчик команды /setrole - только для администраторов
bot.onText(/\/setrole (\d+) (\w+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  // Проверяем, что пользователь администратор
  if (getUserRole(userId) !== ROLES.ADMIN) {
    bot.sendMessage(chatId, 'У вас нет прав для выполнения этой команды');
    return;
  }
  
  const targetUserId = parseInt(match[1]);
  const newRole = match[2].toLowerCase();
  
  // Проверяем существование роли
  if (!Object.values(ROLES).includes(newRole)) {
    bot.sendMessage(chatId, `Неправильная роль. Доступные роли: ${Object.values(ROLES).join(', ')}`);
    return;
  }
  
  try {
    setUserRole(targetUserId, newRole);
    bot.sendMessage(chatId, `Роль пользователя ${targetUserId} успешно изменена на "${newRole}"`);
  } catch (error) {
    bot.sendMessage(chatId, `Ошибка при изменении роли: ${error.message}`);
  }
});

// Обработчик команды /role - показать мою роль
bot.onText(/\/role/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const role = getUserRole(userId);
  
  let roleDescription = '';
  switch (role) {
    case ROLES.ADMIN:
      roleDescription = 'Администратор (полный доступ)';
      break;
    case ROLES.PREMIUM:
      roleDescription = 'Премиум пользователь (доступ ко всем моделям)';
      break;
    case ROLES.USER:
      roleDescription = 'Обычный пользователь (базовый доступ)';
      break;
    default:
      roleDescription = `Неизвестная роль: ${role}`;
  }
  
  bot.sendMessage(chatId, `Ваша роль: ${roleDescription}`);
});

// Обработчик команды /users - только для админов, показывает список пользователей с ролями
bot.onText(/\/users/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  // Проверяем, что пользователь администратор
  if (getUserRole(userId) !== ROLES.ADMIN) {
    bot.sendMessage(chatId, 'У вас нет прав для выполнения этой команды');
    return;
  }
  
  let usersList = 'Список пользователей и их роли:\n\n';
  for (const [id, role] of Object.entries(userRoles)) {
    usersList += `ID: ${id}, Роль: ${role}\n`;
  }
  
  if (Object.keys(userRoles).length === 0) {
    usersList = 'Список пользователей пуст';
  }
  
  bot.sendMessage(chatId, usersList);
});

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
  
  // Включаем доступ в интернет, если это доступно для модели
  if (modelId === MODELS.PRO.id || modelId === MODELS.THINKING.id) {
    modelConfig = {
      ...modelConfig,
      // Убираем tools из generationConfig, т.к. API не поддерживает этот параметр
      // и это вызывает ошибку 400 Bad Request
    };
    
    // Для моделей, которые поддерживают доступ к веб, добавляем соответствующие функции
    try {
      // Проверяем, поддерживает ли модель веб-поиск
      // В более новых версиях используется другой способ добавления веб-функций,
      // но мы не будем его использовать, чтобы избежать ошибок API
      console.log(`Используем модель: ${modelId}`);
    } catch (error) {
      console.warn('Предупреждение: не удалось включить доступ к интернету', error);
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

// Объявляем хранилище для запросов на обработку после выбора модели
const userPendingRequests = {};

// Функция для обработки сообщений с помощью Gemini API
async function processMessageWithGemini(chatId, text, photoUrl = null) {
  try {
    const userId = chatId; // В личных чатах chatId = userId
    const userRole = getUserRole(userId);
    
    // Проверяем запрос на генерацию изображения
    const lowerText = text.toLowerCase();
    if (
      (lowerText.includes('создай фото') || 
       lowerText.includes('нарисуй') || 
       lowerText.includes('сгенерируй изображение') || 
       lowerText.includes('сделай картинку') ||
       lowerText.includes('сгенерируй фото')) &&
      !photoUrl
    ) {
      const settings = getUserSettings(chatId);
      if (settings.currentModel !== MODELS.IMAGE_GEN.id) {
        // Предлагаем переключиться на модель для генерации изображений
        const switchModelKeyboard = {
          inline_keyboard: [
            [
              { text: 'Да, переключиться на Plexy art', callback_data: 'setmodel_1_and_continue' },
              { text: 'Нет, продолжить с текущей моделью', callback_data: 'continue_current_model' }
            ]
          ]
        };
        
        bot.sendMessage(
          chatId,
          'Для генерации изображений лучше использовать модель Plexy art. Хотите переключиться?',
          { reply_markup: switchModelKeyboard }
        );
        
        // Сохраняем текущий запрос для последующей обработки
        userPendingRequests[chatId] = text;
        return;
      }
    }
    
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
      bot.sendMessage(
        chatId,
        `Я ${BOT_NAME} - чат-бот на основе нейросети, разработанный компанией ${BOT_CREATOR}.\n` +
        `Мой владелец: ${BOT_OWNER}\n` +
        `Версия: ${BOT_VERSION}`
      );
      return;
    }
    
    // Проверяем, не спрашивает ли пользователь о командах
    if (
      (lowerText.includes('какие команды') || 
       lowerText.includes('как пользоваться') || 
       lowerText.includes('что ты умеешь') ||
       lowerText.includes('как изменить модель') ||
       lowerText.includes('как поменять модель')) &&
      !photoUrl
    ) {
      // Отправляем справку и кнопки
      const helpKeyboard = {
        inline_keyboard: [
          [
            { text: '📝 Список команд', callback_data: 'help' },
            { text: '🧠 Выбрать модель', callback_data: 'models' }
          ]
        ]
      };
      
      bot.sendMessage(
        chatId,
        `Вот основные команды:\n` +
        `/start - Начать взаимодействие с ботом\n` +
        `/help - Показать справку\n` +
        `/models - Показать доступные модели\n` +
        `/setmodel - Выбрать модель\n` +
        `/reset - Сбросить историю чата\n` +
        `/stats - Показать статистику\n\n` +
        `Чтобы изменить модель, используйте команду /setmodel или нажмите кнопку "Выбрать модель" ниже.`,
        { reply_markup: helpKeyboard }
      );
      return;
    }
    
    // Отображаем состояние "печатает..."
    bot.sendChatAction(chatId, 'typing');
    
    // Создаем или получаем существующую сессию
    if (!userSessions[chatId]) {
      userSessions[chatId] = createChatSession(chatId);
    }
    
    // Задаем системный промпт с инструкциями для модели
    if (!userSessions[chatId].systemPromptSet) {
      // Отправляем системный промпт только один раз при создании сессии
      try {
        // Установка системного промпта уже произошла в функции createChatSession
        // Дополнительных действий не требуется
        if (!userSessions[chatId].systemPromptSet) {
          userSessions[chatId].systemPromptSet = true;
        }
      } catch (error) {
        console.error('Ошибка при проверке системного промпта:', error);
      }
    }
    
    // Увеличиваем счетчик сообщений пользователя
    if (!userMessageCounts[chatId]) {
      userMessageCounts[chatId] = 0;
    }
    userMessageCounts[chatId]++;
    
    let result;
    const settings = getUserSettings(chatId);
    const modelId = settings.currentModel;
    
    // Если пользователь отправил фото вместе с текстом
    if (photoUrl) {
      try {
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
      } catch (imageError) {
        console.error('Ошибка при обработке изображения:', imageError);
        bot.sendMessage(chatId, 'Произошла ошибка при обработке изображения. Пожалуйста, попробуйте еще раз.');
        return;
      }
    } else if (lowerText.includes('нарисуй') || 
             lowerText.includes('создай фото') ||
             lowerText.includes('сгенерируй изображение') ||
             lowerText.includes('сделай картинку') ||
             lowerText.includes('сгенерируй фото')) {
      // Для генерации изображений используем соответствующую модель
      try {
        // Используем gemini-2.0-flash-exp-image-generation (MODELS.IMAGE_GEN)
        const imageGenModel = genAI.getGenerativeModel({
          model: "gemini-2.0-flash-exp-image-generation", // Явно указываем модель
          generationConfig: {
            temperature: 1,
            topP: 0.95,
            topK: 40,
            maxOutputTokens: 8192,
            responseModalities: ["image", "text"],
            responseMimeType: "text/plain"
          }
        });
        
        // Отправляем запрос на генерацию изображения
        result = await imageGenModel.generateContent(text);
        
        // Проверяем, есть ли изображение в ответе
        if (result.response && result.response.candidates) {
          // Остальная логика обработки изображений
        }
      } catch (genError) {
        console.error('Ошибка при генерации изображения:', genError);
        bot.sendMessage(chatId, 'Произошла ошибка при создании изображения. Пожалуйста, попробуйте еще раз.');
        return;
      }
    } else {
      // Отправляем обычное текстовое сообщение
      result = await userSessions[chatId].sendMessage(text);
    }
    
    // Обрабатываем текстовый ответ
    const textResponse = result.response.text();
    if (textResponse) {
      // Фильтруем ответ перед отправкой
      const filteredResponse = filterModelResponse(textResponse);
      
      // Отправляем ответ без дополнительных кнопок
      bot.sendMessage(chatId, filteredResponse);
    }
    
    // Обрабатываем изображения, если они есть
    const candidates = result.response.candidates;
    for (let candidate_index = 0; candidate_index < candidates.length; candidate_index++) {
      for (let part_index = 0; part_index < candidates[candidate_index].content.parts.length; part_index++) {
        const part = candidates[candidate_index].content.parts[part_index];
        if (part.inlineData) {
          try {
            // Сохраняем изображение во временный файл
            const filename = imageHandler.saveBase64Image(
              part.inlineData.data,
              part.inlineData.mimeType,
              chatId
            );
            
            // Отправляем изображение пользователю без дополнительных кнопок
            bot.sendPhoto(chatId, filename).then(() => {
              // Удаляем временный файл после отправки
              imageHandler.deleteFile(filename);
            });
          } catch (err) {
            console.error('Ошибка при обработке изображения:', err);
            bot.sendMessage(chatId, 'Произошла ошибка при обработке изображения');
          }
        }
      }
    }
  } catch (error) {
    console.error('Ошибка при обработке запроса Gemini:', error);
    bot.sendMessage(
      chatId,
      'Извините, произошла ошибка при обработке вашего запроса. Пожалуйста, попробуйте еще раз позже.'
    );
  }
}

// Обработчик команды /about
bot.onText(/\/about/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(
    chatId,
    `${BOT_NAME} - Чат-бот на основе нейросети\n\n` +
    `Разработчик: ${BOT_CREATOR}\n` +
    `Владелец: ${BOT_OWNER}\n` +
    `Версия: ${BOT_VERSION}`
  );
});

// Обработчик нажатий на инлайн-кнопки
bot.on('callback_query', (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;
  
  // Показываем, что запрос обрабатывается
  bot.answerCallbackQuery(callbackQuery.id);
  
  switch (data) {
    case 'help':
      // Вызываем команду /help
      bot.sendMessage(
        chatId,
        `${BOT_NAME} - Чат-бот с искусственным интеллектом\n\n` +
        'Основные команды:\n' +
        '/start - Начать взаимодействие с ботом\n' +
        '/help - Показать эту справку\n' +
        '/models - Показать доступные модели\n' +
        '/model - Показать текущую модель\n' +
        '/setmodel - Выбрать модель\n' +
        '/reset - Сбросить историю чата\n' +
        '/clear - Очистить историю диалога\n' +
        '/stats - Показать статистику\n' +
        '/settings - Показать настройки\n' +
        '/role - Показать вашу роль\n' +
        '/about - Информация о боте\n\n' +
        'Вы можете отправлять текст, изображения или стикеры.\n' +
        'Для генерации изображений лучше использовать модель Plexy art.'
      );
      break;
    case 'models':
      // Создаем клавиатуру выбора модели
      const modelsKeyboard = {
        inline_keyboard: [
          [
            { text: 'Plexy', callback_data: 'setmodel_2' },
            { text: 'Plexy think', callback_data: 'setmodel_3' },
            { text: 'Plexy art', callback_data: 'setmodel_1' }
          ]
        ]
      };
      
      bot.sendMessage(
        chatId,
        'Выберите модель:',
        { reply_markup: modelsKeyboard }
      );
      break;
    case 'reset':
      // Сбрасываем историю чата
      if (userSessions[chatId]) {
        delete userSessions[chatId];
        bot.sendMessage(chatId, 'История чата сброшена!');
      } else {
        bot.sendMessage(chatId, 'У вас еще нет активной сессии чата.');
      }
      break;
    case 'continue_current_model':
      // Продолжаем запрос с текущей моделью
      if (userPendingRequests[chatId]) {
        const pendingRequest = userPendingRequests[chatId];
        delete userPendingRequests[chatId];
        processMessageWithGemini(chatId, pendingRequest);
      }
      break;
    case 'setmodel_1_and_continue':
      // Переключаемся на модель для генерации изображений и продолжаем запрос
      const settingsForImage = getUserSettings(chatId);
      settingsForImage.currentModel = MODELS.IMAGE_GEN.id;
      
      // Сбрасываем сессию при смене модели
      if (userSessions[chatId]) {
        delete userSessions[chatId];
      }
      
      bot.sendMessage(chatId, `Выбрана модель: ${MODELS.IMAGE_GEN.name}`);
      
      // Обрабатываем отложенный запрос
      if (userPendingRequests[chatId]) {
        const pendingRequest = userPendingRequests[chatId];
        delete userPendingRequests[chatId];
        processMessageWithGemini(chatId, pendingRequest);
      }
      break;
    case 'about':
      // Информация о боте
      bot.sendMessage(
        chatId,
        `${BOT_NAME} - Чат-бот на основе нейросети\n\n` +
        `Разработчик: ${BOT_CREATOR}\n` +
        `Владелец: ${BOT_OWNER}\n` +
        `Версия: ${BOT_VERSION}`
      );
      break;
    case 'stats':
      // Получаем статистику пользователя
      const messageCount = userMessageCounts[chatId] || 0;
      const settings = getUserSettings(chatId);
      const role = getUserRole(callbackQuery.from.id);
      
      let currentModelName = "Неизвестная модель";
      for (const key in MODELS) {
        if (MODELS[key].id === settings.currentModel) {
          currentModelName = MODELS[key].name;
          break;
        }
      }
      
      bot.sendMessage(
        chatId,
        `Статистика использования:\n\n` +
        `Ваша роль: ${role}\n` +
        `Отправлено сообщений: ${messageCount}\n` +
        `Активная модель: ${currentModelName}\n` +
        `Сохранение истории: ${settings.saveHistory ? 'Включено' : 'Выключено'}\n`
      );
      break;
    default:
      // Обработка выбора модели
      if (data.startsWith('setmodel_')) {
        const modelNumber = parseInt(data.split('_')[1]);
        
        const modelKeys = Object.keys(MODELS);
        if (modelNumber >= 1 && modelNumber <= modelKeys.length) {
          const selectedModelKey = modelKeys[modelNumber - 1];
          const selectedModel = MODELS[selectedModelKey];
          
          const settings = getUserSettings(chatId);
          settings.currentModel = selectedModel.id;
          
          // Сбрасываем сессию при смене модели
          if (userSessions[chatId]) {
            delete userSessions[chatId];
          }
          
          bot.sendMessage(chatId, `Выбрана модель: ${selectedModel.name}`);
        }
      }
      break;
  }
});

// Обработчик текстовых сообщений
bot.on('text', (msg) => {
  // Игнорируем команды
  if (msg.text && msg.text.startsWith('/')) return;
  
  const chatId = msg.chat.id;
  processMessageWithGemini(chatId, msg.text);
});

// Обработчик фото
bot.on('photo', async (msg) => {
  const chatId = msg.chat.id;
  const caption = msg.caption || '';
  
  // Получаем массив фотографий разных размеров и берем лучшее качество
  const photos = msg.photo;
  const bestPhoto = photos[photos.length - 1];
  const fileId = bestPhoto.file_id;
  
  try {
    // Получаем информацию о файле
    const fileInfo = await bot.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${fileInfo.file_path}`;
    
    // Обработка фото и текста
    processMessageWithGemini(chatId, caption, fileUrl);
  } catch (error) {
    console.error('Ошибка при получении файла:', error);
    bot.sendMessage(chatId, 'Произошла ошибка при обработке фото');
  }
});

// Обработчик стикеров
bot.on('sticker', async (msg) => {
  const chatId = msg.chat.id;
  
  if (msg.sticker.is_animated || msg.sticker.is_video) {
    bot.sendMessage(chatId, 'Извините, я не могу обрабатывать анимированные стикеры или видео-стикеры');
    return;
  }
  
  try {
    // Получаем информацию о файле стикера
    const fileId = msg.sticker.file_id;
    const fileInfo = await bot.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${fileInfo.file_path}`;
    
    // Обработка стикера
    processMessageWithGemini(chatId, `Опиши этот стикер.`, fileUrl);
  } catch (error) {
    console.error('Ошибка при получении файла стикера:', error);
    bot.sendMessage(chatId, 'Произошла ошибка при обработке стикера');
  }
});

// Обработка ошибок
bot.on('polling_error', (error) => {
  console.error('Ошибка соединения с Telegram:', error);
});

// Периодическая очистка старых временных файлов (каждый час)
const CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 час
setInterval(() => {
  try {
    const count = imageHandler.cleanOldTempFiles();
    if (count > 0) {
      console.log(`Очищено ${count} устаревших временных файлов`);
    }
  } catch (error) {
    console.error('Ошибка при очистке временных файлов:', error);
  }
}, CLEANUP_INTERVAL);

console.log(`${BOT_NAME} v${BOT_VERSION} запущен! Нажмите Ctrl+C для остановки.`);