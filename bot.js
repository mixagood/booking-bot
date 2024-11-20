const TelegramBot = require('node-telegram-bot-api');

// Вставьте свой токен, который вы получите у BotFather
const token = '7735930269:AAFmKgdc-JlyN_I-yL9hR7N1TgCi3ZyOljY';

// Создайте экземпляр бота
const bot = new TelegramBot(token, { polling: true });

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const routes = {
    'room:bookroom': (chatId) => {
        bot.sendMessage(chatId, 'Бронирование комнаты')
    },
    'room': (chatId) => {
        bot.sendMessage(chatId, 'Расписание комнаты')
    }
}

const timeSlots = [];
for (let i = 8; i < 21; i++) {
    timeSlots.push(i.toString() + "-00");
    timeSlots.push(i.toString() + "-30");
}


// Auth
async function getAuthToken() {
    try {
        const formData = new URLSearchParams();
        formData.append('grant_type', 'password');
        formData.append('username', 'example@email.com');
        formData.append('password', '1234567890');

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
            console.error('Ошибка аутентификации:', response.detail);
            return null;
        }
    } catch (error) {
        console.error('Ошибка при получении токена аутентификации:', error);
        return null;
    }
}

// Занятые комнаты
async function getReservations(token) {
    
    const response = await fetch('http://127.0.0.1:8000/reservations', {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    });

    const jsonResponse = await response.json();

    return jsonResponse;
}

async function getMeetingRooms(token) {
    
    const response = await fetch('http://127.0.0.1:8000/meeting_rooms', {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    });

    const jsonResponse = await response.json();

    return jsonResponse;
}


async function bookRoom(token, roomId, fromReserve, toReserve) {

    const reqBody = {
        room_id : roomId,
        from_reserve : fromReserve,
        to_reserve : toReserve
    }

    try {
    const response = await fetch('http://127.0.0.1:8000/reservations/', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
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


async function getRooms() {

    // const response = await fetch('http://127.0.0.1:8000/meeting_rooms/');
    const jsonResponse = await getMeetingRooms();
    // jsonResponse = [{"id":1, "descr": "205"}, {"id":2, "descr":"206"}, {"id":3, "descr":"207"}, {"id":4, "descr":"208"}]
    return jsonResponse;
}

// Команда /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 'Привет! Я бот для бронирования встреч в больнице 24!');
});

bot.onText(/\/roomlist/, async msg => {

    const chatId = msg.chat.id;
    
    const jsonResponse = await getRooms();

    const buttons = jsonResponse.map(item => {
        return [{text: item.id + " " + item.description, callback_data: ("room:" + item.id)}];
    });

    const options = {
        reply_markup: {
            inline_keyboard: buttons,
        },
    };

    await bot.sendMessage(chatId, 'Выберите комнату', options);
});


bot.on('callback_query', (callbackQuery) => {

    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;

    const [action, arg] = data.split(':', 2);


    if (action == 'room') {

        buttons = timeSlots.map(item => {
            return [{text: item, callback_data: ("booktime:" + `${arg};` + item)}]
        });

        const options = {
            reply_markup: {
                inline_keyboard: buttons,
            },
        };

        bot.sendMessage(chatId, `Выбрана комната ${arg}. Свободные слоты:`, options);

    } else if (action == 'booktime') {
        const [room, time] = arg.split(';', 2);

        bot.sendMessage(chatId, `Забронирована комната ${room} на время ${time}`);
    }

})


bot.onText(/\/reservations/, async (msg) => {

    const chatId = msg.chat.id;
    
    const token = await getAuthToken();

    const reservations = await getReservations(token);

    const jsonString = JSON.stringify(reservations);

    await bot.sendMessage(chatId, jsonString);
});


bot.onText(/\/mybookings/, async msg => {
    const chatId = msg.chat.id;

    await bot.sendMessage(chatId, "Ваши бронирования (заглушка)");
});


bot.onText(/\/employees/, async msg => {
    const chatId = msg.chat.id;
    await bot.sendMessage(chatId, "Список сотрудников, с которыми можно попросить встречу (заглушка)");
});

// Error
bot.on("polling_error", err => console.log(err.data.error.message));

// Menu
const commands = [

    {
        command: "start",
        description: "Запуск бота"
    }, 
    {
        command: "roomlist",
        description: "Список аудиторий"
    }, 
    {
        command: "mybookings",
        description: "Показать бронирования"
    },
    {
        command: "employees",
        description: "Сотрудники"
    },
    {
        command: "reservations",
        description: "Все бронирования"
    }
]

bot.setMyCommands(commands);