let {cachedDates, cachedTimeSlots} = require('../config/config')
const {startHour, endHour} = require('../config/config')


function getCachedTimeslotsCurMonth() {
    if (!cachedTimeSlots || cachedTimeSlots.timestamp < Date.now() - 24 * 60 * 60 * 1000) {
        cachedTimeSlots = {slots: {}, timestamp: null};
        const now = new Date(); // Текущая дата
        const year = now.getFullYear();
        const month = now.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        for (let day = now.getDate(); day <= daysInMonth; day++) {
            const slots = [];
            
            const currentDay = new Date(year, month, day);

            // Начинаем с указанного часа и идем по 30 минут
            let currentTime = new Date(currentDay).setHours(startHour, 0, 0, 0);
            const endTime = new Date(currentDay).setHours(endHour, 0, 0, 0);

            while (currentTime <= endTime) {
                slots.push(new Date(currentTime));
                currentTime += 30 * 60 * 1000; // Переходим к следующему интервалу
            }

            cachedTimeSlots.slots[day] = slots; // Привязываем слоты к конкретному дню
        }

        cachedTimeSlots.timestamp = Date.now();
    }

    return cachedTimeSlots.slots;
}

function getCachedDatesOfCurrentMonth() {
    if (!cachedDates || cachedDates.timestamp < Date.now() - 24 * 60 * 60 * 1000) {
        const now = new Date();
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        cachedDates = {
            dates: Array.from({ length: lastDay.getDate() }, (_, i) => new Date(firstDay.getFullYear(), firstDay.getMonth(), i + 1)),
            timestamp: Date.now(),
        };
    }
    return cachedDates.dates;
}

function groupButtons(buttons, rowLength) {

    const groupedButtons = [];
    for (let i = 0; i < buttons.length; i += rowLength) {
        groupedButtons.push(buttons.slice(i, i + rowLength));
    }

    // Опции с разметкой для Telegram
    const options = {
        reply_markup: {
            inline_keyboard: groupedButtons,
        },
    };

    return options;
}

module.exports = {
    getCachedDatesOfCurrentMonth,
    getCachedTimeslotsCurMonth,
    groupButtons
}