const { DateTime } = require('luxon');
const config = require('./config');
const { saveData } = require('./dataManager');

module.exports = function(bot, state) {

    function hasPerm(userId, permName) {
        if (config.OWNER_IDS.includes(String(userId))) return true;
        if (state.delegatedPerms[String(userId)]) {
            if (state.delegatedPerms[String(userId)][permName] === true) return true;
        }
        return false;
    }

    function addToHistory(name, text, replyToName = null) {
        let prefix = replyToName ? `${name} (replying to ${replyToName})` : name;
        state.recentChatHistory.push(`${prefix}: ${text}`);
        if (state.recentChatHistory.length > 15) {
            state.recentChatHistory.shift(); 
        }
    }

    function addToDailyLog(name, text, replyToName = null) {
        const time = DateTime.now().setZone('America/New_York').toFormat('h:mm a');
        let prefix = replyToName ? `${name} (replying to ${replyToName})` : name;
        state.dailyChatLog.push(`[${time}] ${prefix}: ${text}`);
        if (state.dailyChatLog.length > 3000) {
            state.dailyChatLog.shift(); 
        }
        saveData(config.FILES.CHAT_LOG, state.dailyChatLog);
    }

async function isAdmin(bot, chatId, userId, config) {
    // 1. Check hardcoded owner first (using config.OWNER_ID based on your repo)
    if (config && String(userId) === String(config.OWNER_ID)) return true;

    // 2. Private chats always allow the user
    if (chatId > 0) return true;

    try {
        const member = await bot.getChatMember(chatId, userId);
        return ['administrator', 'creator'].includes(member.status);
    } catch (e) {
        // If it's a private chat or API error, return false for safety
        return false;
    }


    // 2. Private Chat bypass
    if (chatId > 0) return true;

    try {
        const member = await bot.getChatMember(chatId, userId);
        console.log(`📊 Telegram Status for ${userId}: ${member.status}`);
        
        return ['administrator', 'creator'].includes(member.status);
    } catch (e) {
        console.error(`❌ API Error for ${userId}:`, e.message);
        return false;
    }
}

    async function safeReply(chatId, text, replyToId = null, parseMode = null) {
        if (!text || String(text).trim() === "") text = "⚠️ Beep boop. Blank response.";
        text = String(text);

        const MAX_LENGTH = 4000; 
        
        const sendChunk = async (chunk, isFirst) => {
            let opts = {};
            if (isFirst && replyToId) opts.reply_to_message_id = replyToId;
            if (parseMode) opts.parse_mode = parseMode;

            try {
                return await bot.sendMessage(chatId, chunk, opts);
            } catch (err) {
                if (parseMode === 'HTML') {
                    delete opts.parse_mode; 
                    const strippedChunk = chunk.replace(/<[^>]*>?/gm, '');
                    return await bot.sendMessage(chatId, strippedChunk, opts).catch(()=>{});
                }
            }
        };

        if (text.length > MAX_LENGTH) {
            const chunks = text.match(new RegExp('.{1,' + MAX_LENGTH + '}', 'gs'));
            let firstMsg = null;
            for (let i = 0; i < chunks.length; i++) {
                let m = await sendChunk(chunks[i], i === 0);
                if (i === 0) firstMsg = m;
            }
            return firstMsg;
        } else {
            return await sendChunk(text, true);
        }
    }

    return { hasPerm, addToHistory, addToDailyLog, isAdmin, safeReply };
};