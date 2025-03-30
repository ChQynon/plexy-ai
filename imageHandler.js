const fs = require('fs');
const path = require('path');
const https = require('https');
const mime = require('mime-types');

// Директория для временных файлов
const TEMP_DIR = process.env.BOT_TEMP_DIR || './temp';

// Создаем директорию для временных файлов, если она не существует
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

/**
 * Загрузка изображения из URL и сохранение во временный файл
 * @param {string} imageUrl URL изображения
 * @returns {Promise<string>} Путь к сохраненному файлу
 */
async function downloadImage(imageUrl) {
  return new Promise((resolve, reject) => {
    // Создаем уникальное имя файла
    const fileName = path.join(TEMP_DIR, `image_${Date.now()}.jpg`);
    
    // Создаем поток для записи файла
    const fileStream = fs.createWriteStream(fileName);
    
    https.get(imageUrl, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Ошибка при скачивании изображения: ${response.statusCode}`));
        return;
      }
      
      response.pipe(fileStream);
      
      fileStream.on('finish', () => {
        fileStream.close();
        resolve(fileName);
      });
    }).on('error', (err) => {
      fs.unlink(fileName, () => {}); // Удаляем файл при ошибке
      reject(err);
    });
  });
}

/**
 * Сохранение изображения из base64 строки
 * @param {string} base64Data Base64 строка с данными изображения
 * @param {string} mimeType MIME тип изображения
 * @param {string|number} chatId ID чата для формирования имени файла
 * @returns {string} Путь к сохраненному файлу
 */
function saveBase64Image(base64Data, mimeType, chatId) {
  // Определяем расширение файла на основе MIME-типа
  let extension = 'jpg';
  if (mimeType.includes('png')) {
    extension = 'png';
  } else if (mimeType.includes('gif')) {
    extension = 'gif';
  } else if (mimeType.includes('webp')) {
    extension = 'webp';
  }
  
  // Создаем уникальное имя файла с ID чата
  const fileName = path.join(TEMP_DIR, `gen_image_${chatId}_${Date.now()}.${extension}`);
  
  // Создаем директорию для временных файлов, если она не существует
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }
  
  // Сохраняем файл
  fs.writeFileSync(fileName, Buffer.from(base64Data, 'base64'));
  
  return fileName;
}

/**
 * Удаление временного файла
 * @param {string} filePath Путь к файлу
 */
function deleteFile(filePath) {
  if (fs.existsSync(filePath)) {
    fs.unlink(filePath, (err) => {
      if (err) {
        console.error(`Ошибка при удалении файла ${filePath}:`, err);
      }
    });
  }
}

/**
 * Очистка старых временных файлов (старше 1 часа)
 * @returns {number} Количество удаленных файлов
 */
function cleanOldTempFiles() {
  try {
    if (!fs.existsSync(TEMP_DIR)) {
      return 0;
    }
    
    const files = fs.readdirSync(TEMP_DIR);
    const now = Date.now();
    let deletedCount = 0;
    
    for (const file of files) {
      const filePath = path.join(TEMP_DIR, file);
      const stats = fs.statSync(filePath);
      
      // Удаляем файлы старше 1 часа
      const fileAge = now - stats.mtimeMs;
      if (fileAge > 60 * 60 * 1000) { // 1 час в миллисекундах
        fs.unlinkSync(filePath);
        deletedCount++;
      }
    }
    
    return deletedCount;
  } catch (error) {
    console.error('Ошибка при очистке временных файлов:', error);
    return 0;
  }
}

// Экспорт функций
module.exports = {
  downloadImage,
  saveBase64Image,
  deleteFile,
  cleanOldTempFiles
}; 