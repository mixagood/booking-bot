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
            console.log(JSON.stringify(errorData));
            throw new Error(`Ошибка ${response.status}: ${errorData.message || response.statusText}`);
        }

        return await response.json();

    } catch (error) {
        console.error("Ошибка при бронировании комнаты:", error.message);
        throw error; // Пробрасываем ошибку дальше для обработки
    }
}

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

async function deleteReservation(chatId, reservationId, access_token) {

    const url = `http://127.0.0.1:8000/reservations/${reservationId}`;

    try {
        const response = await fetch(url,
            {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${access_token}`,
                    'Content-Type': 'application/json'
                }
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

module.exports = {
    getAuthToken,
    getReservationsByRoom,
    getUserReservations,
    getReservations,
    getMeetingRooms,
    bookRoom,
    registerUser,
    deleteReservation
}