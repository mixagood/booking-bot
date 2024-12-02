const TelegramBot = require('node-telegram-bot-api');
const { token } = require('./config/config');

// Создайте экземпляр бота
const bot = new TelegramBot(token, { polling: true });

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const timeSlots = [];
const dayStart = 8;
const dayEnd = 21;

for (let i = dayStart; i < dayEnd; i++) {

    // "2022-12-17T20:38:00"

    // let full = `${i}-00`.padStart(5, '0');
    // let half = `${i}-30`.padStart(5, '0');

    const today = new Date();
    today.setHours(i);
    today.setMinutes(0);
    today.setSeconds(0);

    timeSlots.push(today);
}

let reservedTime = []

const routes = {
    'book': async (chatId, userId, roomId, fromReserveId, toReserveId) => {
        const access_token = await getAuthToken(userId);
        console.log(access_token);
        const reservation = await bookRoom(access_token, roomId, timeSlots[fromReserveId], timeSlots[toReserveId]);

        let message = "<Бронирование успешно>:\n\n";
        message += `   📍 Комната: ${reservation.meetingroom_id}\n`;
        message += `   🕒 С: ${formatDateTime(reservation.from_reserve)}\n`;
        message += `   🕒 По: ${formatDateTime(reservation.to_reserve)}\n`;
        message += `   👤 Пользователь: ${reservation.user_id}\n`;
        message += `   🔖 ID бронирования: ${reservation.id}\n\n`;

        bot.sendMessage(chatId, message);
    },
    // Выбор времени начала бронирования
    'selFirstTime': async (chatId, userId, roomId) => {

        // get room schedule and select first date
        const reservations = await getReservationsByRoom(roomId);

        reservedTime = []

        reservations.forEach((reservation, index) => {

            const _left = new Date(reservation.from_reserve);
            const _right = new Date(reservation.to_reserve);

            // Проверяем, что дата корректная
            if (isNaN(_left.getTime()) || isNaN(_right.getTime())) {
                console.error(`Некорректная дата: ${reservation.from_reserve} - ${reservation.to_reserve}`);
                return; // Пропускаем эту запись, если дата некорректна
            }

            reservedTime.push({ left: _left, right: _right });
        });

        // Сортируем по времени начала (left)
        reservedTime.sort((a, b) => a.left - b.left);

        // Преобразуем timeSlots в кнопки
        // Нужно передавать индексы, а не Date()
        const buttons = timeSlots.map((slot, index) => {

            let buttonText = `${slot.getHours()} - ${slot.getMinutes()} ✅`;

            for (let i = 0; i < reservedTime.length; i++) {

                if (slot >= reservedTime[i].left && slot < reservedTime[i].right) {
                    // Слот недоступен
                    buttonText = buttonText.replace('✅', '⛔');
                    break;
                }
            }

            console.log(`selSecondTime:${roomId}:${index}`)

            return {
                text: buttonText,
                callback_data: `selSecondTime:${roomId}:${index}`
            }

        });

        // Группируем кнопки по 3 в ряд
        const groupedButtons = [];
        for (let i = 0; i < buttons.length; i += 4) {
            groupedButtons.push(buttons.slice(i, i + 4));
        }

        // Опции с разметкой для Telegram
        const options = {
            reply_markup: {
                inline_keyboard: groupedButtons,
            },
        };

        bot.sendMessage(chatId, `Бронирование комнаты ${roomId}

                                                                                                                                              
                                                                                                                                                                                                                              
                                                                                                                                                                                                                              
            \n ✅ - время свободно\n⛔ - время занято                                                                                                                                                                                                                  
            \n Выберите время начала:`, options);

    },
    // Выбор времени конца бронирования
    'selSecondTime': async (chatId, userId, roomId, firstSlotId) => {

        // const buttons = [];

        const start_index = timeSlots.findIndex(el => el.getTime() > timeSlots[firstSlotId].getTime());
        const limitTime = reservedTime.findIndex(el => el.left.getTime() > timeSlots[firstSlotId].getTime());
        console.log(limitTime);

        const end_index = limitTime == 0 ? timeSlots.length - 1 : timeSlots.findIndex(el => el.getTime() === limitTime.left.getTime());

        console.log(`Между ${start_index} and ${end_index}`);

        // Возможное окончание бронирования
        const possibleEnd = timeSlots.slice(start_index, end_index);

        // Кнопки
        const buttons = possibleEnd.map((secondSlot, index) => {

            const buttonText = `${secondSlot.getHours()} - ${secondSlot.getMinutes()} ✅`;

            return {
                text: buttonText,
                callback_data: `book:${roomId}:${firstSlotId}:${timeSlots.findIndex(el => el.getTime() === secondSlot.getTime())}` // Другой индекс
            }

        });

        // Группируем кнопки по 3 в ряд
        const groupedButtons = [];
        for (let i = 0; i < buttons.length; i += 4) {
            groupedButtons.push(buttons.slice(i, i + 4));
        }

        // Опции с разметкой для Telegram
        const options = {
            reply_markup: {
                inline_keyboard: groupedButtons,
            },
        };

        bot.sendMessage(chatId, `Бронирование комнаты ${roomId}

            \n Выберите время окончания:`, options);
    }
}

