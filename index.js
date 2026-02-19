const TelegramBot = require('node-telegram-bot-api');
const { DateTime } = require('luxon');
const fs = require('fs');
const path = require('path');
const schedule = require('node-schedule');
const Groq = require('groq-sdk');
// ⚠️ MUST USE JIMP v0.22.10 (npm install jimp@0.22.10)
const Jimp = require('jimp'); 

// ==========================================
// ⚙️ CONFIGURATION
// ==========================================
const TOKEN = '8184622311:AAGjxKL6mu0XPo9KEkq3XS-6yGbajLuGN2A'; 
const GROQ_API_KEY = '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'; 

const OWNER_IDS = ["190190519", "1122603836"]; 
const LOG_ID = "190190519"; 
const TARGET_GROUP_ID = "-1002372844799"; 

const BAN_FILE = path.join(__dirname, 'banned.json');
const EVENT_FILE = path.join(__dirname, 'events.json');
const MEMORY_FILE = path.join(__dirname, 'memory.json');
const BDAY_FILE = path.join(__dirname, 'birthdays.json');

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
let birthdays = loadData(BDAY_FILE);

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
// 🎂 BIRTHDAY ENGINE (With Confetti & Safe Pin)
// ==========================================
async function triggerBirthdayCard(chatId, bday) {
    try {
        const profilePhotos = await bot.getUserProfilePhotos(bday.userId, { limit: 1 });
        let imageBuffer = null;
        
        if (profilePhotos.total_count > 0) {
            const photos = profilePhotos.photos[0];
            const bestRes = photos[photos.length - 1];
            const imageUrl = await bot.getFileLink(bestRes.file_id);
            
            // 1. Load User's Profile Picture
            const image = await Jimp.read(imageUrl);

            // 2. Load and Overlay Confetti
            const confettiPath = path.join(__dirname, 'confetti.png');
            if (fs.existsSync(confettiPath)) {
                try {
                    const confetti = await Jimp.read(confettiPath);
                    confetti.resize(image.bitmap.width, image.bitmap.height);
                    image.composite(confetti, 0, 0);
                } catch (err) {
                    console.error("Error adding confetti overlay:", err);
                }
            }

            // 3. Add Text
            const fontWhite = await Jimp.loadFont(Jimp.FONT_SANS_64_WHITE);
            const fontBlack = await Jimp.loadFont(Jimp.FONT_SANS_64_BLACK);
            const textStr = "HAPPY BIRTHDAY";
            
            image.print(fontBlack, 2, 2, {
                text: textStr,
                alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER,
                alignmentY: Jimp.VERTICAL_ALIGN_BOTTOM
            }, image.bitmap.width, image.bitmap.height - 40);
            
            image.print(fontWhite, 0, 0, {
                text: textStr,
                alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER,
                alignmentY: Jimp.VERTICAL_ALIGN_BOTTOM
            }, image.bitmap.width, image.bitmap.height - 42);

            imageBuffer = await image.getBufferAsync(Jimp.MIME_JPEG);
        }

        const tag = bday.username ? `@${bday.username}` : `[${bday.name}](tg://user?id=${bday.userId})`;
        const caption = `🎉 🎂 **HAPPY BIRTHDAY ${tag}!** 🎂 🎉`;

        let sentMsg;

        if (imageBuffer) {
            sentMsg = await bot.sendPhoto(chatId, imageBuffer, { caption: caption, parse_mode: 'Markdown' });
        } else {
            sentMsg = await bot.sendMessage(chatId, caption, { parse_mode: 'Markdown' });
        }

        // 📌 SAFE PIN: Wait 1 second for Telegram to process the media, then pin
        if (sentMsg && sentMsg.message_id) {
            setTimeout(async () => {
                try {
                    await bot.pinChatMessage(chatId, sentMsg.message_id, { disable_notification: true });
                    console.log(`📌 Successfully pinned birthday message for ${bday.name}!`);
                } catch (pinErr) {
                    console.error("❌ Pin Error:", pinErr.message);
                }
            }, 1000); 
        }

    } catch (e) {
        console.error("Birthday Error:", e.message);
    }
}

