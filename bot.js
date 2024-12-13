const TelegramBot = require('node-telegram-bot-api');

require('dotenv').config();

const { getAuthToken,  getReservationsByRoom, getUserReservations, 
    getReservations, getMeetingRooms, bookRoom, registerUser, deleteReservation} = require('./api/api')

const {getCachedDatesOfCurrentMonth, getCachedTimeslotsCurMonth, groupButtons} = require('./utils/utils')

const token = process.env.BOT_TOKEN;

// Создайте экземпляр бота
const bot = new TelegramBot(token, { polling: true });

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const userStates = {}; // Хранилище состояний пользователей

async function initUserState(userId) {
    userStates[userId] = {
        prevState: '',
        roomId : undefined,
        selectedYear : undefined, 
        selectedMonth : undefined, 
        selectedDate : undefined,
        firstSlotId : undefined,
        secondSlotId : undefined
    }
}


let reservedTime = []

const routes = {
    'displayrooms': async (chatId, userId, selectedYear, selectedMonth, selectedDate) => {

        userStates[userId].selectedYear = selectedYear;
        userStates[userId].selectedMonth = selectedMonth;
        userStates[userId].selectedDate = selectedDate;

        console.log(userStates[userId])

        const jsonResponse = await getMeetingRooms();

        console.log(jsonResponse);

        const buttons = jsonResponse.map(item => {

            return {
                text: `${item.id} - ${item.description}`,
                callback_data: (`selFirstTime:${item.id}`)
            };
        });

        const options = groupButtons(buttons, 2);

        await bot.sendMessage(chatId, 'Выберите комнату', options);
    },
    'delbooking': async (chatId, userId, reservationId) => {
        console.log(userStates[userId])

        const access_token = await getAuthToken(userId);
        const response = deleteReservation(chatId, reservationId, access_token);

        if (response.ok) {
            bot.sendMessage(chatId, "Бронь удалена");
    
        } else {
            bot.sendMessage(chatId, "Бронь не удалена");
        }

    },
    'book': async (chatId, userId, toReserveId) => {

        userStates[userId].secondSlotId = toReserveId;

        console.log(userStates[userId])

        const date = userStates[userId].selectedDate
        const roomId = userStates[userId].roomId
        const startId = userStates[userId].firstSlotId;
        const endId = userStates[userId].secondSlotId;

        const daySlots = getCachedTimeslotsCurMonth()[date];
        const fromReserve = daySlots[startId];
        const toReserve = daySlots[endId];

        const access_token = await getAuthToken(userId);

        console.log(daySlots)
        console.log(toReserve);
        console.log(fromReserve);

        const reservation = await bookRoom(access_token, roomId, fromReserve, toReserve);

        let message = "<Бронирование успешно>:\n\n";
        message += `   📍 Комната: ${reservation.meetingroom_id}\n`;
        message += `   🕒 С: ${formatDateTime(reservation.from_reserve)}\n`;
        message += `   🕒 По: ${formatDateTime(reservation.to_reserve)}\n`;

        bot.sendMessage(chatId, message);
    },

    // Выбор времени начала бронирования
    'selFirstTime': async (chatId, userId, roomId) => {

        userStates[userId].roomId = roomId;

        console.log(userStates[userId])

        // get room schedule and select first date
        let reservations = await getReservationsByRoom(roomId);

        // Оставляем бронирования только на выбранную дату
        reservations = reservations.filter((res) => {
            let check = new Date(res.from_reserve);
            return (
                userStates[userId].selectedDate == check.getDate() &&
                userStates[userId].selectedMonth == check.getMonth() &&
                userStates[userId].selectedYear == check.getFullYear())
        });

        reservedTime = [];

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

        // Не будет работать, надо за день
        // Берем временные слоты за конкретный день
        const timeSlots = getCachedTimeslotsCurMonth()[userStates[userId].selectedDate];

        const buttons = timeSlots.slice(0, -1).map((slot, index) => {

            let buttonText = `${slot.getHours()} - ${slot.getMinutes()} ✅`;
            let callbackData = `selSecondTime:${index}`;

            for (let i = 0; i < reservedTime.length; i++) {
                if ((slot >= reservedTime[i].left && slot < reservedTime[i].right) || 
            slot < Date.now()) {
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

        const options = groupButtons(buttons, 4);

        bot.sendMessage(chatId, `Бронирование комнаты ${roomId}

                                                                                                                                              
                                                                                                                                                                                                                              
                                                                                                                                                                                                                              
            \n ✅ - время свободно\n⛔ - время занято                                                                                                                                                                                                                  
            \n Выберите время начала:`, options);

    },
    // Выбор времени конца бронирования
    'selSecondTime': async (chatId, userId, firstSlotId) => {

        userStates[userId].firstSlotId = firstSlotId;

        console.log(userStates[userId]);

        const timeSlots = getCachedTimeslotsCurMonth()[userStates[userId].selectedDate];

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
                callback_data: `book:${timeSlots.findIndex(el => el.getTime() === secondSlot.getTime())}` // Другой индекс
            }
        });

        const options = groupButtons(buttons, 4);

        bot.sendMessage(chatId, `Бронирование комнаты ${userStates[userId].roomId}
                                                                              
                                                                                                                                                                               
                                                                                                                                                                                                                              
                                                                                                                                                                                                                              
                                                                    
                                                                                          
            \n Выберите время окончания:`, options);
    }
}


// Команда /start
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    try {
        const jsonResponse = await registerUser(userId);
        console.log("Работа с ботом успешно начата");
    } catch (error) {
        bot.sendMessage(chatId, error.message);
    }
});

