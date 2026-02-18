const TelegramBot = require('node-telegram-bot-api');
const { DateTime } = require('luxon');
const fs = require('fs');
const path = require('path');
const schedule = require('node-schedule');

// ==========================================
// ⚙️ CONFIGURATION
// ==========================================
const TOKEN = '8184622311:AAGjxKL6mu0XPo9KEkq3XS-6yGbajLuGN2A'; 
const OWNER_IDS = ["190190519", "1122603836"]; 
const TARGET_GROUP_ID = "-1002372844799"; 
const BAN_FILE = path.join(__dirname, 'banned.json');
const EVENT_FILE = path.join(__dirname, 'events.json');

const bot = new TelegramBot(TOKEN, { 
    polling: {
        interval: 100,
        autoStart: true,
        params: { allowed_updates: ["message", "chat_member", "my_chat_member"] }
    }
});

// ==========================================
// 💾 DATABASE HELPERS
// ==========================================
const loadData = (file) => {
    try {
        if (!fs.existsSync(file)) fs.writeFileSync(file, "[]");
        return JSON.parse(fs.readFileSync(file, "utf8")) || [];
    } catch (e) { return []; }
};

const saveData = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));

let bannedUsers = loadData(BAN_FILE);
let calendarEvents = loadData(EVENT_FILE);

// Helper to check if a user is an Admin or Owner
async function isAdmin(chatId, userId) {
    if (OWNER_IDS.includes(String(userId))) return true;
    try {
        const member = await bot.getChatMember(chatId, userId);
        return ['administrator', 'creator'].includes(member.status);
    } catch (e) { return false; }
}

// ==========================================
// ⏰ SCHEDULER ENGINE (FIXED BUG)
// ==========================================
schedule.scheduleJob('* * * * *', async () => {
    const now = DateTime.now().toMillis();
    let changed = false;
    const remainingEvents = [];

    for (const ev of calendarEvents) {
        if (now >= ev.timestamp) {
            const alert = `🔔 <b>EVENT REMINDER</b>\n━━━━━━━━━━━━━━━━━━\n📝 <b>Event:</b> ${ev.name}\n⏰ <b>Scheduled for:</b> ${ev.dateString}\n━━━━━━━━━━━━━━━━━━\n<i>The event is starting now!</i>`;
            
            try {
                const sentMsg = await bot.sendMessage(ev.chatId, alert, { parse_mode: 'HTML' });
                await bot.pinChatMessage(ev.chatId, sentMsg.message_id, { disable_notification: true });
                console.log(`[CALENDAR] Reminder sent and pinned for: ${ev.name}`);
            } catch (e) {
                console.log(`Error sending/pinning reminder: ${e.message}`);
            }
            changed = true; // Mark that we need to update the file
        } else {
            remainingEvents.push(ev); // Keep the event if it's in the future
        }
    }

    if (changed) {
        calendarEvents = remainingEvents;
        saveData(EVENT_FILE, calendarEvents);
    }
});

// ==========================================
// 🛡️ SECURITY: INSTANT BAN (On Join)
// ==========================================
bot.on('chat_member', (event) => {
    const chatId = String(event.chat.id);
    const userId = String(event.new_chat_member.user.id);
    const status = event.new_chat_member.status;

    if (chatId === TARGET_GROUP_ID && (status === 'member' || status === 'restricted')) {
        if (bannedUsers.includes(userId)) {
            bot.banChatMember(chatId, userId).catch(() => {});
        }
    }
});

