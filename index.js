const TelegramBot = require('node-telegram-bot-api');
const { DateTime } = require('luxon');
const fs = require('fs');
const path = require('path');
const schedule = require('node-schedule');
const Groq = require('groq-sdk');

// ==========================================
// ⚙️ CONFIGURATION
// ==========================================
const TOKEN = '8184622311:AAGjxKL6mu0XPo9KEkq3XS-6yGbajLuGN2A'; 
const GROQ_API_KEY = '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'; // ⚠️ PASTE KEY HERE

const OWNER_IDS = ["190190519", "1122603836"]; 
const LOG_ID = "190190519"; 
const TARGET_GROUP_ID = "-1002372844799"; 

const BAN_FILE = path.join(__dirname, 'banned.json');
const EVENT_FILE = path.join(__dirname, 'events.json');
const MEMORY_FILE = path.join(__dirname, 'memory.json');

// Initialize Bot
const bot = new TelegramBot(TOKEN, { 
    polling: {
        interval: 100,
        autoStart: true,
        params: { allowed_updates: ["message", "chat_member", "my_chat_member"] }
    }
});

const groq = new Groq({ apiKey: GROQ_API_KEY });

// ==========================================
// 💾 DATABASE & STATE
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
let botMemories = loadData(MEMORY_FILE);

// 🧠 SHORT-TERM CONTEXT BUFFER
let recentChatHistory = []; 

function addToHistory(username, text) {
    const entry = `${username}: ${text}`;
    recentChatHistory.push(entry);
    if (recentChatHistory.length > 15) recentChatHistory.shift(); 
}

async function isAdmin(chatId, userId) {
    if (OWNER_IDS.includes(String(userId))) return true;
    try {
        const member = await bot.getChatMember(chatId, userId);
        return ['administrator', 'creator'].includes(member.status);
    } catch (e) { return false; }
}

// ==========================================
// 🛡️ HELPER: SAFE REPLY
// ==========================================
// This stops the bot from crashing if a user deletes their message
async function safeReply(chatId, text, replyToId) {
    try {
        await bot.sendMessage(chatId, text, { reply_to_message_id: replyToId });
    } catch (error) {
        // If reply fails (message deleted), send normally
        if (error.response && error.response.statusCode === 400) {
            await bot.sendMessage(chatId, text);
        } else {
            console.error("Msg Error:", error.message);
        }
    }
}

// ==========================================
// 🧠 SMART AI ENGINE
// ==========================================
async function askGroq(userPrompt) {
    try {
        const memoryList = botMemories.length > 0 ? botMemories.join("\n") : "No specific memories yet.";
        const contextList = recentChatHistory.join("\n");

        const systemMessage = `
        You are a helpful Telegram group assistant.
        
        🧠 MEMORIES:
        ${memoryList}

        💬 RECENT CHAT:
        ${contextList}

        🔴 INSTRUCTIONS:
        1. Answer naturally.
        2. If the user shares a NEW fact (name, rule, preference), output "SAVE_MEM: <fact>" at the end.
        `;

        const chatCompletion = await groq.chat.completions.create({
            messages: [
                { role: "system", content: systemMessage },
                { role: "user", content: userPrompt }
            ],
            model: "llama-3.3-70b-versatile",
            temperature: 0.7,
            max_tokens: 1024,
        });

        let response = chatCompletion.choices[0]?.message?.content || "⚠️ Empty response.";

        // 3. Extract Memories
        if (response.includes("SAVE_MEM:")) {
            const parts = response.split("SAVE_MEM:");
            const cleanResponse = parts[0].trim();
            const memoryToSave = parts[1].trim();

            if (memoryToSave && !botMemories.includes(memoryToSave)) {
                botMemories.push(memoryToSave);
                saveData(MEMORY_FILE, botMemories);
                console.log(`🧠 AUTO-LEARNED: ${memoryToSave}`);
                
                // 📨 LOG TO OWNER
                bot.sendMessage(LOG_ID, `🧠 **I Learned Something New!**\n\n${memoryToSave}`, { parse_mode: 'Markdown' }).catch(() => {});
            }
            return cleanResponse;
        }

        return response;

    } catch (error) {
        console.error("Groq Error:", error.message);
        return "⚠️ I couldn't reach the AI brain right now.";
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
    const name = msg.from.first_name || "User";
    const text = msg.text;

    const isTargetGroup = (chatId === TARGET_GROUP_ID);
    const isOwner = OWNER_IDS.includes(fromId);

    if (!isTargetGroup && !isOwner) return;

    // 0. AUTO-BAN
    if (isTargetGroup && bannedUsers.includes(fromId)) {
        bot.deleteMessage(chatId, msg.message_id).catch(() => {});
        bot.banChatMember(chatId, fromId).catch(() => {});
        return;
    }

    // 1. UPDATE CONTEXT
    addToHistory(name, text);

    // ==========================================
    // 🤖 AI COMMANDS
    // ==========================================
    
    // Interactive Mode
    if (text === '/ai') {
        return bot.sendMessage(chatId, "What's up?", { 
            reply_markup: { force_reply: true },
            reply_to_message_id: msg.message_id 
        });
    }

    // Direct Mode
    if (text.startsWith('/ai ')) {
        const query = text.replace('/ai ', '').trim();
        if (!query) return;

        bot.sendChatAction(chatId, 'typing');
        const response = await askGroq(query);
        
        return safeReply(chatId, response, msg.message_id);
    }

    // Natural Reply Mode
    if (msg.reply_to_message) {
        const self = await bot.getMe();
        if (msg.reply_to_message.from.id === self.id) {
            
            bot.sendChatAction(chatId, 'typing');
            const response = await askGroq(text);
            
            return safeReply(chatId, response, msg.message_id);
        }
    }

    // ==========================================
    // 🧠 MEMORY MANAGEMENT (Manual)
    // ==========================================
    if (text === '/memories' && (await isAdmin(chatId, fromId))) {
        if (botMemories.length === 0) return bot.sendMessage(chatId, "🧠 My mind is empty.");
        const list = botMemories.map((m, i) => `${i + 1}. ${m}`).join('\n');
        return bot.sendMessage(chatId, `🧠 <b>Long-Term Memories:</b>\n\n${list}`, { parse_mode: 'HTML' });
    }
    
    if (text.startsWith('/forget ') && (await isAdmin(chatId, fromId))) {
        const index = parseInt(text.split(' ')[1]) - 1;
        if (botMemories[index]) {
            botMemories.splice(index, 1);
            saveData(MEMORY_FILE, botMemories);
            bot.sendMessage(chatId, "🗑️ Memory deleted.");
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

console.log('🤖 CRASH-PROOF BOT ONLINE.');