// Auth
async function getAuthToken(userId) {

    console.log(userId);

    try {
        const formData = new URLSearchParams();
        formData.append('grant_type', 'password');
        formData.append('username', `${userId}@bot.tg`);
        formData.append('password', 'password');

        const response = await fetch('http://127.0.0.1:8000/auth/jwt/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: formData.toString()
        });

        if (response.ok) {
            const data = await response.json();
            return data.access_token;
        } else {
            console.error('Ошибка аутентификации:', response);
            return null;
        }
    } catch (error) {
        console.error('Ошибка при получении токена аутентификации:', error);
        return null;
    }
}

async function getReservationsByRoom(roomId) {

    const url = `http://127.0.0.1:8000/meeting_rooms/${roomId}/reservations`;
    console.log(url);

    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json'
        }
    });
    console.log(response)
    const jsonResponse = await response.json();

    return jsonResponse;
}

// Занятые комнаты
async function getReservations(access_token) {

    const response = await fetch('http://127.0.0.1:8000/reservations', {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${access_token}`,
            'Content-Type': 'application/json'
        }
    });

    const jsonResponse = await response.json();

    return jsonResponse;
}

// Получить бронирования пользователя
async function getUserReservations(access_token) {

    const response = await fetch('http://127.0.0.1:8000/reservations/my_reservations', {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${access_token}`,
            'Content-Type': 'application/json'
        }
    });

    const jsonResponse = await response.json();

    return jsonResponse;
}

// 
async function getMeetingRooms(access_token) {

    const response = await fetch('http://127.0.0.1:8000/meeting_rooms', {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${access_token}`,
            'Content-Type': 'application/json'
        }
    });

    const jsonResponse = await response.json();

    return jsonResponse;
}

async function bookRoom(access_token, roomId, fromReserve, toReserve) {

    console.log('Дошли до bookRoom!!!')

    const fromFormated = `${fromReserve.getFullYear()}-${String(fromReserve.getMonth() + 1).padStart(2, '0')}-${String(fromReserve.getDate()).padStart(2, '0')}T${String(fromReserve.getHours()).padStart(2, '0')}:${String(fromReserve.getMinutes()).padStart(2, '0')}`;
    const toFormated = `${toReserve.getFullYear()}-${String(toReserve.getMonth() + 1).padStart(2, '0')}-${String(toReserve.getDate()).padStart(2, '0')}T${String(toReserve.getHours()).padStart(2, '0')}:${String(toReserve.getMinutes()).padStart(2, '0')}`;
    
    //  Date to ---

    // let [hours_from, minutes_from] = fromReserve.split('-');
    // let [hours_to, minutes_to] = toReserve.split('-');

    // let fromFormated = `2024-12-24T${hours_from}:${minutes_from}`;
    // let toFormated = `2024-12-24T${hours_to}:${minutes_to}`;

    console.log(fromFormated);
    console.log(toFormated);

    const reqBody = {
        meetingroom_id: roomId,
        from_reserve: fromFormated,
        to_reserve: toFormated
    }

    console.log(reqBody);

    try {
        const response = await fetch('http://127.0.0.1:8000/reservations/', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${access_token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(reqBody)
        });

        if (!response.ok) {
            const errorData = await response.json(); // Чтение данных об ошибке
            throw new Error(`Ошибка ${response.status}: ${errorData.message || response.statusText}`);
        }

        return await response.json();

    } catch (error) {
        console.error("Ошибка при бронировании комнаты:", error.message);
        throw error; // Пробрасываем ошибку дальше для обработки
    }
}

// async function deleteUser(userId) {

//     const url = `http://127.0.0.1:8000/delete${userId}`

//     try {
//         const response = await fetch(url, {
//             method: 'DELETE',
//             headers: {
//                 'Content-Type': 'application/json',
//             },
//         });

//         if (!response.ok) {
//             const errorData = await response.json(); // Чтение данных об ошибке
//             throw new Error(`Ошибка ${response.status}: ${errorData.message || response.statusText}`);
//         }
//         return await response.json();

//     } catch (error) {
//         console.error("Ошибка при регистрации:", error.message);
//         throw error; // Пробрасываем ошибку дальше для обработки
//     }
// }

async function registerUser(userId) {

    console.log(`user id: ${userId}`);

    // Регистрация
    const reqBody = {
        email: `${userId}@bot.tg`,
        password: "password",
        is_active: true,
        is_superuser: false,
        is_verified: false,
        first_name: "string",
        birthdate: "2024-11-28"
    }

    const url = 'http://127.0.0.1:8000/auth/register/';

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(reqBody)
        });

        if (!response.ok) {
            const errorData = await response.json(); // Чтение данных об ошибке
            throw new Error(`Ошибка ${response.status}: ${errorData.message || response.statusText}`);
        }

        return await response.json();

    } catch (error) {
        console.error("Ошибка при регистрации:", error.message);
        throw error; // Пробрасываем ошибку дальше для обработки
    }
}

