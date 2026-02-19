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
        params: { allowed_updates: ["message", "chat_member", "my_chat_member", "callback_query"] }
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
    recentChatHistory.push(`${username}: ${text}`);
    if (recentChatHistory.length > 15) recentChatHistory.shift(); 
}

// 🗓️ EVENT WIZARD STATE
let eventSetupState = {}; 

async function isAdmin(chatId, userId) {
    if (OWNER_IDS.includes(String(userId))) return true;
    try {
        const member = await bot.getChatMember(chatId, userId);
        return ['administrator', 'creator'].includes(member.status);
    } catch (e) { return false; }
}

// 🛡️ HELPER: SAFE REPLY
async function safeReply(chatId, text, replyToId) {
    try {
        await bot.sendMessage(chatId, text, { reply_to_message_id: replyToId });
    } catch (error) {
        if (error.response && error.response.statusCode === 400) {
            await bot.sendMessage(chatId, text);
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

        if (response.includes("SAVE_MEM:")) {
            const parts = response.split("SAVE_MEM:");
            const cleanResponse = parts[0].trim();
            const memoryToSave = parts[1].trim();

            if (memoryToSave && !botMemories.includes(memoryToSave)) {
                botMemories.push(memoryToSave);
                saveData(MEMORY_FILE, botMemories);
                bot.sendMessage(LOG_ID, `🧠 **I Learned Something New!**\n\n${memoryToSave}`, { parse_mode: 'Markdown' }).catch(() => {});
            }
            return cleanResponse;
        }
        return response;
    } catch (error) {
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

    // 1. EVENT CREATION WIZARD (INTERCEPTOR)
    if (eventSetupState[fromId] && eventSetupState[fromId].chatId === chatId) {
        const state = eventSetupState[fromId];

        // If they type /cancel, abort the wizard
        if (text === '/cancel') {
            bot.deleteMessage(chatId, msg.message_id).catch(()=>{});
            bot.deleteMessage(chatId, state.lastPromptId).catch(()=>{});
            delete eventSetupState[fromId];
            return bot.sendMessage(chatId, "🚫 Event creation cancelled.", { reply_to_message_id: state.triggerMsgId });
        }

        // STEP 1: NAME received
        if (state.step === 'NAME') {
            state.eventName = text;
            state.step = 'DATE';
            
            bot.deleteMessage(chatId, msg.message_id).catch(()=>{}); 
            bot.deleteMessage(chatId, state.lastPromptId).catch(()=>{}); 

            const prompt = await bot.sendMessage(chatId, "📅 What is the date? (e.g., `February 20, 2026`)", { parse_mode: 'Markdown' });
            state.lastPromptId = prompt.message_id;
            return;
        }

        // STEP 2: DATE received
        if (state.step === 'DATE') {
            state.eventDate = text;
            state.step = 'TIME';

            bot.deleteMessage(chatId, msg.message_id).catch(()=>{}); 
            bot.deleteMessage(chatId, state.lastPromptId).catch(()=>{}); 

            const prompt = await bot.sendMessage(chatId, "⏰ What time? (e.g., `4:00 PM`)", { parse_mode: 'Markdown' });
            state.lastPromptId = prompt.message_id;
            return;
        }

        // STEP 3: TIME received & KEYBOARD
        if (state.step === 'TIME') {
            state.eventTime = text;
            state.step = 'TIMEZONE';

            bot.deleteMessage(chatId, msg.message_id).catch(()=>{}); 
            bot.deleteMessage(chatId, state.lastPromptId).catch(()=>{}); 

            // ⚠️ UPDATED BUTTONS
            const keyboard = {
                inline_keyboard: [
                    [{ text: "🕒 PST", callback_data: `TZ_America/Los_Angeles` }, { text: "🕒 CST", callback_data: `TZ_America/Chicago` }],
                    [{ text: "🕒 EST", callback_data: `TZ_America/New_York` }, { text: "🕒 GMT", callback_data: `TZ_Europe/London` }],
                    [{ text: "❌ Cancel", callback_data: `TZ_CANCEL` }]
                ]
            };

            const prompt = await bot.sendMessage(chatId, "🌍 Select the Time Zone:", { reply_markup: keyboard });
            state.lastPromptId = prompt.message_id;
            return;
        }
    }

    // 2. TRIGGER WIZARD
    if (text === '/newevent') {
        if (!(await isAdmin(chatId, fromId))) return;
        
        const prompt = await bot.sendMessage(chatId, "📝 What is the name of your event?");
        
        eventSetupState[fromId] = {
            chatId: chatId,
            step: 'NAME',
            triggerMsgId: msg.message_id, 
            lastPromptId: prompt.message_id,
            eventName: '',
            eventDate: '',
            eventTime: ''
        };
        return;
    }

    // 3. UPDATE CONTEXT & NORMAL COMMANDS
    if (!text.startsWith('/')) addToHistory(name, text);

    if (text === '/ai') {
        return bot.sendMessage(chatId, "What's up?", { reply_markup: { force_reply: true }, reply_to_message_id: msg.message_id });
    }

    if (text.startsWith('/ai ')) {
        const query = text.replace('/ai ', '').trim();
        if (!query) return;
        bot.sendChatAction(chatId, 'typing');
        const response = await askGroq(query);
        return safeReply(chatId, response, msg.message_id);
    }

    if (msg.reply_to_message && msg.reply_to_message.from.id === (await bot.getMe()).id && !text.startsWith('/')) {
        bot.sendChatAction(chatId, 'typing');
        const response = await askGroq(text);
        return safeReply(chatId, response, msg.message_id);
    }

    // MEMORY COMMANDS
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

    // CALENDAR LIST & DELETE
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

    // UTILITY & OWNER
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

// ==========================================
// 🕹️ INLINE BUTTON HANDLER
// ==========================================
bot.on('callback_query', async (query) => {
    const data = query.data;
    const chatId = String(query.message.chat.id);
    const fromId = String(query.from.id);

    if (data.startsWith('TZ_')) {
        const state = eventSetupState[fromId];
        
        if (!state || state.chatId !== chatId) {
            return bot.answerCallbackQuery(query.id, { text: "This isn't your event setup!", show_alert: true });
        }

        const tz = data.replace('TZ_', '');

        if (tz === 'CANCEL') {
            bot.deleteMessage(chatId, query.message.message_id).catch(()=>{});
            delete eventSetupState[fromId];
            return bot.sendMessage(chatId, "🚫 Event creation cancelled.", { reply_to_message_id: state.triggerMsgId });
        }

        // ⚠️ MAP TIMEZONES TO ABBREVIATIONS FOR CLEANER OUTPUT
        const tzNames = {
            'America/Los_Angeles': 'PST',
            'America/Chicago': 'CST',
            'America/New_York': 'EST',
            'Europe/London': 'GMT'
        };
        const displayTz = tzNames[tz] || tz;

        const combinedString = `${state.eventDate} ${state.eventTime}`;
        const eventDate = DateTime.fromFormat(combinedString, "MMMM d, yyyy h:mm a", { zone: tz });

        if (!eventDate.isValid) {
            bot.answerCallbackQuery(query.id, { text: "Error parsing date/time. Try again.", show_alert: true });
            bot.deleteMessage(chatId, query.message.message_id).catch(()=>{});
            delete eventSetupState[fromId];
            return bot.sendMessage(chatId, `❌ **Format Error!**\nI couldn't understand: \`${combinedString}\`\nPlease start over with /newevent and use exactly this format: \`February 20, 2026\` and \`4:00 PM\``, { parse_mode: 'Markdown', reply_to_message_id: state.triggerMsgId });
        }

        // Save Event
        calendarEvents.push({ 
            name: state.eventName, 
            timestamp: eventDate.toMillis(), 
            dateString: `${state.eventDate} at ${state.eventTime} (${displayTz})`, 
            chatId: chatId 
        });
        saveData(EVENT_FILE, calendarEvents);

        bot.deleteMessage(chatId, query.message.message_id).catch(()=>{});

        // ⚠️ USES THE CLEAN 'displayTz' ABBREVIATION IN SUCCESS MESSAGE
        bot.sendMessage(chatId, `✅ <b>Event Successfully Scheduled!</b>\n\n📝 <b>Name:</b> ${state.eventName}\n📅 <b>Time:</b> ${state.eventDate} @ ${state.eventTime}\n🌍 <b>Zone:</b> ${displayTz}\n\n<i>I will pin a reminder when it starts.</i>`, { 
            parse_mode: 'HTML',
            reply_to_message_id: state.triggerMsgId
        });

        delete eventSetupState[fromId];
        bot.answerCallbackQuery(query.id);
    }
});

console.log('🤖 WIZARD BOT (ABBR. TIMEZONES) ONLINE.');
