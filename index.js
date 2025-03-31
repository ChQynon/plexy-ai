// Базовый файл index.js для главной страницы
const express = require('express');
const path = require('path');
const app = express();

// Статические файлы
app.use(express.static(path.join(__dirname, 'public')));

// Главная страница
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="ru">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Plexy AI - Telegram Бот</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
        }
        h1 {
          color: #1e88e5;
        }
        .container {
          background-color: #f5f5f5;
          border-radius: 8px;
          padding: 20px;
          margin-top: 20px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        a {
          color: #1e88e5;
          text-decoration: none;
        }
        a:hover {
          text-decoration: underline;
        }
        .badge {
          background-color: #4caf50;
          color: white;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 12px;
          margin-left: 8px;
        }
      </style>
    </head>
    <body>
      <h1>Plexy AI - Telegram Бот</h1>
      
      <div class="container">
        <h2>Состояние: <span class="badge">Онлайн</span></h2>
        <p>API бота работает. Вебхук настроен и готов принимать обновления от Telegram.</p>
        <p>Чтобы начать использовать бота, просто найдите его в Telegram и отправьте сообщение.</p>
        <p><a href="https://t.me/your_bot_username" target="_blank">Открыть бота в Telegram</a></p>
      </div>
      
      <div class="container">
        <h2>Функции бота</h2>
        <ul>
          <li>Генерация текста и ответы на вопросы</li>
          <li>Анализ изображений</li>
          <li>Создание изображений</li>
          <li>Различные модели для разных задач</li>
        </ul>
      </div>
      
      <div class="container">
        <h2>Команды</h2>
        <ul>
          <li><strong>/start</strong> - Начать взаимодействие с ботом</li>
          <li><strong>/help</strong> - Показать справку</li>
          <li><strong>/models</strong> - Показать доступные модели</li>
          <li><strong>/setmodel</strong> - Выбрать модель</li>
          <li><strong>/reset</strong> - Сбросить историю чата</li>
          <li><strong>/about</strong> - Информация о боте</li>
        </ul>
      </div>
      
      <footer style="margin-top: 40px; text-align: center; color: #666;">
        <p>Plexy AI © 2023-2024 | Разработчик: Plexy Lab | Владелец: @qynon</p>
      </footer>
    </body>
    </html>
  `);
});

// Route для проверки API
app.get('/api', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Plexy AI API работает',
    version: '1.1.1'
  });
});

// Обработка запросов для API (вебхук обрабатывается в api/webhook.js)
app.use('/api/webhook', require('./api/webhook'));

// Порт для локального запуска
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});

// Экспорт для Vercel
module.exports = app;