// Команда /start
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    try {
        const jsonResponse = await registerUser(userId);
        console.log(jsonResponse)

    } catch (error) {
        bot.sendMessage(chatId, error.message);
    }
});

bot.onText(/\/displayrooms/, async msg => {

    const chatId = msg.chat.id;
    const jsonResponse = await getMeetingRooms();

    const buttons = jsonResponse.map(item => {
        return [{ text: item.id + " " + item.description, callback_data: ("selFirstTime:" + item.id) }];
    });

    const options = {
        reply_markup: {
            inline_keyboard: buttons,
        },
    };

    await bot.sendMessage(chatId, 'Выберите комнату', options);
});

// Нажатие inline кнопок
bot.on('callback_query', (callbackQuery) => {

    const chatId = callbackQuery.message.chat.id;
    const userId = callbackQuery.from.id;
    const data = callbackQuery.data;

    const arr = data.split(':');
    const [route, ...rest] = arr;

    try {
        if (routes[route]) {
            routes[route](chatId, userId, ...rest);
        } else {
            bot.sendMessage(chatId, 'Неизвестная команда');
        }
    } catch (error) {
        bot.sendMessage(chatId, 'Что-то пошло не так');
    }

    bot.answerCallbackQuery(callbackQuery.id);
})

// Функция для форматирования даты и времени для вывода
function formatDateTime(dateTimeString) {
    const date = new Date(dateTimeString);
    const options = {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    };
    return date.toLocaleString('ru-RU', options); // Форматируем дату и время
}

bot.onText(/\/reservations/, async (msg) => {

    const chatId = msg.chat.id;
    const userId = msg.from.id;

    const token = await getAuthToken(userId);
    const reservations = await getReservations(token);

    let message = "Список бронирований:\n\n";
    reservations.forEach((reservation, index) => {
        message += `📅 Бронирование #${index + 1}\n`;
        message += `   📍 Комната: ${reservation.meetingroom_id}\n`;
        message += `   🕒 С: ${formatDateTime(reservation.from_reserve)}\n`;
        message += `   🕒 По: ${formatDateTime(reservation.to_reserve)}\n`;
        message += `   👤 Пользователь: ${reservation.user_id}\n`;
        message += `   🔖 ID бронирования: ${reservation.id}\n\n`;
    });

    // const jsonString = JSON.stringify(reservations);

    await bot.sendMessage(chatId, message);
});

bot.onText(/\/mybookings/, async msg => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    const access_token = await getAuthToken(userId);
    console.log(access_token);

    try {
        const response = await getUserReservations(access_token);

        const formattedMessage = response.map(item =>
            `ID: ${item.id}\nКомната: ${item.meetingroom_id}\nС: ${item.from_reserve}\nДо: ${item.to_reserve}`
        ).join("\n\n");

        console.log(response);

        bot.sendMessage(chatId, formattedMessage);

    } catch (error) {
        bot.sendMessage(chatId, error);
    }

});

// Error
bot.on("polling_error", err => console.log(err.data.error.message));


process.on('uncaughtException', (err) => {
    console.error('Необработанная ошибка:', err);
    // Можно сохранить лог ошибки
});


// Menu
const commands = [
    {
        command: "start",
        description: "Запуск бота"
    },
    {
        command: "displayrooms",
        description: "Список аудиторий"
    },
    {
        command: "mybookings",
        description: "Показать бронирования"
    },
]

bot.setMyCommands(commands);
