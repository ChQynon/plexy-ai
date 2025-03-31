// Простой индексный файл для корневого URL
const http = require('http');

// Создаем HTTP сервер
const server = http.createServer((req, res) => {
  console.log('Получен запрос:', req.method, req.url);
  
  // Устанавливаем заголовки
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  
  // Отправляем HTML ответ
  res.end(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Plexy Bot</title>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body {
          font-family: Arial, sans-serif;
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
          margin: 0;
          background-color: #f5f5f5;
        }
        .container {
          text-align: center;
          padding: 2rem;
          background-color: white;
          border-radius: 8px;
          box-shadow: 0 4px 8px rgba(0,0,0,0.1);
        }
        h1 {
          color: #333;
        }
        p {
          color: #666;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Plexy Bot</h1>
        <p>Телеграм бот на основе нейросети.</p>
        <p>Вебхук API находится по адресу: <a href="/api/webhook">/api/webhook</a></p>
      </div>
    </body>
    </html>
  `);
});

// Только если запускаем напрямую, а не через Vercel
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
  });
}

// Для Vercel
module.exports = (req, res) => {
  server.emit('request', req, res);
};