async function checkBirthdays() {
    const today = DateTime.now().setZone('America/New_York').toFormat('MM-dd');
    for (const bday of birthdays) {
        if (bday.date === today) {
            await triggerBirthdayCard(TARGET_GROUP_ID, bday);
        }
    }
}

// Schedule Birthday Checks at 9:00 AM EST every day
const bdayRule = new schedule.RecurrenceRule();
bdayRule.hour = 9;
bdayRule.minute = 0;
bdayRule.tz = 'America/New_York';
schedule.scheduleJob(bdayRule, checkBirthdays);


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
// ⏰ SCHEDULER ENGINE (Events)
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

    if (isTargetGroup && bannedUsers.includes(fromId)) {
        bot.deleteMessage(chatId, msg.message_id).catch(() => {});
        bot.banChatMember(chatId, fromId).catch(() => {});
        return;
    }

    // 1. EVENT CREATION WIZARD
    if (eventSetupState[fromId] && eventSetupState[fromId].chatId === chatId) {
        const state = eventSetupState[fromId];

        if (text === '/cancel') {
            bot.deleteMessage(chatId, msg.message_id).catch(()=>{});
            bot.deleteMessage(chatId, state.lastPromptId).catch(()=>{});
            delete eventSetupState[fromId];
            return bot.sendMessage(chatId, "🚫 Event creation cancelled.", { reply_to_message_id: state.triggerMsgId });
        }

        if (msg.reply_to_message && msg.reply_to_message.message_id === state.lastPromptId) {
            
            if (state.step === 'NAME') {
                state.eventName = text;
                state.step = 'MONTH';
                
                bot.deleteMessage(chatId, msg.message_id).catch(()=>{}); 
                bot.deleteMessage(chatId, state.lastPromptId).catch(()=>{}); 

                const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                let monthKb = [];
                for (let i = 0; i < 12; i+=3) {
                    monthKb.push([
                        { text: monthNames[i], callback_data: `MONTH_${i+1}` },
                        { text: monthNames[i+1], callback_data: `MONTH_${i+2}` },
                        { text: monthNames[i+2], callback_data: `MONTH_${i+3}` }
                    ]);
                }
                monthKb.push([{ text: "❌ Cancel", callback_data: `CANCEL_WIZARD` }]);

                const prompt = await bot.sendMessage(chatId, "📅 Select the Month:", { 
                    reply_markup: { inline_keyboard: monthKb },
                    reply_to_message_id: state.triggerMsgId 
                });
                state.lastPromptId = prompt.message_id;
                return;
            }

            if (state.step === 'TIME') {
                state.eventTime = text;
                state.step = 'TIMEZONE';

                bot.deleteMessage(chatId, msg.message_id).catch(()=>{}); 
                bot.deleteMessage(chatId, state.lastPromptId).catch(()=>{}); 

                const keyboard = {
                    inline_keyboard: [
                        [{ text: "🕒 PST", callback_data: `TZ_America/Los_Angeles` }, { text: "🕒 CST", callback_data: `TZ_America/Chicago` }],
                        [{ text: "🕒 EST", callback_data: `TZ_America/New_York` }, { text: "🕒 GMT", callback_data: `TZ_Europe/London` }],
                        [{ text: "❌ Cancel", callback_data: `CANCEL_WIZARD` }]
                    ]
                };

                const prompt = await bot.sendMessage(chatId, "🌍 Select the Time Zone:", { 
                    reply_markup: keyboard,
                    reply_to_message_id: state.triggerMsgId 
                });
                state.lastPromptId = prompt.message_id;
                return;
            }
        }
    }

    // 2. WIZARD TRIGGER
    if (text === '/newevent') {
        if (!(await isAdmin(chatId, fromId))) return;
        
        const prompt = await bot.sendMessage(chatId, "📝 What is the name of your event?", {
            reply_to_message_id: msg.message_id
        });
        
        eventSetupState[fromId] = {
            chatId: chatId,
            step: 'NAME',
            triggerMsgId: msg.message_id, 
            lastPromptId: prompt.message_id,
            eventName: '',
            eventMonth: '',
            eventDay: '',
            eventTime: ''
        };
        return;
    }

    // 3. 🎈 BIRTHDAY COMMANDS
    if (text.startsWith('/setbday ')) {
        const dateMatch = text.replace('/setbday ', '').trim();
        
        if (!/^\d{2}-\d{2}$/.test(dateMatch)) {
            return bot.sendMessage(chatId, "⚠️ Use format: `/setbday MM-DD` (e.g., `/setbday 05-24`)", { parse_mode: 'Markdown' });
        }

        let targetUser = msg.from;
        if (msg.reply_to_message) {
            targetUser = msg.reply_to_message.from;
        }

        birthdays = birthdays.filter(b => b.userId !== String(targetUser.id));
        
        birthdays.push({
            userId: String(targetUser.id),
            username: targetUser.username || '',
            name: targetUser.first_name || 'User',
            date: dateMatch
        });
        saveData(BDAY_FILE, birthdays);
        
        return bot.sendMessage(chatId, `🎂 Birthday saved! **${targetUser.first_name}** will be celebrated on **${dateMatch}**.`, { parse_mode: 'Markdown' });
    }

    if (text === '/bdays') {
        if (birthdays.length === 0) return bot.sendMessage(chatId, "📅 No birthdays saved yet.");
        const list = birthdays.sort((a,b) => a.date.localeCompare(b.date)).map(b => `🎂 **${b.name}**: ${b.date}`).join('\n');
        return bot.sendMessage(chatId, `🎈 **Upcoming Birthdays:**\n\n${list}`, { parse_mode: 'Markdown' });
    }

    if (text === '/testbday' && isOwner) {
        bot.sendMessage(chatId, "⏳ Generating test birthday card...");
        return triggerBirthdayCard(chatId, {
            userId: String(msg.from.id),
            username: msg.from.username,
            name: msg.from.first_name,
            date: "TEST"
        });
    }

    // 4. UPDATE CONTEXT & AI
    if (!text.startsWith('/')) addToHistory(name, text);

    if (text === '/ai') {
        return bot.sendMessage(chatId, "What's up?", { reply_to_message_id: msg.message_id });
    }

    if (text.startsWith('/ai ')) {
        const query = text.replace('/ai ', '').trim();
        if (!query) return;
        bot.sendChatAction(chatId, 'typing');
        const response = await askGroq(query);
        return safeReply(chatId, response, msg.message_id);
    }

    if (msg.reply_to_message && msg.reply_to_message.from.id === (await bot.getMe()).id && !text.startsWith('/')) {
        if (eventSetupState[fromId] && msg.reply_to_message.message_id === eventSetupState[fromId].lastPromptId) {
            return; 
        }
        bot.sendChatAction(chatId, 'typing');
        const response = await askGroq(text);
        return safeReply(chatId, response, msg.message_id);
    }

    // 5. MEMORY COMMANDS
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

    // 6. EVENT LIST & DELETE
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

    // 7. UTILITY & OWNER
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
        if ((msg.forward_from || msg.forward_from_chat) && msg.chat.type === 'private') {
            let id = msg.forward_from ? msg.forward_from.id : msg.forward_from_chat.id;
            bot.sendMessage(chatId, `🎯 **ID:** \`${id}\``, { parse_mode: "Markdown" });
        }
    }
});

