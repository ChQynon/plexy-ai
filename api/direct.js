// Простейший вебхук с жестко закодированным токеном
const https = require('https');

// Жестко закодированный токен (для тестирования)
const TELEGRAM_TOKEN = '8178608724:AAHZP8zTEXvmxkfQ1J3iyR0IVEfiv_l_548';

module.exports = async (req, res) => {
  try {
    // Логируем запуск
    console.log('Прямой вебхук запущен, метод:', req.method);
    
    // GET запрос для проверки
    if (req.method === 'GET') {
      return res.status(200).json({
        status: 'OK',
        message: 'Прямой вебхук работает',
        token_present: !!TELEGRAM_TOKEN
      });
    }
    
    // Обрабатываем только POST запросы от Telegram
    if (req.method === 'POST') {
      const update = req.body;
      console.log('Получено обновление:', JSON.stringify(update || {}).substring(0, 200));
      
      // Базовая проверка на наличие сообщения
      if (update && update.message && update.message.chat && update.message.chat.id) {
        const chatId = update.message.chat.id;
        console.log('ID чата:', chatId);
        
        // Формируем данные для запроса
        const data = JSON.stringify({
          chat_id: chatId,
          text: 'Привет! Это тестовый ответ от сервера.'
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
          console.log('Статус ответа:', response.statusCode);
          let responseData = '';
          
          response.on('data', (chunk) => {
            responseData += chunk;
          });
          
          response.on('end', () => {
            console.log('Ответ от Telegram API:', responseData);
          });
        });
        
        request.on('error', (error) => {
          console.error('Ошибка запроса:', error.message);
        });
        
        // Отправляем данные
        request.write(data);
        request.end();
        
        console.log('Запрос отправлен');
      } else {
        console.log('Обновление не содержит сообщения или chatId');
      }
      
      // Отвечаем Telegram успешным статусом
      return res.status(200).json({ ok: true });
    }
    
    // Для других методов
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Ошибка в прямом вебхуке:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message,
      stack: error.stack
    });
  }
}; 