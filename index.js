const TelegramBot = require('node-telegram-bot-api');
const { DateTime } = require('luxon');
const fs = require('fs');
const path = require('path');
const schedule = require('node-schedule');
const { GoogleGenerativeAI } = require("@google/generative-ai");

// ==========================================
// ⚙️ CONFIGURATION
// ==========================================
const TOKEN = '8184622311:AAGjxKL6mu0XPo9KEkq3XS-6yGbajLuGN2A'; 
const GEMINI_KEY = 'AIzaSyBp65W8x8iHx2CpKSTLUJXikjoT_LQOhss'; 

const OWNER_IDS = ["190190519", "1122603836"]; 
const TARGET_GROUP_ID = "-1002372844799"; 
const BAN_FILE = path.join(__dirname, 'banned.json');
const EVENT_FILE = path.join(__dirname, 'events.json');

// Initialize Bot
const bot = new TelegramBot(TOKEN, { 
    polling: {
        interval: 100,
        autoStart: true,
        params: { allowed_updates: ["message", "chat_member", "my_chat_member"] }
    }
});

// Initialize Gemini
// ⚠️ IF "gemini-1.5-flash-latest" FAILS, CHANGE IT TO "gemini-1.0-pro"
const genAI = new GoogleGenerativeAI(GEMINI_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

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

// Helper: Check Admin
async function isAdmin(chatId, userId) {
    if (OWNER_IDS.includes(String(userId))) return true;
    try {
        const member = await bot.getChatMember(chatId, userId);
        return ['administrator', 'creator'].includes(member.status);
    } catch (e) { return false; }
}

// ==========================================
// 🧠 AI ENGINE
// ==========================================
async function askGemini(prompt, chatHistory = []) {
    try {
        const chat = model.startChat({
            history: chatHistory,
        });

        const result = await chat.sendMessage(prompt);
        return result.response.text();
    } catch (error) {
        console.error("Gemini Error:", error.message);
        // Fallback message if AI crashes
        return "⚠️ I couldn't reach the AI brain right now. Please check the API Key or Model Name.";
    }
}

// ==========================================
// ⏰ SCHEDULER ENGINE
// ==========================================
schedule.scheduleJob('* * * * *', async () => {
    const now = DateTime.now().toMillis();
    const dueEvents = calendarEvents.filter(ev => now >= ev.timestamp);
    const futureEvents = calendarEvents.filter(ev => now < ev.timestamp);

    if (dueEvents.length > 0) {
        for (const ev of dueEvents) {
            const alert = `🔔 <b>EVENT REMINDER</b>\n━━━━━━━━━━━━━━━━━━\n📝 <b>Event:</b> ${ev.name}\n⏰ <b>Scheduled for:</b> ${ev.dateString}\n━━━━━━━━━━━━━━━━━━\n<i>The event is starting now!</i>`;
            try {
                const sentMsg = await bot.sendMessage(ev.chatId, alert, { parse_mode: 'HTML' });
                await bot.pinChatMessage(ev.chatId, sentMsg.message_id, { disable_notification: true });
            } catch (e) {}
        }
        calendarEvents = futureEvents;
        saveData(EVENT_FILE, calendarEvents);
    }
});

// ==========================================
// 🛡️ SECURITY: INSTANT BAN
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

    const isTargetGroup = (chatId === TARGET_GROUP_ID);
    const isOwner = OWNER_IDS.includes(fromId);

    if (!isTargetGroup && !isOwner) return;

    // 1. AUTO-BAN
    if (isTargetGroup && bannedUsers.includes(fromId)) {
        bot.deleteMessage(chatId, msg.message_id).catch(() => {});
        bot.banChatMember(chatId, fromId).catch(() => {});
        return;
    }

    // ==========================================
    // 🤖 AI COMMANDS
    // ==========================================
    
    // Interactive Mode
    if (text === '/ai') {
        return bot.sendMessage(chatId, "🤖 <b>Gemini AI:</b>\nWhat would you like to ask me? (Reply to this message)", { 
            parse_mode: 'HTML',
            reply_markup: { force_reply: true } 
        });
    }

    // Direct Mode
    if (text.startsWith('/ai ')) {
        const query = text.replace('/ai ', '').trim();
        if (!query) return;

        bot.sendChatAction(chatId, 'typing');
        const response = await askGemini(query);
        return bot.sendMessage(chatId, `🤖 **Gemini:**\n${response}`, { parse_mode: 'Markdown' });
    }

    // Reply Context Mode
    if (msg.reply_to_message) {
        const self = await bot.getMe();
        if (msg.reply_to_message.from.id === self.id) {
            const replyText = msg.reply_to_message.text || "";
            if (replyText.startsWith("🤖")) {
                const query = text;
                const previousResponse = replyText.replace(/^🤖 .*?:\s*/, "").trim();

                bot.sendChatAction(chatId, 'typing');
                const history = [{ role: "model", parts: [{ text: previousResponse }] }];
                const response = await askGemini(query, history);
                
                return bot.sendMessage(chatId, `🤖 **Gemini:**\n${response}`, { 
                    parse_mode: 'Markdown',
                    reply_to_message_id: msg.message_id
                });
            }
        }
    }

    // ==========================================
    // 🗓️ CALENDAR
    // ==========================================
    if (text.startsWith('/event ')) {
        if (!(await isAdmin(chatId, fromId))) return;
        const parts = text.replace('/event ', '').split('@');
        if (parts.length < 2) return bot.sendMessage(chatId, "⚠️ Usage: <code>/event Name @ February 20, 2026 at 4:00PM</code>", { parse_mode: 'HTML' });
        
        const timeInput = parts[1].trim();
        const eventDate = DateTime.fromFormat(timeInput, "MMMM d, yyyy 'at' h:mma", { zone: 'America/New_York' });

        if (!eventDate.isValid) return bot.sendMessage(chatId, "❌ Date format error.", { parse_mode: 'HTML' });

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
            calendarEvents.splice(index, 1);
            saveData(EVENT_FILE, calendarEvents);
            bot.sendMessage(chatId, `🗑️ Event deleted.`, { parse_mode: 'HTML' });
        }
    }

    // ==========================================
    // 🛠️ UTILITY & OWNER
    // ==========================================
    if (isTargetGroup) {
        if (text.startsWith('/when') && msg.reply_to_message) {
            const t = msg.reply_to_message;
            const diff = DateTime.now().diff(DateTime.fromSeconds(t.forward_date || t.date), ['years', 'months', 'days', 'hours', 'minutes', 'seconds']).toObject();
            const parts = ['years', 'months', 'days', 'hours', 'minutes', 'seconds']
                .filter(u => diff[u] > 0 || u === 'seconds')
                .map(u => `<b>${Math.floor(diff[u])}</b> ${u}`);
            bot.sendMessage(chatId, `⏳ <b>This message is:</b>\n${parts.join(', ').replace(/, ([^,]*)$/, ' and $1')} old`, { parse_mode: 'HTML', reply_to_message_id: t.message_id });
        }

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
    }

    if (isOwner) {
        if (text.startsWith("/permban ")) {
            const target = text.split(" ")[1];
            if (!bannedUsers.includes(target)) {
                bannedUsers.push(target);
                saveData(BAN_FILE, bannedUsers);
                bot.sendMessage(chatId, `✅ Banned: \`${target}\``, { parse_mode: "Markdown" });
                if (isTargetGroup) bot.banChatMember(chatId, target).catch(() => {});
            }
        }
        if (text.startsWith("/unpermban ")) {
            const target = text.split(" ")[1];
            bannedUsers = bannedUsers.filter(id => id !== target);
            saveData(BAN_FILE, bannedUsers);
            bot.sendMessage(chatId, `✅ Unbanned: \`${target}\``, { parse_mode: "Markdown" });
            if (isTargetGroup) bot.unbanChatMember(chatId, target, { only_if_banned: true }).catch(() => {});
        }
        if (msg.forward_from || msg.forward_from_chat) {
            let id = msg.forward_from ? msg.forward_from.id : msg.forward_from_chat.id;
            bot.sendMessage(chatId, `🎯 **ID:** \`${id}\``, { parse_mode: "Markdown" });
        }
    }
});

console.log('🤖 AI BOT RESTARTED.');
