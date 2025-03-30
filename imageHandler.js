const fs = require('fs');
const path = require('path');
const axios = require('axios');
const mime = require('mime-types');

// Получаем путь к директории для временных файлов из переменных окружения или используем значение по умолчанию
const tempDir = process.env.BOT_TEMP_DIR ? 
  path.resolve(process.env.BOT_TEMP_DIR) : 
  path.join(__dirname, 'temp');

// Создаем директорию для временных файлов, если она не существует
if (!fs.existsSync(tempDir)) {
  try {
    fs.mkdirSync(tempDir, { recursive: true });
    console.log(`Создана директория для временных файлов: ${tempDir}`);
  } catch (error) {
    console.error('Ошибка при создании директории для временных файлов:', error);
    throw new Error('Не удалось создать директорию для временных файлов');
  }
}

/**
 * Загрузка изображения из URL и сохранение во временный файл
 * @param {string} imageUrl URL изображения
 * @returns {Promise<string>} Путь к сохраненному файлу
 */
async function downloadImage(imageUrl) {
  try {
    const response = await axios({
      method: 'GET',
      url: imageUrl,
      responseType: 'arraybuffer',
      timeout: 30000, // Таймаут в 30 секунд
      headers: {
        'User-Agent': 'Plexy-Bot/1.0'
      }
    });
    
    const contentType = response.headers['content-type'];
    const extension = mime.extension(contentType) || 'jpg'; // Используем jpg если не удалось определить
    const filename = path.join(tempDir, `downloaded_${Date.now()}.${extension}`);
    
    fs.writeFileSync(filename, response.data);
    
    return filename;
  } catch (error) {
    console.error('Ошибка при загрузке изображения:', error.message);
    throw error;
  }
}

/**
 * Сохранение изображения из base64 строки
 * @param {string} base64Data Base64 строка с данными изображения
 * @param {string} mimeType MIME тип изображения
 * @param {string|number} chatId ID чата для формирования имени файла
 * @returns {string} Путь к сохраненному файлу
 */
function saveBase64Image(base64Data, mimeType, chatId) {
  try {
    const extension = mime.extension(mimeType) || 'jpg'; // Используем jpg если не удалось определить
    const filename = path.join(tempDir, `output_${chatId}_${Date.now()}.${extension}`);
    
    fs.writeFileSync(filename, Buffer.from(base64Data, 'base64'));
    
    return filename;
  } catch (error) {
    console.error('Ошибка при сохранении изображения:', error.message);
    throw error;
  }
}

/**
 * Удаление временного файла
 * @param {string} filePath Путь к файлу
 */
function deleteFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.error('Ошибка при удалении файла:', error.message, filePath);
  }
}

/**
 * Очистка всех временных файлов
 * @returns {number} Количество удаленных файлов
 */
function cleanTempFiles() {
  try {
    if (!fs.existsSync(tempDir)) {
      return 0;
    }

    const files = fs.readdirSync(tempDir);
    let count = 0;

    files.forEach(file => {
      const filePath = path.join(tempDir, file);
      // Проверяем, что это файл, а не директория
      if (fs.statSync(filePath).isFile()) {
        try {
          fs.unlinkSync(filePath);
          count++;
        } catch (err) {
          console.error(`Ошибка при удалении файла ${filePath}:`, err.message);
        }
      }
    });

    return count;
  } catch (error) {
    console.error('Ошибка при очистке временных файлов:', error.message);
    return 0;
  }
}

/**
 * Очистка старых временных файлов (старше определенного времени)
 * @param {number} maxAgeMs Максимальный возраст файлов в миллисекундах (по умолчанию 1 час)
 * @returns {number} Количество удаленных файлов
 */
function cleanOldTempFiles(maxAgeMs = 3600000) {
  try {
    if (!fs.existsSync(tempDir)) {
      return 0;
    }

    const files = fs.readdirSync(tempDir);
    const now = Date.now();
    let count = 0;

    files.forEach(file => {
      const filePath = path.join(tempDir, file);
      // Проверяем, что это файл, а не директория
      if (fs.statSync(filePath).isFile()) {
        const stats = fs.statSync(filePath);
        const fileAge = now - stats.mtimeMs;
        
        if (fileAge > maxAgeMs) {
          try {
            fs.unlinkSync(filePath);
            count++;
          } catch (err) {
            console.error(`Ошибка при удалении файла ${filePath}:`, err.message);
          }
        }
      }
    });

    return count;
  } catch (error) {
    console.error('Ошибка при очистке старых временных файлов:', error.message);
    return 0;
  }
}

// Экспорт функций
module.exports = {
  downloadImage,
  saveBase64Image,
  deleteFile,
  cleanTempFiles,
  cleanOldTempFiles,
  tempDir
}; 