bot.onText(/\/reserve/, async msg => {

    // Вывести возможные даты
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    const dates = getCachedDatesOfCurrentMonth();

    initUserState(userId);
    console.log(userStates[userId]);

    const buttons = dates.map((date) => {
        return {
            text: `${date.getDate()}`,
            callback_data: `displayrooms:${date.getFullYear()}:${String(date.getMonth()).padStart(2, '0')}:${String(date.getDate()).padStart(2, '0')}`
        };
    })

    const options = groupButtons(buttons, 4);

    bot.sendMessage(chatId, `
                                                                                                                                                  
                                                                                                                                                                                                                                  
                                                                                                                                                                                                                                                                                                                                                                                                                                                   
    \n Выберите дату бронирования:`, options);
});

// Нажатие inline кнопок
bot.on('callback_query', (callbackQuery) => {

    const chatId = callbackQuery.message.chat.id;
    const userId = callbackQuery.from.id;
    const data = callbackQuery.data;
    const messageId = callbackQuery.message.message_id;
    bot.deleteMessage(chatId, messageId);

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

bot.onText(/\/mybookings/, async msg => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    const access_token = await getAuthToken(userId);

    try {
        const response = await getUserReservations(access_token);

        console.log(response);

        const today = new Date();
        const activeReservations = response.filter((res) => {
            const date = new Date(res.from_reserve);
            return date.getTime() > today.getTime();
        })

        if (activeReservations.length === 0) {
            return bot.sendMessage(chatId, 'У вас нет активных бронирований.');
        } else {

            const buttons = activeReservations.map(res => {
                return [{
                    text: `${res.meeting_room_name} с ${(res.from_reserve).slice(11,16)} до ${(res.to_reserve).slice(11, 16)}`,
                    callback_data: `delbooking:${res.id}`
                }];
            });

            const options = {
                reply_markup: {
                    inline_keyboard: buttons,
                },
            };

            return bot.sendMessage(chatId, 'Нажмите на бронирование, чтобы отменить', options);
    }

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
        command: "reserve",
        description: "Начать бронирование"
    },
    {
        command: "mybookings",
        description: "Показать бронирования"
    },
]

bot.setMyCommands(commands);