// ==========================================
// 📩 MAIN MESSAGE HANDLING
// ==========================================
bot.on('message', async (msg) => {
    if (!msg.chat || !msg.text) return;
    const chatId = String(msg.chat.id);
    const fromId = String(msg.from.id);
    const text = msg.text;

    // 1. AUTO-BAN
    if (chatId === TARGET_GROUP_ID && bannedUsers.includes(fromId)) {
        bot.deleteMessage(chatId, msg.message_id).catch(() => {});
        bot.banChatMember(chatId, fromId).catch(() => {});
        return;
    }

    // 2. CALENDAR COMMANDS (Admin/Owner Only)
    if (text.startsWith('/event ')) {
        if (!(await isAdmin(chatId, fromId))) return;

        const parts = text.replace('/event ', '').split('@');
        if (parts.length < 2) return bot.sendMessage(chatId, "⚠️ Use: <code>/event Name @ February 20, 2026 at 4:00PM</code>", { parse_mode: 'HTML' });
        
        const timeInput = parts[1].trim();
        const eventDate = DateTime.fromFormat(timeInput, "MMMM d, yyyy 'at' h:mma", { zone: 'America/New_York' });

        if (!eventDate.isValid) return bot.sendMessage(chatId, "❌ Use format: <code>February 20, 2026 at 4:00PM</code>", { parse_mode: 'HTML' });

        calendarEvents.push({ name: parts[0].trim(), timestamp: eventDate.toMillis(), dateString: timeInput, chatId });
        saveData(EVENT_FILE, calendarEvents);
        bot.sendMessage(chatId, `✅ <b>Scheduled:</b> ${parts[0].trim()}`, { parse_mode: 'HTML' });
    }

    if (text === '/events') {
        if (calendarEvents.length === 0) return bot.sendMessage(chatId, "📅 No upcoming events.");
        const list = calendarEvents.sort((a, b) => a.timestamp - b.timestamp)
            .map((ev, i) => `${i + 1}. <b>${ev.name}</b>\n   └ ${ev.dateString}`).join('\n\n');
        bot.sendMessage(chatId, `🗓️ <b>Upcoming Events:</b>\n\n${list}`, { parse_mode: 'HTML' });
    }

    if (text.startsWith('/delevent ')) {
        if (!(await isAdmin(chatId, fromId))) return;

        const index = parseInt(text.split(' ')[1]) - 1;
        if (calendarEvents[index]) {
            const removed = calendarEvents.splice(index, 1);
            saveData(EVENT_FILE, calendarEvents);
            bot.sendMessage(chatId, `🗑️ Deleted: <b>${removed[0].name}</b>`, { parse_mode: 'HTML' });
        } else {
            bot.sendMessage(chatId, "❌ Event not found.", { parse_mode: 'HTML' });
        }
    }

    // 3. OWNER & UTILITY COMMANDS
    if (OWNER_IDS.includes(fromId)) {
        if (text.startsWith("/permban ")) {
            const target = text.split(" ")[1];
            if (!bannedUsers.includes(target)) {
                bannedUsers.push(target);
                saveData(BAN_FILE, bannedUsers);
                bot.sendMessage(chatId, `✅ Banned: \`${target}\``, { parse_mode: "Markdown" });
                bot.banChatMember(chatId, target).catch(() => {});
            }
        }
        if (msg.forward_from || msg.forward_from_chat) {
            let id = msg.forward_from ? msg.forward_from.id : msg.forward_from_chat.id;
            bot.sendMessage(chatId, `🎯 **ID:** \`${id}\``, { parse_mode: "Markdown" });
        }
    }

    // 4. /when COMMAND
    if (text.startsWith('/when') && msg.reply_to_message) {
        const t = msg.reply_to_message;
        const diff = DateTime.now().diff(DateTime.fromSeconds(t.forward_date || t.date), ['years', 'months', 'days', 'hours', 'minutes', 'seconds']).toObject();
        const parts = ['years', 'months', 'days', 'hours', 'minutes', 'seconds']
            .filter(u => diff[u] > 0 || u === 'seconds')
            .map(u => `<b>${Math.floor(diff[u])}</b> ${u}`);
        bot.sendMessage(chatId, `⏳ <b>This message is:</b>\n${parts.join(', ').replace(/, ([^,]*)$/, ' and $1')} old`, { parse_mode: 'HTML', reply_to_message_id: t.message_id });
    }

    // 5. REGEX s/
    if (text.startsWith('s/') && msg.reply_to_message) {
        const orig = msg.reply_to_message.text || msg.reply_to_message.caption;
        const p = text.slice(2).split('/');
        if (p.length >= 2 && orig) {
            try {
                const newT = orig.replace(new RegExp(p[0], p[2] || ''), p[1]);
                if (newT !== orig) bot.sendMessage(chatId, `<i>Did you mean:</i>\n\n${newT}`, { parse_mode: 'HTML', reply_to_message_id: msg.reply_to_message.message_id });
            } catch (e) {}
        }
    }
});

console.log('🤖 FIXED ADMIN BOT ACTIVE.');
