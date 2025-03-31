// Webhook-обработчик для Telegram бота на Vercel
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Конфигурация
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const BOT_NAME = process.env.BOT_NAME || 'Plexy';
const BOT_CREATOR = process.env.BOT_CREATOR || 'Plexy Lab';
const BOT_OWNER = process.env.BOT_OWNER || 'qynon';
const BOT_VERSION = process.env.BOT_VERSION || '1.1.0';

// Форматируем имя владельца
const formattedBotOwner = BOT_OWNER.startsWith('@') ? BOT_OWNER : '@' + BOT_OWNER;

// Инициализация API Gemini
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

// Инициализация бота
const bot = new TelegramBot(TELEGRAM_TOKEN);

// Обработка сообщений
async function processMessage(chatId, text) {
  try {
    console.log(`Обработка сообщения от ${chatId}: ${text}`);
    
    // Создаем чат сессию
    const chat = model.startChat({
      generationConfig: {
        temperature: 0.9,
        topK: 64,
        topP: 0.95,
        maxOutputTokens: 8192,
      },
      history: [
        {
          role: 'user',
          parts: [{ text: 'Привет, как тебя зовут?' }],
        },
        {
          role: 'model',
          parts: [{ text: `Меня зовут ${BOT_NAME}. Я бот, созданный компанией ${BOT_CREATOR}. Мой владелец и директор: ${formattedBotOwner}. Чем могу помочь?` }],
        },
      ],
    });
    
    // Отправляем сообщение на обработку в API
    const result = await chat.sendMessage(text);
    const response = result.response.text();
    
    // Отправляем ответ пользователю
    await bot.sendMessage(chatId, response);
    console.log(`Ответ отправлен в чат ${chatId}`);
    
  } catch (error) {
    console.error('Ошибка при обработке сообщения:', error);
    await bot.sendMessage(chatId, 'Произошла ошибка при обработке вашего сообщения. Пожалуйста, попробуйте позже.');
  }
}

// Функция-обработчик для вебхука
module.exports = async (req, res) => {
  try {
    // Проверяем метод запроса
    if (req.method === 'POST') {
      console.log('Получено обновление от Telegram:', JSON.stringify(req.body));
      
      const update = req.body;
      
      // Проверяем, содержит ли обновление сообщение
      if (update && update.message && update.message.text) {
        const chatId = update.message.chat.id;
        const text = update.message.text;
        
        // Проверяем, является ли сообщение командой
        if (text.startsWith('/')) {
          // Обрабатываем команды
          switch (text) {
            case '/start':
              await bot.sendMessage(chatId, `Привет! Я ${BOT_NAME}, бот созданный компанией ${BOT_CREATOR}. Чем могу помочь?`);
              break;
            case '/about':
              await bot.sendMessage(chatId, `${BOT_NAME} - Чат-бот на основе нейросети\n\nРазработчик: ${BOT_CREATOR}\nВладелец: ${formattedBotOwner}\nВерсия: ${BOT_VERSION}`);
              break;
            default:
              await bot.sendMessage(chatId, 'Извините, эта команда мне не знакома.');
          }
        } else {
          // Обрабатываем обычное сообщение
          await processMessage(chatId, text);
        }
      }
      
      // Отправляем успешный ответ Telegram
      res.status(200).send('OK');
    } else {
      // Для GET-запросов возвращаем информацию о боте
      res.status(200).json({
        status: 'Bot is running',
        name: BOT_NAME,
        version: BOT_VERSION,
        webhook: 'active'
      });
    }
  } catch (error) {
    console.error('Ошибка в обработчике вебхука:', error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
}; 