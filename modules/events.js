const { DateTime } = require('luxon');
const config = require('../config');
const { saveData } = require('../dataManager');

module.exports = function(bot, state, utils) {
    
    function generateReminderKeyboard(selected) {
        const options = [
            { label: '15 Mins', val: 15 },
            { label: '30 Mins', val: 30 },
            { label: '1 Hour', val: 60 },
            { label: '2 Hours', val: 120 },
            { label: '1 Day', val: 1440 }
        ];
        let kb = []; 
        let row = [];
        
        for (let i = 0; i < options.length; i++) {
            let opt = options[i];
            let isSel = selected.includes(opt.val) ? '✅ ' : "";
            row.push({ 
                text: `${isSel}${opt.label}`, 
                callback_data: `REM_TOGGLE_${opt.val}` 
            });
            
            if (row.length === 2) { 
                kb.push(row); 
                row = []; 
            }
        }
        if (row.length > 0) kb.push(row);
        kb.push([{ text: "➡️ Finish & Save Event", callback_data: `REM_DONE` }]);
        kb.push([{ text: "❌ Cancel", callback_data: `CANCEL` }]);
        return kb;
    }

    async function renderPublicEventList(chatId, msgIdToEdit, userId, replyToId = null) {
        state.calendarEvents.sort((a,b) => a.timestamp - b.timestamp);
        
        let list = "📅 No upcoming events.";
        let kb = [];
        
        if (state.calendarEvents.length > 0) {
            let eventStrings = [];
            for (let i = 0; i < state.calendarEvents.length; i++) {
                let ev = state.calendarEvents[i];
                eventStrings.push(`${i+1}. <b>${ev.name}</b> - ${ev.dateString}`);
            }
            list = `🗓️ <b>Upcoming Events:</b>\n\n${eventStrings.join('\n')}`;
            
            for (let i = 0; i < state.calendarEvents.length; i++) {
                let ev = state.calendarEvents[i];
                let evId = ev.id || String(ev.timestamp);
                kb.push([{ 
                    text: `🔔 Remind Me: ${ev.name}`, 
                    callback_data: `EVSUB_${evId}` 
                }]);
            }
        }
        
        let adminStatus = await utils.isAdmin(chatId, userId);
        if (adminStatus) {
            kb.push([{ text: "⚙️ Manage Events", callback_data: `EV_ADMIN_MENU_${userId}` }]);
        }
        kb.push([{ text: "❌ Close", callback_data: `EV_CLOSE_${userId}` }]);
        
        const opts = { 
            parse_mode: 'HTML', 
            reply_markup: { inline_keyboard: kb } 
        };
        
        if (msgIdToEdit) {
            try {
                await bot.editMessageText(list, { chat_id: chatId, message_id: msgIdToEdit, ...opts });
            } catch (err) {}
        } else {
            if (replyToId) opts.reply_to_message_id = replyToId;
            await bot.sendMessage(chatId, list, opts);
        }
    }

    async function renderAdminEditList(chatId, msgId, userId) {
        state.calendarEvents.sort((a,b) => a.timestamp - b.timestamp);
        
        let list = "📅 No upcoming events.";
        if (state.calendarEvents.length > 0) {
            let eventStrings = [];
            for (let i = 0; i < state.calendarEvents.length; i++) {
                let ev = state.calendarEvents[i];
                eventStrings.push(`${i+1}. <b>${ev.name}</b> - ${ev.dateString}`);
            }
            list = `🗓️ <b>Select an Event to Edit/Delete:</b>\n\n${eventStrings.join('\n')}`;
        }
        
        let kb = [];
        for (let i = 0; i < state.calendarEvents.length; i++) {
            kb.push([
                { text: `✏️ Edit #${i+1}`, callback_data: `EV_EDIT_${i}_${userId}` },
                { text: `🗑️ Delete #${i+1}`, callback_data: `EV_DEL_${i}_${userId}` }
            ]);
        }
        kb.push([{ text: "🔙 Back to Events", callback_data: `EV_BACK_MAIN_${userId}` }]);
        
        try {
            await bot.editMessageText(list, { 
                chat_id: chatId, 
                message_id: msgId, 
                parse_mode: 'HTML', 
                reply_markup: { inline_keyboard: kb } 
            });
        } catch (err) {}
    }

    async function renderEventEditMenu(chatId, msgId, idx, userId) {
        state.calendarEvents.sort((a,b) => a.timestamp - b.timestamp);
        const ev = state.calendarEvents[idx];
        
        if (!ev) {
            await renderAdminEditList(chatId, msgId, userId);
            return;
        }
        
        if (!ev.raw && ev.timestamp) {
            const dt = DateTime.fromMillis(ev.timestamp).setZone('America/New_York');
            ev.raw = { 
                month: String(dt.month), 
                day: String(dt.day), 
                year: dt.year, 
                time: dt.toFormat('h:mm a'), 
                tz: 'America/New_York' 
            };
            saveData(config.FILES.EVENT, state.calendarEvents); 
        }
        
        let txt = `✏️ <b>Editing Event:</b> ${ev.name}\n📅 <b>Current Date/Time:</b> ${ev.dateString}\n\nWhat would you like to edit?`;
        let kb = [
            [{ text: "📝 Name", callback_data: `EV_FLD_NAME_${idx}_${userId}` }],
            [{ text: "📅 Date", callback_data: `EV_FLD_DATE_${idx}_${userId}` }, { text: "⏰ Time", callback_data: `EV_FLD_TIME_${idx}_${userId}` }],
            [{ text: "🌍 Timezone", callback_data: `EV_FLD_TZ_${idx}_${userId}` }, { text: "🔔 Reminders", callback_data: `EV_EDIT_REM_${idx}_${userId}` }],
            [{ text: "🔙 Back", callback_data: `EV_ADMIN_MENU_${userId}` }]
        ];
        
        try {
            await bot.editMessageText(txt, { 
                chat_id: chatId, 
                message_id: msgId, 
                parse_mode: 'HTML', 
                reply_markup: { inline_keyboard: kb } 
            });
        } catch (err) {}
    }

    async function renderEventRemindersMenu(chatId, msgId, idx, userId) {
        const ev = state.calendarEvents[idx];
        if (!ev) return;
        if (!ev.reminders) ev.reminders = [];
        
        const options = [ 
            { label: '15 Mins', val: 15 }, 
            { label: '30 Mins', val: 30 }, 
            { label: '1 Hour', val: 60 }, 
            { label: '2 Hours', val: 120 }, 
            { label: '1 Day', val: 1440 } 
        ];
        
        let kb = []; 
        let row = [];
        
        for (let i = 0; i < options.length; i++) {
            let opt = options[i];
            let isSel = ev.reminders.includes(opt.val) ? '✅ ' : "";
            row.push({ 
                text: `${isSel}${opt.label}`, 
                callback_data: `EV_TOG_REM_${idx}_${opt.val}_${userId}` 
            });
            
            if (row.length === 2) { 
                kb.push(row); 
                row = []; 
            }
        }
        if (row.length > 0) kb.push(row);
        kb.push([{ text: "🔙 Back to Edit Menu", callback_data: `EV_EDIT_${idx}_${userId}` }]);
        
        try {
            await bot.editMessageText(`🔔 <b>Toggle early reminders for:</b> ${ev.name}`, { 
                chat_id: chatId, 
                message_id: msgId, 
                parse_mode: 'HTML', 
                reply_markup: { inline_keyboard: kb } 
            });
        } catch (err) {}
    }

    return {
        generateReminderKeyboard,
        renderPublicEventList,
        renderAdminEditList,
        renderEventEditMenu,
        renderEventRemindersMenu
    };
};