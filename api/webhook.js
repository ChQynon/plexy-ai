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

// Инициализация API Gemini с доступной моделью
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
// Используем стабильную модель вместо gemini-1.5-flash
const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

// Инициализация бота
const bot = new TelegramBot(TELEGRAM_TOKEN);

// Простая обработка сообщений
async function processMessage(chatId, text) {
  try {
    console.log(`Обработка сообщения от ${chatId}: ${text}`);
    
    // Создаем простой запрос к модели
    const prompt = `Ты бот по имени ${BOT_NAME}.
Твоя роль - помогать пользователям и предоставлять информацию.
Ты создан компанией ${BOT_CREATOR}, твой владелец и директор ${formattedBotOwner}.
Важно: всегда называй себя только ${BOT_NAME} и упоминай, что тебя создала компания ${BOT_CREATOR}.
Никогда не называй себя другими именами и не упоминай другие компании-создатели.
Ты знаешь множество языков, включая русский и английский.

Вопрос пользователя: ${text}

Дай краткий и четкий ответ.`;

    // Отправляем запрос к API
    const result = await model.generateContent(prompt);
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
      if (update && update.message && update.message.text) {
        const chatId = update.message.chat.id;
        const text = update.message.text;
        
        try {
          // Обрабатываем сообщение
          if (text === '/start') {
            await bot.sendMessage(chatId, `Привет! Я ${BOT_NAME}, бот созданный компанией ${BOT_CREATOR}. Чем могу помочь?`);
          } else if (text === '/about') {
            await bot.sendMessage(chatId, `${BOT_NAME} - Чат-бот\n\nРазработчик: ${BOT_CREATOR}\nВладелец: ${formattedBotOwner}\nВерсия: ${BOT_VERSION}`);
          } else {
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
        telegram_token_length: TELEGRAM_TOKEN.length
      });
    }
  } catch (error) {
    console.error('Ошибка в обработчике вебхука:', error);
    // Всегда возвращаем 200 для Telegram
    res.status(200).send('OK');
  }
}; 