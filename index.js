const TelegramBot = require('node-telegram-bot-api');
const { DateTime } = require('luxon');
const fs = require('fs');
const path = require('path');

const TOKEN = '8184622311:AAGjxKL6mu0XPo9KEkq3XS-6yGbajLuGN2A'; 
const OWNER_IDS = ["190190519", "1122603836"]; 
const TARGET_GROUP_ID = "-1002372844799"; 
const BAN_FILE = path.join(__dirname, 'banned.json');

// 🚀 ENHANCED POLLING
const bot = new TelegramBot(TOKEN, { 
    polling: {
        interval: 100,
        autoStart: true,
        params: {
            // Explicitly request chat_member updates
            allowed_updates: ["message", "chat_member", "my_chat_member"]
        }
    }
});

function loadBans() {
    try {
        if (!fs.existsSync(BAN_FILE)) fs.writeFileSync(BAN_FILE, "[]");
        return JSON.parse(fs.readFileSync(BAN_FILE, "utf8")) || [];
    } catch (e) { return []; }
}

function saveBans(list) {
    const clean = [...new Set(list.map(id => String(id)))];
    fs.writeFileSync(BAN_FILE, JSON.stringify(clean, null, 2));
    return clean;
}

let bannedUsers = saveBans(loadBans());

// ------------------------------------------------------------------
// 🛡️ THE "REAL" INSTANT BAN (Chat Member Update)
// ------------------------------------------------------------------
// This triggers the MOMENT a user joins, even before a "joined" message appears.
bot.on('chat_member', async (event) => {
    const chatId = String(event.chat.id);
    if (chatId !== TARGET_GROUP_ID) return;

    const userId = String(event.new_chat_member.user.id);
    const status = event.new_chat_member.status; // 'member', 'creator', 'administrator', 'restricted', 'left', 'kicked'

    // If the user is entering the chat (status becomes member/restricted)
    if (status === 'member' || status === 'restricted') {
        if (bannedUsers.includes(userId)) {
            console.log(`🚨 BAN TARGET DETECTED JOINING: ${userId}`);
            try {
                await bot.banChatMember(chatId, userId);
                console.log(`✅ Successfully banned ${userId} on join.`);
            } catch (err) {
                console.log(`❌ Failed to ban ${userId}: ${err.message}`);
            }
        }
    }
});

// ------------------------------------------------------------------
// 🛡️ SECONDARY BAN (Service Message / New Chat Members)
// ------------------------------------------------------------------
bot.on('new_chat_members', async (msg) => {
    const chatId = String(msg.chat.id);
    if (chatId !== TARGET_GROUP_ID) return;

    for (const member of msg.new_chat_members) {
        const userId = String(member.id);
        if (bannedUsers.includes(userId)) {
            console.log(`🚨 BAN TARGET DETECTED VIA SERVICE MSG: ${userId}`);
            bot.deleteMessage(chatId, msg.message_id).catch(() => {});
            bot.banChatMember(chatId, userId).catch(() => {});
        }
    }
});

// ------------------------------------------------------------------
// 📩 MESSAGE HANDLING (Text, /when, s/Regex)
// ------------------------------------------------------------------
bot.on('message', async (msg) => {
    if (!msg.chat || !msg.text) return;

    const chatId = String(msg.chat.id);
    const fromId = String(msg.from.id);
    const text = msg.text;

    // 1. Silent ban if they already snuck in
    if (chatId === TARGET_GROUP_ID && bannedUsers.includes(fromId)) {
        bot.deleteMessage(chatId, msg.message_id).catch(() => {});
        bot.banChatMember(chatId, fromId).catch(() => {});
        return;
    }

    // 2. Owner Commands
    if (OWNER_IDS.includes(fromId)) {
        if (text.startsWith("/permban")) {
            const target = text.split(" ")[1];
            if (target && !bannedUsers.includes(target)) {
                bannedUsers.push(target);
                bannedUsers = saveBans(bannedUsers);
                bot.sendMessage(chatId, `✅ Added to Ban Database: \`${target}\``, { parse_mode: "Markdown" });
                bot.banChatMember(chatId, target).catch(() => {});
            }
        }
        if (text.startsWith("/unpermban")) {
            const target = text.split(" ")[1];
            if (target) {
                bannedUsers = bannedUsers.filter(id => id !== target);
                bannedUsers = saveBans(bannedUsers);
                bot.sendMessage(chatId, `✅ Removed from Ban Database: \`${target}\``, { parse_mode: "Markdown" });
                bot.unbanChatMember(chatId, target, { only_if_banned: true }).catch(() => {});
            }
        }
    }

    // 3. /when Command
    if (text.startsWith('/when')) {
        if (!msg.reply_to_message) return bot.sendMessage(chatId, "⚠️ Reply to a message with <code>/when</code>", { parse_mode: 'HTML' });
        
        const targetMsg = msg.reply_to_message;
        const unixTimestamp = targetMsg.forward_date || targetMsg.date;
        const originalDate = DateTime.fromSeconds(unixTimestamp);
        const diff = DateTime.now().diff(originalDate, ['years', 'months', 'days', 'hours', 'minutes', 'seconds']).toObject();

        const timeParts = [];
        ['years', 'months', 'days', 'hours', 'minutes', 'seconds'].forEach(unit => {
            if (diff[unit] > 0 || unit === 'seconds') timeParts.push(`<b>${Math.floor(diff[unit])}</b> ${unit}`);
        });

        const durationString = timeParts.length > 1 ? timeParts.slice(0, -1).join(', ') + ' and ' + timeParts.slice(-1) : timeParts[0];
        const formattedDate = originalDate.toLocaleString(DateTime.DATETIME_MED_WITH_SECONDS);

        bot.sendMessage(chatId, `📅 <b>Original Date:</b>\n${formattedDate}\n\n⏳ <b>This message is:</b>\n${durationString} old`, { 
            parse_mode: 'HTML', 
            reply_to_message_id: targetMsg.message_id 
        });
    }

    // 4. Regex s/search/replace
    if (text.startsWith('s/') && msg.reply_to_message) {
        const originalText = msg.reply_to_message.text || msg.reply_to_message.caption;
        if (!originalText) return;
        const parts = text.slice(2).split('/');
        if (parts.length >= 2) {
            try {
                const regex = new RegExp(parts[0], parts[2] || '');
                const newText = originalText.replace(regex, parts[1]);
                if (newText !== originalText) {
                    bot.sendMessage(chatId, `<i>Did you mean:</i>\n\n${newText}`, { parse_mode: 'HTML', reply_to_message_id: msg.reply_to_message.message_id });
                }
            } catch (e) {}
        }
    }
});

// 5. Forwarded Message ID Detector
bot.on('message', (msg) => {
    if (!OWNER_IDS.includes(String(msg.from.id))) return;
    if (msg.forward_from || msg.forward_from_chat) {
        let targetId = msg.forward_from ? msg.forward_from.id : msg.forward_from_chat.id;
        if (String(targetId) !== String(msg.from.id)) {
            bot.sendMessage(msg.chat.id, `🎯 **Detected ID:** \`${targetId}\``, { parse_mode: "Markdown", reply_to_message_id: msg.message_id });
        }
    }
});

console.log('🤖 BOT ACTIVE.');