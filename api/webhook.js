// Специальный обработчик для Vercel Serverless Functions
// Этот файл отвечает за получение обновлений от Telegram

// Импортируем модуль
const bot = require('../bot');

// Экспортируем функцию-обработчик для Vercel
module.exports = (req, res) => {
  try {
    // Проверяем, что запрос метода POST
    if (req.method === 'POST') {
      // Логируем полученные данные
      console.log('Webhook получил обновление:', JSON.stringify(req.body));
      
      // Обрабатываем обновление от Telegram
      bot.processUpdate(req.body);
      
      // Отправляем успешный ответ
      res.status(200).send('OK');
    } else {
      // Для других методов возвращаем информацию о боте
      res.status(200).json({
        status: 'Bot webhook is active',
        message: 'Send POST request to use this webhook'
      });
    }
  } catch (error) {
    // Логируем ошибку
    console.error('Ошибка в обработчике вебхука:', error);
    
    // Отправляем ответ с ошибкой
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
}; 