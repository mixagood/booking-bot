const TelegramBot = require('node-telegram-bot-api');
const { token } = require('./config/config');

// Создайте экземпляр бота
const bot = new TelegramBot(token, { polling: true });

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

let timeSlots = [];
const dayStart = 8;
const dayEnd = 21;

function getTimeSlots(year, month, date) {
    timeSlots = [];

    for (let i = dayStart; i < dayEnd; i++) {

        const today = new Date(year, month, date);
        today.setHours(i);
        today.setMinutes(0);
        today.setSeconds(0);
        timeSlots.push(today);
    }
    const today = new Date(year, month, date);
    today.setHours(dayEnd);
    today.setMinutes(0);
    today.setSeconds(0);
    timeSlots.push(today)

    return timeSlots;
}

function getDatesOfCurrentMonth() {
    const dates = [];

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();

    // 0 - последний день предыдущего месяца
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for (let day = now.getDate(); day <= daysInMonth; day++) {
        dates.push(new Date(year, month, day));
    }

    return dates;
}


let reservedTime = []

const routes = {
    'displayrooms': async (chatId, userId, selectedYear, selectedMonth, selectedDate) => {

        const jsonResponse = await getMeetingRooms();
        const buttons = jsonResponse.map(item => {
            return [{
                text: item.id + " " + item.description,
                callback_data: (`selFirstTime:${item.id}:${selectedYear}:${selectedMonth}:${selectedDate}`)
            }];
        });

        const options = {
            reply_markup: {
                inline_keyboard: buttons,
            },
        };

        await bot.sendMessage(chatId, 'Выберите комнату', options);
    },
    'delbooking': async (chatId, userId, reservationId) => {

        const url = `http://127.0.0.1:8000/reservations/${reservationId}`;
        const access_token = await getAuthToken(userId);

        const response = await fetch(url,
            {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${access_token}`,
                    'Content-Type': 'application/json'
                }
            });

        if (response.ok) {
            bot.sendMessage(chatId, "Бронь удалена");

        } else {
            bot.sendMessage(chatId, "Бронь не удалена");
        }

    },
    'book': async (chatId, userId, roomId, fromReserveId, toReserveId) => {
        const access_token = await getAuthToken(userId);
        const reservation = await bookRoom(access_token, roomId, timeSlots[fromReserveId], timeSlots[toReserveId]);

        let message = "<Бронирование успешно>:\n\n";
        message += `   📍 Комната: ${reservation.meetingroom_id}\n`;
        message += `   🕒 С: ${formatDateTime(reservation.from_reserve)}\n`;
        message += `   🕒 По: ${formatDateTime(reservation.to_reserve)}\n`;
        // message += `   👤 Пользователь: ${reservation.user_id}\n`;
        // message += `   🔖 ID бронирования: ${reservation.id}\n\n`;

        bot.sendMessage(chatId, message);
    },
    // Выбор времени начала бронирования
    'selFirstTime': async (chatId, userId, roomId, selectedYear, selectedMonth, selectedDate) => {

        // get room schedule and select first date
        let reservations = await getReservationsByRoom(roomId);

        // Оставляем бронирования только на выбранную дату
        reservations = reservations.filter((res) => {

            let check = new Date(res.from_reserve);

            return (
                selectedDate == check.getDate() &&
                selectedMonth == check.getMonth() &&
                selectedYear == check.getFullYear())
        });

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
        const timeSlots = getTimeSlots(selectedYear, selectedMonth, selectedDate);
        const buttons = timeSlots.slice(0, -1).map((slot, index) => {

            let buttonText = `${slot.getHours()} - ${slot.getMinutes()} ✅`;
            let callbackData = `selSecondTime:${roomId}:${index}`;

            for (let i = 0; i < reservedTime.length; i++) {
                if (slot >= reservedTime[i].left && slot < reservedTime[i].right) {
                    // Слот недоступен
                    buttonText = buttonText.replace('✅', '⛔');
                    callbackData = 'disabled';
                    break;
                }
            }

            return {
                text: buttonText,
                callback_data: callbackData
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

        const start_index = timeSlots.findIndex(el => el.getTime() > timeSlots[firstSlotId].getTime());
        const limitTime = reservedTime.findIndex(el => el.left.getTime() > timeSlots[firstSlotId].getTime());
        const end_index = limitTime === -1 ? timeSlots.length - 1 : timeSlots.findIndex(el => el.getTime() === reservedTime[limitTime].left.getTime());

        // Возможное окончание бронирования
        const possibleEnd = timeSlots.slice(start_index, end_index + 1);

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

    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json'
        }
    });
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

    const fromFormated = `${fromReserve.getFullYear()}-${String(fromReserve.getMonth() + 1).padStart(2, '0')}-${String(fromReserve.getDate()).padStart(2, '0')}T${String(fromReserve.getHours()).padStart(2, '0')}:${String(fromReserve.getMinutes()).padStart(2, '0')}`;
    const minusMinute = new Date(toReserve);
    minusMinute.setMinutes(minusMinute.getMinutes() - 1);
    const toFormated = `${minusMinute.getFullYear()}-${String(minusMinute.getMonth() + 1).padStart(2, '0')}-${String(minusMinute.getDate()).padStart(2, '0')}T${String(minusMinute.getHours()).padStart(2, '0')}:${String(minusMinute.getMinutes()).padStart(2, '0')}`;
    const roomIdFormated = Number(roomId);

    const reqBody = {
        from_reserve: fromFormated,
        to_reserve: toFormated,
        meetingroom_id: roomIdFormated
    }

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
            console.log(JSON.stringify(errorData));
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
    // Регистрация
    const reqBody = {
        email: `${userId}@bot.tg`,
        password: "password",
        is_active: true,
        is_superuser: false,
        is_verified: true,
        first_name: "string",
        birthdate: "2000-01-01"
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
    } catch (error) {
        bot.sendMessage(chatId, error.message);
    }
});


bot.onText(/\/reserve/, async msg => {

    // Вывести возможные даты
    const chatId = msg.chat.id;
    const dates = getDatesOfCurrentMonth();

    const buttons = dates.map((date) => {
        return {
            text: `${date.getDate()}`,
            callback_data: `displayrooms:${date.getFullYear()}:${String(date.getMonth()).padStart(2, '0')}:${String(date.getDate()).padStart(2, '0')}`
        };
    })

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

    bot.sendMessage(chatId, `
                                                                                                                                                  
                                                                                                                                                                                                                                  
                                                                                                                                                                                                                                                                                                                                                                                                                                                   
    \n Выберите дату бронирования:`, options);
});



// bot.onText(/\/displayrooms/, async msg => {

//     const chatId = msg.chat.id;
//     const jsonResponse = await getMeetingRooms();

//     const buttons = jsonResponse.map(item => {
//         return [{ text: item.id + " " + item.description, callback_data: ("selFirstTime:" + item.id) }];
//     });

//     const options = {
//         reply_markup: {
//             inline_keyboard: buttons,
//         },
//     };

//     await bot.sendMessage(chatId, 'Выберите комнату', options);
// });

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
        // message += `   👤 Пользователь: ${reservation.user_id}\n`;
        // message += `   🔖 ID бронирования: ${reservation.id}\n\n`;
    });

    await bot.sendMessage(chatId, message);
});

bot.onText(/\/mybookings/, async msg => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    const access_token = await getAuthToken(userId);

    try {
        const response = await getUserReservations(access_token);

        const today = new Date();
        const activeReservations = response.filter((res) => {

            const date = new Date(res.from_reserve);
            return date.getTime() > today.getTime();
        })

        if (activeReservations.length === 0) {
            return bot.sendMessage(chatId, 'У вас нет активных бронирований.');
        }

        const buttons = activeReservations.map(res => {
            return [{
                text: `Комната: ${res.meetingroom_id} с ${(res.from_reserve).slice(11,16)} до ${(res.to_reserve).slice(11, 16)}`,
                callback_data: `delbooking:${res.id}`
            }];
        });

        const options = {
            reply_markup: {
                inline_keyboard: buttons,
            },
        };

        return bot.sendMessage(chatId, 'Нажмите на бронирование, чтобы отменить', options);

        // delbooking:

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
    // {
    //     command: "displayrooms",
    //     description: "Список аудиторий"
    // },
    {
        command: "reserve",
        description: "Начать бронирование"
    },
    {
        command: "mybookings",
        description: "Показать бронирования"
    },
]

bot.setMyCommands(commands);