// ==========================================
// 🕹️ INLINE BUTTON HANDLER (For Wizard Menus)
// ==========================================
bot.on('callback_query', async (query) => {
    const data = query.data;
    const chatId = String(query.message.chat.id);
    const fromId = String(query.from.id);

    const state = eventSetupState[fromId];
    if (!state || state.chatId !== chatId) {
        return bot.answerCallbackQuery(query.id, { text: "This isn't your event setup!", show_alert: true });
    }

    if (data === 'CANCEL_WIZARD') {
        bot.deleteMessage(chatId, query.message.message_id).catch(()=>{});
        delete eventSetupState[fromId];
        return bot.sendMessage(chatId, "🚫 Event creation cancelled.", { reply_to_message_id: state.triggerMsgId });
    }

    // STEP 2: MONTH received -> Generate DAY keyboard
    if (data.startsWith('MONTH_')) {
        state.eventMonth = data.replace('MONTH_', '');
        state.step = 'DAY';
        
        bot.deleteMessage(chatId, query.message.message_id).catch(()=>{}); 

        const currentYear = DateTime.now().year;
        const daysInMonth = DateTime.local(currentYear, parseInt(state.eventMonth)).daysInMonth;

        let dayKb = [];
        let currentRow = [];
        for (let i = 1; i <= daysInMonth; i++) {
            currentRow.push({ text: `${i}`, callback_data: `DAY_${i}` });
            if (currentRow.length === 5 || i === daysInMonth) {
                dayKb.push(currentRow);
                currentRow = [];
            }
        }
        dayKb.push([{ text: "❌ Cancel", callback_data: `CANCEL_WIZARD` }]);

        const prompt = await bot.sendMessage(chatId, "📅 Select the Day:", { 
            reply_markup: { inline_keyboard: dayKb },
            reply_to_message_id: state.triggerMsgId 
        });
        state.lastPromptId = prompt.message_id;
        return bot.answerCallbackQuery(query.id);
    }

    // STEP 3: DAY received -> Move to TIME
    if (data.startsWith('DAY_')) {
        state.eventDay = data.replace('DAY_', '');
        state.step = 'TIME';

        bot.deleteMessage(chatId, query.message.message_id).catch(()=>{}); 

        const prompt = await bot.sendMessage(chatId, "⏰ What time? (e.g., `4:00 PM`)", { 
            parse_mode: 'Markdown',
            reply_to_message_id: state.triggerMsgId 
        });
        state.lastPromptId = prompt.message_id;
        return bot.answerCallbackQuery(query.id);
    }

    // STEP 5: TIMEZONE received -> FINALIZE
    if (data.startsWith('TZ_')) {
        const tz = data.replace('TZ_', '');
        bot.deleteMessage(chatId, query.message.message_id).catch(()=>{}); 

        const tzNames = {
            'America/Los_Angeles': 'PST',
            'America/Chicago': 'CST',
            'America/New_York': 'EST',
            'Europe/London': 'GMT'
        };
        const displayTz = tzNames[tz] || tz;

        let safeTime = state.eventTime.trim().toUpperCase().replace(/\s*([AP]M)/, ' $1');

        let year = DateTime.now().year;
        const dateString = `${state.eventMonth}/${state.eventDay}/${year} ${safeTime}`;
        let eventDate = DateTime.fromFormat(dateString, "M/d/yyyy h:mm a", { zone: tz });

        if (eventDate.isValid && eventDate < DateTime.now()) {
            eventDate = eventDate.plus({ years: 1 });
            year += 1;
        }

        if (!eventDate.isValid) {
            delete eventSetupState[fromId];
            return bot.sendMessage(chatId, `❌ **Format Error!**\nI couldn't understand the time: \`${state.eventTime}\`\nIt must look like \`4:00 PM\`.\nPlease start over with /newevent.`, { parse_mode: 'Markdown', reply_to_message_id: state.triggerMsgId });
        }

        calendarEvents.push({ 
            name: state.eventName, 
            timestamp: eventDate.toMillis(), 
            dateString: `${DateTime.local(year, parseInt(state.eventMonth), parseInt(state.eventDay)).toFormat('MMMM d')} at ${safeTime} (${displayTz})`, 
            chatId: chatId 
        });
        saveData(EVENT_FILE, calendarEvents);

        bot.sendMessage(chatId, `✅ <b>Event Successfully Scheduled!</b>\n\n📝 <b>Name:</b> ${state.eventName}\n📅 <b>Time:</b> ${DateTime.local(year, parseInt(state.eventMonth), parseInt(state.eventDay)).toFormat('MMMM d')} @ ${safeTime}\n🌍 <b>Zone:</b> ${displayTz}\n\n<i>I will pin a reminder when it starts.</i>`, { 
            parse_mode: 'HTML',
            reply_to_message_id: state.triggerMsgId
        });

        delete eventSetupState[fromId];
        return bot.answerCallbackQuery(query.id);
    }
});

console.log('🤖 ULTIMATE MASTER BOT ONLINE.');
