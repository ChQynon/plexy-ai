// Простой тест для проверки работы вебхука
require('dotenv').config();
const axios = require('axios');

// Токен вашего бота
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;

// Обработчик для вебхуков
module.exports = async (req, res) => {
  try {
    console.log('Тестовый вебхук запущен');
    console.log('Метод:', req.method);
    console.log('Переменные окружения существуют:', {
      tokenExists: !!process.env.TELEGRAM_TOKEN,
      apiKeyExists: !!process.env.GEMINI_API_KEY
    });
    
    // Обработка GET запросов
    if (req.method === 'GET') {
      return res.status(200).json({
        status: 'OK',
        message: 'Тестовый вебхук работает'
      });
    }
    
    // Обработка POST запросов
    if (req.method === 'POST') {
      const update = req.body;
      console.log('Получено обновление:', JSON.stringify(update).substring(0, 300) + '...');
      
      // Проверяем наличие сообщения
      if (update && update.message && update.message.chat && update.message.chat.id) {
        const chatId = update.message.chat.id;
        const messageText = update.message.text || 'Получено несколько сообщений';
        
        console.log(`Пытаемся ответить пользователю ${chatId} на сообщение: ${messageText}`);
        
        try {
          // Отправляем простой ответ
          const response = await axios.post(
            `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
            {
              chat_id: chatId,
              text: `Тестовый ответ на ваше сообщение: "${messageText}"`
            }
          );
          
          console.log('Ответ отправлен успешно:', response.data);
        } catch (sendError) {
          console.error('Ошибка при отправке ответа:', sendError.message);
          if (sendError.response) {
            console.error('Данные ответа:', sendError.response.data);
          }
        }
      } else {
        console.log('Обновление не содержит сообщения с chatId');
      }
      
      // Всегда возвращаем успешный ответ Telegram
      return res.status(200).json({ ok: true });
    }
    
    // Для других методов
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Ошибка в тестовом вебхуке:', error);
    return res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message,
      stack: error.stack
    });
  }
}; 