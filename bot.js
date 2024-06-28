require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const token = process.env.TOKEN;
const mongoUri = process.env.MONGODB_URI;
const allowedUserIds = process.env.ALLOWED_USER_IDS.split(',').map(id => id.trim());

const bot = new TelegramBot(token, { polling: true });

const managerId = '827127631';  // заміни на реальний Telegram ID менеджера
const managerContact = '@vaysed_manager';  // заміни на реальний контакт менеджера

mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.error('MongoDB connection error:', err));

const fileSchema = new mongoose.Schema({
    userId: String,
    text: String,
    textPath: String
});

const File = mongoose.model('File', fileSchema);

bot.onText(/\/start/, async (msg) => {
    const userId = msg.chat.id;

    try {
        const file = await File.findOne({ userId: userId.toString() });

        if (file) {
            await bot.sendMessage(userId, `📸 Фотозвіт знайдено! Переглянути його можна за посиланням нижче.\n${file.text}`);
            if (file.textPath && fs.existsSync(file.textPath)) {
                const textContent = fs.readFileSync(file.textPath, 'utf-8');
                await bot.sendMessage(userId, textContent);
                sendSurvey(userId);
            } else {
                sendSurvey(userId);
            }
        } else {
            await bot.sendMessage(userId, '☹️ Фотозвіт не знайдено, спробуйте пізніше.');
        }
    } catch (err) {
        console.error(err);
        await bot.sendMessage(userId, '☹️ Сталася помилка, спробуйте пізніше.');
    }
});

function sendSurvey(chatId) {
    const options = {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '✅ Так', callback_data: 'yes' },
                    { text: '❌ Ні', callback_data: 'no' },
                ],
                [
                    { text: '❔ Обговорити з менеджером', callback_data: 'contact_manager' }
                ]
            ]
        }
    };
    bot.sendMessage(chatId, '🤗 Товар підійшов? Можна продовжити доставку?', options);
}

bot.on('callback_query', async (callbackQuery) => {
    const message = callbackQuery.message;
    const data = callbackQuery.data;
    const username = callbackQuery.from.username ? `@${callbackQuery.from.username}` : 'клієнт';

    try {
        if (data === 'yes') {
            await bot.sendMessage(managerId, `${username} повідомив(ла), що товар підійшов. Потрібно продовжити доставку та оголосити клієнту ціну за неї.`);
            await bot.sendMessage(message.chat.id, '💕 Дякуємо за вашу відповідь! Ми передамо вашу інформацію менеджеру.');
        } else if (data === 'no') {
            await bot.sendMessage(managerId, `${username} повідомив(ла), що товар не підійшов. Потрібно замовити зворотню та повернути клієнту гроші.`);
            await bot.sendMessage(message.chat.id, '💕 Дякуємо за вашу відповідь! Ми передамо вашу інформацію менеджеру.');
        } else if (data === 'contact_manager') {
            await bot.sendMessage(managerId, `${username} хоче обговорити деталі фотозвіту.`);
            await bot.sendMessage(message.chat.id, `🌝 Будь ласка, зв'яжіться з нашим менеджером: ${managerContact}`);
        }

        // Delete the original survey message
        await bot.deleteMessage(message.chat.id, message.message_id);
        
        bot.answerCallbackQuery(callbackQuery.id);
    } catch (err) {
        console.error('Error handling callback query:', err);
    }
});

async function addNewFile(userId, text) {
    const textPath = path.join(__dirname, 'texts', `${userId}.txt`);
    fs.writeFileSync(textPath, text, 'utf-8');

    const newFile = new File({ userId: userId.toString(), text, textPath });

    try {
        await newFile.save();
        console.log('New file added to database');
    } catch (err) {
        console.error('Error saving file to database:', err);
    }
}

// Обробник для команди /addfile
bot.onText(/\/addfile (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;

    if (!allowedUserIds.includes(chatId.toString())) {
        await bot.sendMessage(chatId, 'У вас немає прав для використання цієї команди.');
        return;
    }

    const args = match[1].split('|');
    if (args.length !== 2) {
        await bot.sendMessage(chatId, 'Неправильний формат команди. Використовуйте: /addfile userId|text');
        return;
    }

    const [userId, text] = args;
    try {
        await addNewFile(userId.trim(), text.trim());
        await bot.sendMessage(chatId, 'Новий файл успішно додано!');
    } catch (err) {
        console.error('Error adding new file:', err);
        await bot.sendMessage(chatId, 'Під час додавання нового файлу сталася помилка.');
    }
});

bot.on("polling_error", (err) => console.log(err));

console.log('Bot started');
