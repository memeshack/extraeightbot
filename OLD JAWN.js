const TelegramBot = require('node-telegram-bot-api');
const { DateTime } = require('luxon');
const fs = require('fs');
const path = require('path');
const schedule = require('node-schedule');
const { OpenAI } = require('openai'); 
const Jimp = require('jimp'); 
const axios = require('axios'); 
const ffmpeg = require('fluent-ffmpeg');

// ==========================================
// ⚙️ CONFIGURATION
// ==========================================
const TOKEN = '8184622311:AAGjxKL6mu0XPo9KEkq3XS-6yGbajLuGN2A'; 
const OPENROUTER_API_KEY = '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'; 

const OWNER_IDS = ["190190519", "1122603836"]; 
const LOG_ID = "190190519"; 
const TARGET_GROUP_ID = "-1002372844799"; 

const PLUS_CREDIT_STICKER = 'CAACAgEAAyEFAASNbrz_AAEd1dJpm-dtiWat5QqS_RBNswABX3O5_lwAAnAIAAKOYeBENDzyOu1jjt86BA'; 
const MINUS_CREDIT_STICKER = 'CAACAgEAAyEFAASNbrz_AAEd1dNpm-dwbZZnTM8FFslz3QaTTAWn3QACnQcAAo8U4UThtJ_89m0bYDoE'; 

const BAN_FILE = path.join(__dirname, 'banned.json');
const EVENT_FILE = path.join(__dirname, 'events.json');
const MEMORY_FILE = path.join(__dirname, 'memory.json');
const BDAY_FILE = path.join(__dirname, 'birthdays.json');
const REP_FILE = path.join(__dirname, 'rep.json');
const CONFIG_FILE = path.join(__dirname, 'config.json'); 
const CHAT_LOG_FILE = path.join(__dirname, 'chat_log.json'); 
const C4_STAT_FILE = path.join(__dirname, 'c4stats.json'); 
const MUSIC_DB_FILE = path.join(__dirname, 'music.json'); 
const MUSIC_STAT_FILE = path.join(__dirname, 'musicstats.json'); 
const GULAG_FILE = path.join(__dirname, 'gulag.json'); 
const ACTIVITY_FILE = path.join(__dirname, 'activity.json'); 
const PERMS_FILE = path.join(__dirname, 'perms.json'); 
const CRASH_LOG_FILE = path.join(__dirname, 'crash.log'); 

// ==========================================
// 🛡️ ANTI-CRASH SYSTEM
// ==========================================
function logCrash(err, origin) {
    const timestamp = DateTime.now().setZone('America/New_York').toFormat('yyyy-MM-dd HH:mm:ss');
    let errMessage = err?.stack || err?.message || JSON.stringify(err, null, 2);
    
    try {
        fs.appendFileSync(CRASH_LOG_FILE, `\n[${timestamp}] 🚨 ${origin}\n${errMessage}\n---\n`);
        console.log(`⚠️ Crash caught! Bot is still running.`);
        
        if (bot) {
            bot.sendMessage("190190519", `🚨 <b>CRASH REPORT (${origin}):</b>\n<pre>${errMessage.slice(0, 3800)}</pre>`, { parse_mode: 'HTML' }).catch(()=>{});
        }
    } catch (e) {}
}

process.on('unhandledRejection', (reason) => {
    logCrash(reason, 'unhandledRejection');
});

process.on('uncaughtException', (err) => {
    logCrash(err, 'uncaughtException');
});

// Initialize Bot
const bot = new TelegramBot(TOKEN, { polling: { interval: 100, autoStart: true } });

bot.on('polling_error', (error) => {
    logCrash(error, 'Polling Error');
});

let botId = null;
let botUsername = null;
bot.getMe().then(me => {
    botId = String(me.id);
    botUsername = me.username;
});

const openai = new OpenAI({ 
    baseURL: "https://openrouter.ai/api/v1", 
    apiKey: OPENROUTER_API_KEY 
});

// ==========================================
// 💾 DATABASE & STATE LOADING
// ==========================================
const loadData = (file) => { 
    try { 
        if (!fs.existsSync(file)) return []; 
        const d = fs.readFileSync(file, "utf8"); 
        if (d.trim()) return JSON.parse(d);
        return [];
    } catch (e) { return []; } 
};

const loadObjectData = (file) => { 
    try { 
        if (!fs.existsSync(file)) return {}; 
        const d = fs.readFileSync(file, "utf8"); 
        if (d.trim()) return JSON.parse(d);
        return {};
    } catch (e) { return {}; } 
};

const saveData = (file, data) => {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
};

let bannedUsers = loadData(BAN_FILE);
let calendarEvents = loadData(EVENT_FILE);
let botMemories = loadData(MEMORY_FILE);
let birthdays = loadData(BDAY_FILE);
let reputations = loadObjectData(REP_FILE); 
let dailyChatLog = loadData(CHAT_LOG_FILE); 
let c4Stats = loadObjectData(C4_STAT_FILE); 
let musicStats = loadObjectData(MUSIC_STAT_FILE); 
let gulagStats = loadObjectData(GULAG_FILE); 
let activityStats = loadObjectData(ACTIVITY_FILE);
let delegatedPerms = loadObjectData(PERMS_FILE);

let musicDB = loadObjectData(MUSIC_DB_FILE); 
if (Object.keys(musicDB).length === 0) {
    musicDB = {
        "2010s Pop": [
            { "query": "Call Me Maybe Carly Rae", "name": "Call Me Maybe - Carly Rae Jepsen", "answers": ["call me maybe"] },
            { "query": "Uptown Funk Bruno Mars", "name": "Uptown Funk - Bruno Mars", "answers": ["uptown funk"] }
        ],
        "Classic Rap": [
            { "query": "Lose Yourself Eminem", "name": "Lose Yourself - Eminem", "answers": ["lose yourself"] }
        ]
    };
    saveData(MUSIC_DB_FILE, musicDB);
}

let botConfig = loadObjectData(CONFIG_FILE);
if (!botConfig.aiModel) botConfig.aiModel = "google/gemini-2.5-flash";
if (!botConfig.aiPersona) botConfig.aiPersona = "You are a rude nonchalant telegram bully that thinks they are so tuff. Keep messages somewhat short.";
if (botConfig.welcomeText === undefined) botConfig.welcomeText = "Welcome {name} to the chat!";
if (botConfig.leaveText === undefined) botConfig.leaveText = "Goodbye {name}.";
if (botConfig.chatLink === undefined) botConfig.chatLink = "";
if (botConfig.verifyMode === undefined) botConfig.verifyMode = "none"; // none, talk, media
if (botConfig.activityResetHour === undefined) botConfig.activityResetHour = 0; // Midnight EST default

let isAiEnabled = true; 
let repCooldowns = {}; 
let eventSetupState = {}; 
let eventEditState = {}; 
let addSongState = {}; 
let recentChatHistory = []; 
let aiMessageIds = []; // ⚠️ Tracks AI messages strictly

const activeC4Games = {};
const activeMusicGames = {};
const pendingMusicGames = {}; 

function hasPerm(userId, permName) {
    if (OWNER_IDS.includes(String(userId))) {
        return true;
    }
    if (delegatedPerms[String(userId)]) {
        if (delegatedPerms[String(userId)][permName] === true) {
            return true;
        }
    }
    return false;
}

function addToHistory(name, text, replyToName = null) {
    let prefix = "";
    if (replyToName) {
        prefix = `${name} (replying to ${replyToName})`;
    } else {
        prefix = name;
    }
    recentChatHistory.push(`${prefix}: ${text}`);
    if (recentChatHistory.length > 15) {
        recentChatHistory.shift(); 
    }
}

function addToDailyLog(name, text, replyToName = null) {
    const time = DateTime.now().setZone('America/New_York').toFormat('h:mm a');
    let prefix = "";
    if (replyToName) {
        prefix = `${name} (replying to ${replyToName})`;
    } else {
        prefix = name;
    }
    dailyChatLog.push(`[${time}] ${prefix}: ${text}`);
    if (dailyChatLog.length > 3000) {
        dailyChatLog.shift(); 
    }
    saveData(CHAT_LOG_FILE, dailyChatLog);
}

async function isAdmin(chatId, userId) {
    if (OWNER_IDS.includes(String(userId))) {
        return true;
    }
    try {
        const member = await bot.getChatMember(chatId, userId);
        if (['administrator', 'creator'].includes(member.status)) {
            return true;
        } else {
            return false;
        }
    } catch (e) { 
        return false; 
    }
}

async function safeReply(chatId, text, replyToId = null, parseMode = null) {
    if (!text || String(text).trim() === "") {
        text = "⚠️ Beep boop. Blank response.";
    }
    text = String(text);

    const MAX_LENGTH = 4000; 
    
    const sendChunk = async (chunk, isFirst) => {
        let opts = {};
        if (isFirst && replyToId) {
            opts.reply_to_message_id = replyToId;
        }
        if (parseMode) {
            opts.parse_mode = parseMode;
        }

        try {
            let sentMsg = await bot.sendMessage(chatId, chunk, opts);
            return sentMsg;
        } catch (err) {
            if (parseMode === 'HTML') {
                delete opts.parse_mode; 
                const strippedChunk = chunk.replace(/<[^>]*>?/gm, '');
                let fallbackMsg = await bot.sendMessage(chatId, strippedChunk, opts).catch(()=>{});
                return fallbackMsg;
            }
        }
    };

    if (text.length > MAX_LENGTH) {
        const chunks = text.match(new RegExp('.{1,' + MAX_LENGTH + '}', 'gs'));
        let firstMsg = null;
        for (let i = 0; i < chunks.length; i++) {
            let isFirstChunk = (i === 0);
            let m = await sendChunk(chunks[i], isFirstChunk);
            if (isFirstChunk) firstMsg = m;
        }
        return firstMsg;
    } else {
        let m = await sendChunk(text, true);
        return m;
    }
}

// ==========================================
// 🎧 GUESS THE SONG ENGINE 
// ==========================================
async function startMusicRound(chatId) {
    const game = activeMusicGames[chatId];
    if (!game) { return; }
    if (game.round > game.maxRounds) {
        await endMusicGame(chatId);
        return;
    }
    if (game.pool.length === 0) {
        await endMusicGame(chatId);
        return; 
    }
    
    game.status = 'loading'; 
    const songIdx = Math.floor(Math.random() * game.pool.length);
    game.currentSong = game.pool[songIdx];
    game.pool.splice(songIdx, 1); 

    await bot.sendMessage(chatId, `🎵 <b>Round ${game.round} / ${game.maxRounds}</b>`, { parse_mode: 'HTML' });

    try {
        const encodedQuery = encodeURIComponent(game.currentSong.query);
        const searchUrl = `https://itunes.apple.com/search?term=${encodedQuery}&entity=song&limit=1`;
        const response = await axios.get(searchUrl);
        
        if (response.data.results && response.data.results.length > 0 && response.data.results[0].previewUrl) {
            const audioUrl = response.data.results[0].previewUrl;
            const audioReq = await axios.get(audioUrl, { responseType: 'arraybuffer' });
            
            const tempIn = path.join(__dirname, `temp_in_${chatId}.m4a`);
            const tempOut = path.join(__dirname, `temp_out_${chatId}.ogg`);
            fs.writeFileSync(tempIn, Buffer.from(audioReq.data));

            const randomStart = Math.floor(Math.random() * 23); 

            ffmpeg(tempIn)
                .setStartTime(randomStart)
                .setDuration(7)
                .audioCodec('libopus') 
                .format('ogg')
                .output(tempOut)
                .on('end', async () => {
                    await bot.sendVoice(chatId, fs.createReadStream(tempOut), { caption: "🎤 You have 30 seconds to guess!" });
                    
                    try { fs.unlinkSync(tempIn); } catch(e) {}
                    try { fs.unlinkSync(tempOut); } catch(e) {}

                    game.status = 'playing';

                    game.timer = setTimeout(async () => {
                        if (activeMusicGames[chatId] && activeMusicGames[chatId].round === game.round) {
                            game.status = 'loading'; 
                            await bot.sendMessage(chatId, `⏰ <b>Time's up!</b>\nThe song was: <b>${game.currentSong.name}</b>`, { parse_mode: 'HTML' });
                            activeMusicGames[chatId].round += 1;
                            setTimeout(() => { startMusicRound(chatId); }, 4000); 
                        }
                    }, 30000);
                })
                .on('error', async (err) => {
                    await bot.sendMessage(chatId, "⚠️ Audio processing failed! Skipping...");
                    try { fs.unlinkSync(tempIn); } catch(e) {}
                    game.round += 1;
                    setTimeout(() => { startMusicRound(chatId); }, 3000);
                })
                .run();

        } else {
            await bot.sendMessage(chatId, "⚠️ Couldn't find the audio for this song on iTunes! Skipping round...");
            game.round += 1;
            setTimeout(() => { startMusicRound(chatId); }, 3000);
        }
    } catch (err) {
        await bot.sendMessage(chatId, "⚠️ iTunes API Error. Skipping round...");
        game.round += 1;
        setTimeout(() => { startMusicRound(chatId); }, 3000);
    }
}

async function endMusicGame(chatId) {
    const game = activeMusicGames[chatId];
    if (!game) { return; }
    
    let scores = Object.values(game.scores).sort((a,b) => b.score - a.score);
    let msg = `🏁 <b>SONG QUIZ OVER!</b>\n━━━━━━━━━━\n\n`;
    
    if (scores.length === 0) {
        msg += "Nobody scored any points. Better luck next time!";
    } else {
        let maxScore = scores[0].score;
        let winners = scores.filter(p => p.score === maxScore);
        
        if (winners.length === 1) {
            msg += `🏆 <b>${winners[0].name} WINS!</b>\n\n`;
        } else {
            msg += `🏆 <b>IT'S A TIE!</b>\n\n`;
        }
        
        scores.forEach((p, i) => {
            msg += `<b>${i+1}. ${p.name}</b> - ${p.score} Points\n`;
            if (!musicStats[p.id]) {
                musicStats[p.id] = { name: p.name, points: 0, wins: 0 };
            }
            musicStats[p.id].points += p.score;
        });

        winners.forEach(w => {
            musicStats[w.id].wins += 1;
        });
        saveData(MUSIC_STAT_FILE, musicStats);
    }
    
    await bot.sendMessage(chatId, msg, { parse_mode: 'HTML' });
    delete activeMusicGames[chatId];
}

// ==========================================
// 🎮 CONNECT 4 ENGINE
// ==========================================
function createC4Board() {
    let board = [];
    for (let r = 0; r < 6; r++) {
        let row = [];
        for (let c = 0; c < 7; c++) {
            row.push(0);
        }
        board.push(row);
    }
    return board;
}

function checkC4Win(board, player) {
    for (let r = 0; r < 6; r++) {
        for (let c = 0; c < 4; c++) {
            if (board[r][c] == player && board[r][c+1] == player && board[r][c+2] == player && board[r][c+3] == player) {
                return [[r,c], [r,c+1], [r,c+2], [r,c+3]];
            }
        }
    }
    for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 7; c++) {
            if (board[r][c] == player && board[r+1][c] == player && board[r+2][c] == player && board[r+3][c] == player) {
                return [[r,c], [r+1,c], [r+2,c], [r+3,c]];
            }
        }
    }
    for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 4; c++) {
            if (board[r][c] == player && board[r+1][c+1] == player && board[r+2][c+2] == player && board[r+3][c+3] == player) {
                return [[r,c], [r+1,c+1], [r+2,c+2], [r+3,c+3]];
            }
        }
    }
    for (let r = 3; r < 6; r++) {
        for (let c = 0; c < 4; c++) {
            if (board[r][c] == player && board[r-1][c+1] == player && board[r-2][c+2] == player && board[r-3][c+3] == player) {
                return [[r,c], [r-1,c+1], [r-2,c+2], [r-3,c+3]];
            }
        }
    }
    return false;
}

function renderC4Message(game) {
    if (game.status === 'waiting') {
        return {
            text: `🎮 <b>CONNECT 4</b>\n\n<b>${game.p1.name}</b> is waiting for an opponent...`,
            kb: [[{text: "⚔️ Join Game", callback_data: `C4_JOIN_${game.id}`}]]
        };
    }

    const emojis = { 0: '⚪', 1: '🔴', 2: '🟡', 3: '💎' };
    let boardText = `🎮 <b>CONNECT 4</b>\n🔴 <b>${game.p1.name}</b> vs 🟡 <b>${game.p2.name}</b>\n\n`;
    let kb = [];
    
    for (let r = 0; r < 6; r++) {
        let row = [];
        for (let c = 0; c < 7; c++) {
            let cbData = "";
            if (game.status === 'playing') {
                cbData = `C4_DROP_${game.id}_${c}`;
            } else {
                cbData = `IGNORE`;
            }
            row.push({ 
                text: emojis[game.board[r][c]], 
                callback_data: cbData 
            });
        }
        kb.push(row);
    }

    if (game.status === 'playing') {
        let currentPlayerName = "";
        let currentEmoji = "";
        if (game.turn === 1) {
            currentPlayerName = game.p1.name;
            currentEmoji = '🔴';
        } else {
            currentPlayerName = game.p2.name;
            currentEmoji = '🟡';
        }
        boardText += `<i>${currentEmoji} ${currentPlayerName}'s turn! Tap any column to drop your piece.</i>`;
        kb.push([{text: "🛑 Forfeit / Cancel", callback_data: `C4_LEAVE_${game.id}`}]);
    } else if (game.status === 'won') {
        let winnerName = "";
        let winnerEmoji = "";
        if (game.winner === 1) {
            winnerName = game.p1.name;
            winnerEmoji = '🔴';
        } else {
            winnerName = game.p2.name;
            winnerEmoji = '🟡';
        }
        boardText += `🏆 <b>${winnerEmoji} ${winnerName} WINS!</b>`;
    } else if (game.status === 'draw') {
        boardText += `🤝 <b>IT'S A DRAW!</b> The board is full.`;
    } else if (game.status === 'forfeit') {
        boardText += `🛑 <b>Game was Cancelled/Forfeited.</b>`;
    }
    
    return { text: boardText, kb: kb };
}

// ==========================================
// 📅 EVENT MENU RENDERERS
// ==========================================
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
        let isSel = "";
        if (selected.includes(opt.val)) {
            isSel = '✅ ';
        }
        row.push({ 
            text: `${isSel}${opt.label}`, 
            callback_data: `REM_TOGGLE_${opt.val}` 
        });
        
        if (row.length === 2) { 
            kb.push(row); 
            row = []; 
        }
    }
    if (row.length > 0) {
        kb.push(row);
    }
    kb.push([{ text: "➡️ Finish & Save Event", callback_data: `REM_DONE` }]);
    kb.push([{ text: "❌ Cancel", callback_data: `CANCEL` }]);
    return kb;
}

async function renderPublicEventList(chatId, msgIdToEdit, userId, replyToId = null) {
    calendarEvents.sort((a,b) => {
        return a.timestamp - b.timestamp;
    });
    
    let list = "📅 No upcoming events.";
    let kb = [];
    
    if (calendarEvents.length > 0) {
        let eventStrings = [];
        for (let i = 0; i < calendarEvents.length; i++) {
            let ev = calendarEvents[i];
            eventStrings.push(`${i+1}. <b>${ev.name}</b> - ${ev.dateString}`);
        }
        list = `🗓️ <b>Upcoming Events:</b>\n\n${eventStrings.join('\n')}`;
        
        for (let i = 0; i < calendarEvents.length; i++) {
            let ev = calendarEvents[i];
            let evId = ev.id;
            if (!evId) {
                evId = String(ev.timestamp);
            }
            kb.push([{ 
                text: `🔔 Remind Me: ${ev.name}`, 
                callback_data: `EVSUB_${evId}` 
            }]);
        }
    }
    
    let adminStatus = await isAdmin(chatId, userId);
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
        if (replyToId) {
            opts.reply_to_message_id = replyToId;
        }
        await bot.sendMessage(chatId, list, opts);
    }
}

async function renderAdminEditList(chatId, msgId, userId) {
    calendarEvents.sort((a,b) => {
        return a.timestamp - b.timestamp;
    });
    
    let list = "📅 No upcoming events.";
    if (calendarEvents.length > 0) {
        let eventStrings = [];
        for (let i = 0; i < calendarEvents.length; i++) {
            let ev = calendarEvents[i];
            eventStrings.push(`${i+1}. <b>${ev.name}</b> - ${ev.dateString}`);
        }
        list = `🗓️ <b>Select an Event to Edit/Delete:</b>\n\n${eventStrings.join('\n')}`;
    }
    
    let kb = [];
    for (let i = 0; i < calendarEvents.length; i++) {
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
    calendarEvents.sort((a,b) => {
        return a.timestamp - b.timestamp;
    });
    const ev = calendarEvents[idx];
    
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
        saveData(EVENT_FILE, calendarEvents); 
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
    const ev = calendarEvents[idx];
    if (!ev) {
        return;
    }
    if (!ev.reminders) {
        ev.reminders = [];
    }
    
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
        let isSel = "";
        if (ev.reminders.includes(opt.val)) {
            isSel = '✅ ';
        }
        row.push({ 
            text: `${isSel}${opt.label}`, 
            callback_data: `EV_TOG_REM_${idx}_${opt.val}_${userId}` 
        });
        
        if (row.length === 2) { 
            kb.push(row); 
            row = []; 
        }
    }
    if (row.length > 0) {
        kb.push(row);
    }
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

// ==========================================
// 🎂 BIRTHDAY ENGINE 
// ==========================================
async function triggerBirthdayCard(chatId, bday) {
    try {
        const profilePhotos = await bot.getUserProfilePhotos(bday.userId, { limit: 1 });
        let imageBuffer = null;
        
        if (profilePhotos.total_count > 0) {
            const photos = profilePhotos.photos[0];
            const imageUrl = await bot.getFileLink(photos[photos.length - 1].file_id);
            const image = await Jimp.read(imageUrl);
            const confettiPath = path.join(__dirname, 'confetti.png');
            
            if (fs.existsSync(confettiPath)) {
                try {
                    const confetti = await Jimp.read(confettiPath);
                    confetti.resize(image.bitmap.width, image.bitmap.height);
                    image.composite(confetti, 0, 0);
                } catch (err) { }
            }

            const fontWhite = await Jimp.loadFont(Jimp.FONT_SANS_64_WHITE);
            const fontBlack = await Jimp.loadFont(Jimp.FONT_SANS_64_BLACK);
            const textStr = "HAPPY BIRTHDAY";
            
            image.print(fontBlack, 2, 2, { text: textStr, alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER, alignmentY: Jimp.VERTICAL_ALIGN_BOTTOM }, image.bitmap.width, image.bitmap.height - 40);
            image.print(fontWhite, 0, 0, { text: textStr, alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER, alignmentY: Jimp.VERTICAL_ALIGN_BOTTOM }, image.bitmap.width, image.bitmap.height - 42);

            imageBuffer = await image.getBufferAsync(Jimp.MIME_JPEG);
        }

        let tag = "";
        if (bday.username) {
            tag = `@${bday.username}`;
        } else {
            tag = `[${bday.name}](tg://user?id=${bday.userId})`;
        }
        
        const caption = `🎉 🎂 <b>HAPPY BIRTHDAY ${tag}!</b> 🎂 🎉`;

        let sentMsg;
        if (imageBuffer) {
            sentMsg = await bot.sendPhoto(chatId, imageBuffer, { caption: caption, parse_mode: 'HTML' });
        } else {
            sentMsg = await bot.sendMessage(chatId, caption, { parse_mode: 'HTML' });
        }

        if (sentMsg && sentMsg.message_id) {
            setTimeout(async () => {
                try { 
                    await bot.pinChatMessage(chatId, sentMsg.message_id, { disable_notification: true }); 
                } catch (e) {}
            }, 1000); 
        }
    } catch (e) {}
}

// ==========================================
// ⏰ DAILY / HOURLY SCHEDULERS 
// ==========================================

// Birthday and Gulag Reset Scheduler (9 AM EST)
const bdayRule = new schedule.RecurrenceRule();
bdayRule.hour = 9; 
bdayRule.minute = 0; 
bdayRule.tz = 'America/New_York'; 
schedule.scheduleJob(bdayRule, async () => {
    const today = DateTime.now().setZone('America/New_York').toFormat('MM-dd');
    
    for (let i = 0; i < birthdays.length; i++) {
        let bday = birthdays[i];
        if (bday.date === today) {
            await triggerBirthdayCard(TARGET_GROUP_ID, bday);
        }
    }
    
    gulagStats = {};
    saveData(GULAG_FILE, gulagStats);
    console.log('🔄 Gulag stats wiped clean at 9:00 AM EST.');
});

// Daily Chat Log Reset Scheduler (5 AM EST)
const logResetRule = new schedule.RecurrenceRule();
logResetRule.hour = 5; 
logResetRule.minute = 0; 
logResetRule.tz = 'America/New_York';
schedule.scheduleJob(logResetRule, () => {
    dailyChatLog = [];
    saveData(CHAT_LOG_FILE, dailyChatLog);
    console.log('🔄 Daily chat log wiped clean at 5:00 AM EST.');
});

// Activity Leaderboard Reset Scheduler (Every minute check for dynamic hour)
schedule.scheduleJob('0 * * * *', async () => {
    const now = DateTime.now().setZone('America/New_York');
    if (now.hour === botConfig.activityResetHour) {
        
        let arr = Object.values(activityStats).sort((a,b) => b.count - a.count);
        let msg = `📊 <b>Final Activity Leaderboard Before Reset</b>\n━━━━━━━━━━\n\n`;
        
        if (arr.length === 0) {
            msg += "No messages sent.";
        } else {
            for (let i = 0; i < Math.min(arr.length, 25); i++) {
                msg += `${i + 1}. ${arr[i].name}: <b>${arr[i].count} msgs</b>\n`;
            }
        }
        
        await safeReply(LOG_ID, msg, null, 'HTML');
        
        activityStats = {};
        saveData(ACTIVITY_FILE, activityStats);
        console.log(`🔄 Activity stats wiped clean at ${botConfig.activityResetHour}:00 EST.`);
    }
});

// Master Event Scheduler (Every Minute)
schedule.scheduleJob('* * * * *', async () => {
    const now = DateTime.now().toMillis();
    let changed = false;
    
    const timeLabels = { 
        15: '15 MINUTES', 
        30: '30 MINUTES', 
        60: '1 HOUR', 
        120: '2 HOURS', 
        1440: '1 DAY' 
    };
    
    for (let i = calendarEvents.length - 1; i >= 0; i--) {
        let ev = calendarEvents[i];
        let invisibleTags = '';
        if (ev.subscribers && ev.subscribers.length > 0) {
            let tagsArray = [];
            for (let j = 0; j < ev.subscribers.length; j++) {
                tagsArray.push(`<a href="tg://user?id=${ev.subscribers[j]}">&#8203;</a>`);
            }
            invisibleTags = tagsArray.join('');
        }
        
        if (!ev.sentReminders) {
            ev.sentReminders = [];
        }
        
        if (ev.reminders && ev.reminders.length > 0) {
            for (let j = 0; j < ev.reminders.length; j++) {
                let mins = ev.reminders[j];
                let remTime = ev.timestamp - (mins * 60000);
                
                if (now >= remTime && now < remTime + (5 * 60000) && !ev.sentReminders.includes(mins)) {
                    let timeStr = timeLabels[mins];
                    if (!timeStr) {
                        timeStr = `${mins} MINUTES`;
                    }
                    const alert = `📣 <b>HAPPENING IN ${timeStr}!</b> 🎱\n\n${ev.name}${invisibleTags}`;
                    try {
                        const sentMsg = await bot.sendMessage(ev.chatId, alert, { parse_mode: 'HTML' });
                        await bot.pinChatMessage(ev.chatId, sentMsg.message_id, { disable_notification: true });
                    } catch(e) {}
                    ev.sentReminders.push(mins);
                    changed = true;
                } else if (now >= remTime + (5 * 60000) && !ev.sentReminders.includes(mins)) {
                    ev.sentReminders.push(mins);
                    changed = true;
                }
            }
        }

        if (now >= ev.timestamp) {
            const alert = `📣 <b>HAPPENING NOW!</b> 🎱\n\n${ev.name}${invisibleTags}`;
            try {
                const sentMsg = await bot.sendMessage(ev.chatId, alert, { parse_mode: 'HTML' });
                await bot.pinChatMessage(ev.chatId, sentMsg.message_id, { disable_notification: true });
            } catch (e) {}
            calendarEvents.splice(i, 1);
            changed = true;
        }
    }
    if (changed) {
        saveData(EVENT_FILE, calendarEvents);
    }
});

// ==========================================
// 🧠 SMART AI & TRANSLATION ENGINES
// ==========================================
function formatAiToHtml(str) {
    let newStr = str;
    newStr = newStr.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    newStr = newStr.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
    newStr = newStr.replace(/(?<!\w)\*(.*?)\*(?!\w)/g, '<i>$1</i>');
    newStr = newStr.replace(/`(.*?)`/g, '<code>$1</code>');    
    return newStr;
}

async function askAI(userPrompt) {
    try {
        let recentMems = botMemories.slice(-2);
        
        let words = userPrompt.toLowerCase().split(/\W+/);
        let keywords = [];
        for (let i = 0; i < words.length; i++) {
            if (words[i].length > 3) {
                keywords.push(words[i]);
            }
        }
        
        let matchedMems = [];
        for (let i = 0; i < botMemories.length; i++) {
            let mem = botMemories[i];
            let memLower = mem.toLowerCase();
            let matchFound = false;
            for (let j = 0; j < keywords.length; j++) {
                if (memLower.includes(keywords[j])) {
                    matchFound = true;
                    break;
                }
            }
            if (matchFound) {
                matchedMems.push(mem);
            }
        }
        
        let combined = [...recentMems, ...matchedMems];
        let uniqueSet = new Set(combined);
        let finalMemories = [...uniqueSet].slice(-5);
        
        let memoryList = "No past memories.";
        if (finalMemories.length > 0) {
            memoryList = finalMemories.join("\n");
        }
        
        const contextList = recentChatHistory.join("\n");

        const systemMessage = `${botConfig.aiPersona}\n\n🧠 MEMORIES:\n${memoryList}\n\n💬 RECENT CHAT:\n${contextList}\n\n🔴 RULE: If user shares a NEW fact, output "SAVE_MEM: <fact>" at the end of your message. Use standard markdown for formatting.`;

        const chatCompletion = await openai.chat.completions.create({
            model: botConfig.aiModel, 
            messages: [
                { role: "system", content: systemMessage }, 
                { role: "user", content: userPrompt }
            ],
            temperature: 0.7, 
            max_tokens: 1024,
        });

        let response = "";
        if (chatCompletion.choices && chatCompletion.choices.length > 0 && chatCompletion.choices[0].message) {
            response = chatCompletion.choices[0].message.content;
        }
        
        if (!response || response.trim() === "") {
            return "⚠️ API returned blank.";
        }

        if (response.includes("SAVE_MEM:")) {
            const parts = response.split("SAVE_MEM:");
            const cleanResponse = parts[0].trim();
            const memoryToSave = parts[1].trim();

            if (memoryToSave && !botMemories.includes(memoryToSave)) {
                botMemories.push(memoryToSave); 
                saveData(MEMORY_FILE, botMemories);
                safeReply(LOG_ID, `🧠 <b>Learned:</b> ${formatAiToHtml(memoryToSave)}`, null, 'HTML');
            }
            return formatAiToHtml(cleanResponse);
        }
        
        return formatAiToHtml(response);
    } catch (error) { 
        return `⚠️ <b>AI Error:</b> ${error.message}`; 
    }
}

async function translateText(textToTranslate) {
    try {
        const systemMessage = `Translate the following text to English. Provide ONLY the direct translation, with absolutely no conversational filler, quotes, or formatting.`;

        const chatCompletion = await openai.chat.completions.create({
            model: botConfig.aiModel, 
            messages: [
                { role: "system", content: systemMessage }, 
                { role: "user", content: textToTranslate }
            ],
            temperature: 0.3, 
            max_tokens: 1024,
        });

        let response = "";
        if (chatCompletion.choices && chatCompletion.choices.length > 0 && chatCompletion.choices[0].message) {
            response = chatCompletion.choices[0].message.content;
        }
        
        if (!response || response.trim() === "") {
            return "⚠️ Translation API returned blank.";
        }
        return response;
    } catch (error) {
        return `⚠️ <b>Translation Error:</b> ${error.message}`;
    }
}

async function askSummarizer() {
    try {
        if (dailyChatLog.length < 5) {
            return "Not enough messages today to summarize yet. Tell everyone to wake up and talk!";
        }
        
        const logText = dailyChatLog.join("\n");
        const systemMessage = `You are a helpful, professional, and concise group chat summarizer. 
        You are reading a chat log that started at 5:00 AM EST today. 
        Analyze the log and provide a clean summary of what happened. 
        Group it by major topics, mention key decisions or events, and highlight any particularly funny or notable quotes. 
        Do not roleplay or act rude. Be clear, easy to read, and use standard markdown formatting (e.g. **bold** for emphasis).`;

        const chatCompletion = await openai.chat.completions.create({
            model: botConfig.aiModel, 
            messages: [
                { role: "system", content: systemMessage }, 
                { role: "user", content: `Here is the chat log so far today:\n\n${logText}` }
            ],
            temperature: 0.5, 
            max_tokens: 1500, 
        });

        let response = "";
        if (chatCompletion.choices && chatCompletion.choices.length > 0 && chatCompletion.choices[0].message) {
            response = chatCompletion.choices[0].message.content;
        }
        
        if (!response || response.trim() === "") {
            return "⚠️ Summarizer API returned blank.";
        }

        return `📊 <b>Daily Chat Summary (Since 5 AM)</b>\n━━━━━━━━━━\n\n${formatAiToHtml(response)}`;
    } catch (error) { 
        return `⚠️ <b>Summarizer Error:</b> ${error.message}`; 
    }
}

// ==========================================
// 🛡️ SECURITY & WELCOME/LEAVE ENGINE
// ==========================================
bot.on('chat_member', async (event) => {
    const chatId = String(event.chat.id); 
    const userId = String(event.new_chat_member.user.id);
    
    // BAN CHECK
    if (chatId === TARGET_GROUP_ID) {
        if (['member', 'restricted'].includes(event.new_chat_member.status)) {
            if (bannedUsers.includes(userId)) {
                bot.banChatMember(chatId, userId).catch(() => {});
                return;
            }
        }
    }
});

// ==========================================
// 📩 MAIN MESSAGE HANDLING
// ==========================================
bot.on('message', async (msg) => {
    
    const chatId = String(msg.chat.id); 
    const fromId = String(msg.from.id);
    
    let name = "User";
    if (msg.from && msg.from.first_name) {
        name = msg.from.first_name;
    }
    
    let text = "";
    if (msg.text) {
        text = msg.text;
    } else if (msg.caption) {
        text = msg.caption;
    }

    // 🚪 WELCOME / LEAVE LISTENER
    if (msg.new_chat_members) {
        for (let i = 0; i < msg.new_chat_members.length; i++) {
            let newMember = msg.new_chat_members[i];
            if (String(newMember.id) === botId) {
                continue;
            }
            
            let welcomeMsg = botConfig.welcomeText.replace('{name}', newMember.first_name);
            
            if (botConfig.verifyMode === 'talk' || botConfig.verifyMode === 'media') {
                let perms = {};
                if (botConfig.verifyMode === 'talk') {
                    perms = {
                        can_send_messages: false,
                        can_send_media_messages: false,
                        can_send_polls: false,
                        can_send_other_messages: false
                    };
                } else if (botConfig.verifyMode === 'media') {
                    perms = {
                        can_send_messages: true,
                        can_send_media_messages: false,
                        can_send_polls: false,
                        can_send_other_messages: false
                    };
                }
                
                try {
                    await bot.restrictChatMember(chatId, newMember.id, { permissions: perms });
                } catch(e) {}
                
                let kb = [[{ text: "✅ Tap to Verify", url: `https://t.me/${botUsername}?start=verify_${chatId}` }]];
                await bot.sendMessage(chatId, welcomeMsg, { parse_mode: 'HTML', reply_markup: { inline_keyboard: kb } });
            } else {
                await bot.sendMessage(chatId, welcomeMsg, { parse_mode: 'HTML' });
            }
        }
    }

    if (msg.left_chat_member) {
        if (botConfig.chatLink && botConfig.chatLink !== "") {
            let leftMsg = botConfig.leaveText.replace('{name}', msg.left_chat_member.first_name);
            let dmText = `${leftMsg}\n\nHere is the link if you want to return: ${botConfig.chatLink}`;
            await bot.sendMessage(msg.left_chat_member.id, dmText).catch(()=>{});
        }
    }

    // 🔒 DEEP LINK VERIFICATION LISTENER (IN PRIVATE DMs)
    if (msg.chat && msg.chat.type === 'private') {
        if (text.startsWith('/start verify_')) {
            let targetGroup = text.split('_')[1];
            let kb = [[{ text: "📜 I Accept the Rules", callback_data: `VERIFY_ACCEPT_${targetGroup}` }]];
            await bot.sendMessage(chatId, "Welcome! Please accept the rules to gain full permissions in the group.", { reply_markup: { inline_keyboard: kb }});
            return;
        }
        
        if (OWNER_IDS.includes(fromId)) {
            if (msg.sticker) {
                return bot.sendMessage(chatId, `🎯 <b>Sticker ID:</b>\n<code>${msg.sticker.file_id}</code>\n\n<i>Copy and paste this into the code!</i>`, { parse_mode: 'HTML' });
            }
        }
    }

    if (!msg.chat) return;
    if (text === "") return;
    
    const isTargetGroup = (chatId === TARGET_GROUP_ID);
    const isOwner = OWNER_IDS.includes(fromId);

    if (!isTargetGroup && !isOwner) {
        return;
    }

    if (isTargetGroup && bannedUsers.includes(fromId)) {
        bot.deleteMessage(chatId, msg.message_id).catch(()=>{});
        bot.banChatMember(chatId, fromId).catch(()=>{});
        return;
    }

    let dataChanged = false;
    
    // 📈 UPDATE DATABASES & ACTIVITY LEADERBOARD
    if (!activityStats[fromId]) {
        activityStats[fromId] = { name: name, count: 0 };
        dataChanged = true;
    }
    
    if (activityStats[fromId].name !== name) {
        activityStats[fromId].name = name;
        dataChanged = true;
    }
    
    if (!text.startsWith('/')) {
        activityStats[fromId].count += 1;
        dataChanged = true;
    }

    if (reputations[fromId]) {
        if (reputations[fromId].name !== name) { 
            reputations[fromId].name = name; 
            dataChanged = true; 
        }
    }
    if (c4Stats[fromId]) {
        if (c4Stats[fromId].name !== name) { 
            c4Stats[fromId].name = name; 
            dataChanged = true; 
        }
    }
    if (musicStats[fromId]) {
        if (musicStats[fromId].name !== name) {
            musicStats[fromId].name = name;
            dataChanged = true;
        }
    }
    
    let bdayIndex = -1;
    for (let i = 0; i < birthdays.length; i++) {
        if (birthdays[i].userId === fromId) {
            bdayIndex = i;
            break;
        }
    }
    
    if (bdayIndex !== -1) {
        if (birthdays[bdayIndex].name !== name || birthdays[bdayIndex].username !== (msg.from.username || '')) {
            birthdays[bdayIndex].name = name; 
            birthdays[bdayIndex].username = msg.from.username || ''; 
            dataChanged = true;
        }
    }
    
    if (dataChanged) { 
        saveData(ACTIVITY_FILE, activityStats);
        saveData(REP_FILE, reputations); 
        saveData(BDAY_FILE, birthdays); 
        saveData(C4_STAT_FILE, c4Stats); 
        saveData(MUSIC_STAT_FILE, musicStats);
    }

    // ⚠️ MAGIC 8-BALL INTERCEPTOR
    if (text.includes('🎱')) {
        const magic8BallAnswers = [
            "It is certain.", "It is decidedly so.", "Without a doubt.", "Yes definitely.", 
            "You may rely on it.", "As I see it, yes.", "Most likely.", "Outlook good.", 
            "Yes.", "Signs point to yes.", "Reply hazy, try again.", "Ask again later.", 
            "Better not tell you now.", "Cannot predict now.", "Concentrate and ask again.", 
            "Don't count on it.", "My reply is no.", "My sources say no.", 
            "Outlook not so good.", "Very doubtful.", "GO FUCK YOURSELF"
        ];
        const randomAnswer = magic8BallAnswers[Math.floor(Math.random() * magic8BallAnswers.length)];
        return safeReply(chatId, `<b>${randomAnswer}</b>`, msg.message_id, 'HTML');
    }

    // 1. ADD SONG WIZARD CHECK
    if (addSongState[fromId]) {
        if (addSongState[fromId].chatId === chatId) {
            const st = addSongState[fromId];
            
            if (text.toLowerCase() === '/done' || text.toLowerCase() === '/cancel') {
                bot.deleteMessage(chatId, msg.message_id).catch(()=>{}); 
                bot.deleteMessage(chatId, st.promptId).catch(()=>{});
                delete addSongState[fromId];
                return bot.sendMessage(chatId, "✅ <b>Finished adding songs.</b>", { parse_mode: 'HTML' });
            }

            if (msg.reply_to_message) {
                if (msg.reply_to_message.message_id === st.promptId) {

                    if (st.step === 'NEW_GENRE') {
                        st.genre = text.trim();
                        if (!musicDB[st.genre]) {
                            musicDB[st.genre] = [];
                        }
                        saveData(MUSIC_DB_FILE, musicDB);

                        st.step = 'QUERY';
                        bot.deleteMessage(chatId, msg.message_id).catch(()=>{}); 
                        bot.deleteMessage(chatId, st.promptId).catch(()=>{});
                        
                        let promptText = `✅ Genre <b>${st.genre}</b> created!\n\nSend the iTunes Search Query for the first song (e.g. 'Uptown Funk Bruno Mars')\n\n<i>Type /done when finished.</i>`;
                        const p = await bot.sendMessage(chatId, promptText, { reply_markup: { force_reply: true }, parse_mode: 'HTML' });
                        st.promptId = p.message_id;
                        return;
                    }

                    if (st.step === 'QUERY') {
                        st.query = text.trim();
                        const searchUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(st.query)}&entity=song&limit=15`;
                        
                        bot.sendChatAction(chatId, 'typing');
                        bot.deleteMessage(chatId, msg.message_id).catch(()=>{}); 
                        bot.deleteMessage(chatId, st.promptId).catch(()=>{});

                        try {
                            const response = await axios.get(searchUrl);
                            
                            let validTrack = null;
                            
                            if (response.data.results && response.data.results.length > 0) {
                                for (let i = 0; i < response.data.results.length; i++) {
                                    let track = response.data.results[i];
                                    
                                    if (!track.previewUrl) {
                                        continue;
                                    }
                                    
                                    let tName = track.trackName.toLowerCase();
                                    let isLive = false;
                                    
                                    if (!st.query.toLowerCase().includes('live')) {
                                        if (tName.includes('(live') || tName.includes(' - live') || tName.includes('[live')) {
                                            isLive = true;
                                        }
                                    }
                                    
                                    if (!isLive) {
                                        validTrack = track;
                                        break;
                                    }
                                }
                            }

                            if (validTrack) {
                                const track = validTrack;
                                const displayName = `${track.trackName} - ${track.artistName}`;
                                
                                let isDuplicate = false;
                                if (musicDB[st.genre]) {
                                    for (let i = 0; i < musicDB[st.genre].length; i++) {
                                        if (musicDB[st.genre][i].name === displayName) {
                                            isDuplicate = true;
                                            break;
                                        }
                                    }
                                }

                                if (isDuplicate) {
                                    let dupText = `⚠️ <b>Duplicate Song!</b>\n\n<b>${displayName}</b> is already in the <b>${st.genre}</b> genre.\n\nSend a different iTunes Search Query (or type /done):`;
                                    const p = await bot.sendMessage(chatId, dupText, { reply_markup: { force_reply: true }, parse_mode: 'HTML' });
                                    st.promptId = p.message_id;
                                    return;
                                }
                                
                                let trackNameLower = track.trackName.toLowerCase().replace(/’/g, "'");
                                
                                let baseRaw = trackNameLower.split('(')[0].split('-')[0].trim();
                                let baseWithApos = baseRaw.replace(/[^a-z0-9\s']/g, '').replace(/\s+/g, ' ').trim();
                                let baseNoApos = baseWithApos.replace(/'/g, '');
                                
                                let altWithApos = trackNameLower.replace(/[^a-z0-9\s']/g, '').replace(/\s+/g, ' ').trim();
                                let altNoApos = altWithApos.replace(/'/g, '');
                                
                                let answers = [baseNoApos];
                                if (baseWithApos !== baseNoApos) {
                                    answers.push(baseWithApos);
                                }
                                if (!answers.includes(altNoApos)) {
                                    answers.push(altNoApos);
                                }
                                if (altWithApos !== altNoApos && !answers.includes(altWithApos)) {
                                    answers.push(altWithApos);
                                }

                                if (!musicDB[st.genre]) {
                                    musicDB[st.genre] = [];
                                }
                                
                                musicDB[st.genre].push({ 
                                    query: st.query, 
                                    name: displayName, 
                                    answers: answers 
                                });
                                saveData(MUSIC_DB_FILE, musicDB);
                                
                                let successText = `✅ <b>Added:</b> ${displayName}\n\nSend the next iTunes Search Query (or type /done):`;
                                const p = await bot.sendMessage(chatId, successText, { reply_markup: { force_reply: true }, parse_mode: 'HTML' });
                                st.promptId = p.message_id;
                                return;
                            } else {
                                let failText = `❌ <b>Song not found on iTunes!</b> (or no clean studio version available).\n\nTry a different search query (or type /done):`;
                                const p = await bot.sendMessage(chatId, failText, { reply_markup: { force_reply: true }, parse_mode: 'HTML' });
                                st.promptId = p.message_id;
                                return;
                            }
                        } catch (err) {
                            let errText = `⚠️ iTunes API Error. Try again (or type /done):`;
                            const p = await bot.sendMessage(chatId, errText, { reply_markup: { force_reply: true }, parse_mode: 'HTML' });
                            st.promptId = p.message_id;
                            return;
                        }
                    }
                }
            }
        }
    }

    // 2. EVENT CREATION WIZARD CHECK
    if (eventSetupState[fromId]) {
        if (eventSetupState[fromId].chatId === chatId) {
            const state = eventSetupState[fromId];
            if (text === '/cancel') {
                bot.deleteMessage(chatId, msg.message_id).catch(()=>{}); 
                bot.deleteMessage(chatId, state.lastPromptId).catch(()=>{});
                delete eventSetupState[fromId]; 
                return bot.sendMessage(chatId, "🚫 Cancelled.", { reply_to_message_id: state.triggerMsgId });
            }
            if (msg.reply_to_message) {
                if (msg.reply_to_message.message_id === state.lastPromptId) {
                    if (state.step === 'NAME') {
                        state.eventName = text; 
                        state.step = 'MONTH';
                        bot.deleteMessage(chatId, msg.message_id).catch(()=>{}); 
                        bot.deleteMessage(chatId, state.lastPromptId).catch(()=>{}); 
                        
                        const m = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]; 
                        let k = [];
                        for (let i = 0; i < 12; i += 3) {
                            k.push([
                                {text: m[i], callback_data: `M_${i+1}`},
                                {text: m[i+1], callback_data: `M_${i+2}`},
                                {text: m[i+2], callback_data: `M_${i+3}`}
                            ]);
                        }
                        k.push([{text: "Cancel", callback_data: `CANCEL`}]);
                        
                        const p = await bot.sendMessage(chatId, "📅 <b>Month:</b>", { parse_mode: 'HTML', reply_markup: { inline_keyboard: k }, reply_to_message_id: state.triggerMsgId });
                        state.lastPromptId = p.message_id; 
                        return;
                    }
                }
            }
        }
    }

    // 3. EVENT EDIT MENU CHECK
    if (eventEditState[fromId]) {
        if (eventEditState[fromId].chatId === chatId) {
            const st = eventEditState[fromId];
            if (msg.reply_to_message) {
                if (msg.reply_to_message.message_id === st.promptMsgId) {
                    bot.deleteMessage(chatId, msg.message_id).catch(()=>{}); 
                    bot.deleteMessage(chatId, st.promptMsgId).catch(()=>{});
                    
                    calendarEvents.sort((a,b) => {
                        return a.timestamp - b.timestamp;
                    });
                    let ev = calendarEvents[st.eventIndex];
                    
                    if (ev) {
                        if (st.field === 'NAME') {
                            ev.name = text;
                        } else if (st.field === 'DATE') {
                            if (ev.raw) {
                                const parts = text.split('-');
                                if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                                    ev.raw.month = parts[0]; 
                                    ev.raw.day = parts[1];
                                } else {
                                    bot.sendMessage(chatId, "⚠️ Invalid date format. Use MM-DD. Edit cancelled.").then(m => {
                                        setTimeout(() => {
                                            bot.deleteMessage(chatId, m.message_id).catch(()=>{});
                                        }, 3000);
                                    });
                                    delete eventEditState[fromId]; 
                                    return renderEventEditMenu(chatId, st.menuMsgId, st.eventIndex, fromId);
                                }
                            }
                        } else if (st.field === 'TIME') {
                            if (ev.raw) {
                                ev.raw.time = text.trim().toUpperCase().replace(/\s*([AP]M)/, ' $1');
                            }
                        } else if (st.field === 'TZ') {
                            if (ev.raw) {
                                const tzMap = { 
                                    'PST': 'America/Los_Angeles', 
                                    'CST': 'America/Chicago', 
                                    'EST': 'America/New_York', 
                                    'GMT': 'Europe/London' 
                                };
                                let inputTz = text.toUpperCase().trim();
                                if (tzMap[inputTz]) {
                                    ev.raw.tz = tzMap[inputTz];
                                }
                            }
                        }
                        
                        if (st.field !== 'NAME') {
                            if (ev.raw) {
                                const r = ev.raw;
                                let eventDate = DateTime.fromFormat(`${r.month}/${r.day}/${r.year} ${r.time}`, "M/d/yyyy h:mm a", { zone: r.tz });
                                
                                if (eventDate.isValid) {
                                    if (eventDate < DateTime.now()) { 
                                        eventDate = eventDate.plus({ years: 1 }); 
                                        r.year += 1; 
                                    }
                                }
                                
                                if (eventDate.isValid) {
                                    ev.timestamp = eventDate.toMillis();
                                    const tzNames = { 
                                        'America/Los_Angeles': 'PST', 
                                        'America/Chicago': 'CST', 
                                        'America/New_York': 'EST', 
                                        'Europe/London': 'GMT' 
                                    };
                                    let tzDisplay = ev.raw.tz;
                                    if (tzNames[ev.raw.tz]) {
                                        tzDisplay = tzNames[ev.raw.tz];
                                    }
                                    ev.dateString = `${DateTime.local(r.year, parseInt(r.month), parseInt(r.day)).toFormat('MMMM d')} @ ${r.time} (${tzDisplay})`;
                                }
                            }
                        }
                        saveData(EVENT_FILE, calendarEvents);
                    }
                    delete eventEditState[fromId]; 
                    return renderEventEditMenu(chatId, st.menuMsgId, st.eventIndex, fromId); 
                }
            }
        }
    }

    // 🎧 GUESS THE SONG INTERCEPTOR
    if (activeMusicGames[chatId]) {
        if (activeMusicGames[chatId].status === 'playing') {
            if (activeMusicGames[chatId].currentSong) {
                const game = activeMusicGames[chatId];
                
                let rawGuess = text.toLowerCase().replace(/’/g, "'");
                let guessWithApos = rawGuess.replace(/[^a-z0-9\s']/g, '').replace(/\s+/g, ' ').trim();
                let guessNoApos = guessWithApos.replace(/'/g, '');
                
                let isCorrect = false;
                for (let i = 0; i < game.currentSong.answers.length; i++) {
                    let ans = game.currentSong.answers[i];
                    if (guessWithApos.includes(ans) || guessNoApos.includes(ans)) {
                        isCorrect = true;
                        break;
                    }
                }
                
                if (isCorrect) {
                    game.status = 'loading'; // Lock immediately
                    clearTimeout(game.timer);
                    
                    if (!game.scores[fromId]) {
                        game.scores[fromId] = { id: fromId, name: msg.from.first_name, score: 0 };
                    }
                    game.scores[fromId].score += 10;
                    
                    let winText = `🎉 <b>YES!</b> ${msg.from.first_name} got it!\nSong: <b>${game.currentSong.name}</b>\n<i>+10 Points</i>`;
                    await bot.sendMessage(chatId, winText, { parse_mode: 'HTML', reply_to_message_id: msg.message_id });
                    
                    game.round += 1;
                    
                    setTimeout(() => {
                        startMusicRound(chatId);
                    }, 4000);
                    
                    return;
                }
            }
        }
    }

    let args = text.split(' '); 
    let cmd = args[0].split('@')[0].toLowerCase(); 
    let query = args.slice(1).join(' ').trim();

    // 👑 OWNER COMMANDS
    if (isOwner) {
        if (cmd === '$restart') {
            bot.sendMessage(chatId, "🔄 <b>Restarting bot...</b>", { parse_mode: 'HTML', reply_to_message_id: msg.message_id }).then(() => { 
                process.exit(1); 
            });
            return;
        }

        if (cmd === '/promote') {
            if (!msg.reply_to_message) {
                return safeReply(chatId, "⚠️ You must reply to a user to promote them.", msg.message_id);
            }
            if (!msg.reply_to_message.from) {
                return safeReply(chatId, "⚠️ Could not identify the user.", msg.message_id);
            }
            
            let targetId = String(msg.reply_to_message.from.id);
            let targetName = msg.reply_to_message.from.first_name;
            
            if (!delegatedPerms[targetId]) {
                delegatedPerms[targetId] = { permaban: false, addsongs: false, aiconfig: false };
                saveData(PERMS_FILE, delegatedPerms);
            }
            
            let perms = delegatedPerms[targetId];
            
            let kb = [
                [{ text: `Permaban: ${perms.permaban ? '🟢' : '🔴'}`, callback_data: `PROM_permaban_${targetId}` }],
                [{ text: `Add Songs: ${perms.addsongs ? '🟢' : '🔴'}`, callback_data: `PROM_addsongs_${targetId}` }],
                [{ text: `AI Config: ${perms.aiconfig ? '🟢' : '🔴'}`, callback_data: `PROM_aiconfig_${targetId}` }],
                [{ text: "✅ Done", callback_data: `PROM_DONE_${targetId}` }]
            ];
            
            return bot.sendMessage(chatId, `👑 <b>Delegating Permissions for ${targetName}</b>`, { parse_mode: 'HTML', reply_markup: { inline_keyboard: kb } });
        }
        
        if (cmd === '/setwelcome') {
            if (!query) {
                return safeReply(chatId, "Provide text. Use {name} for their name.", msg.message_id);
            }
            botConfig.welcomeText = query;
            saveData(CONFIG_FILE, botConfig);
            return safeReply(chatId, `✅ Welcome message set.`, msg.message_id);
        }
        
        if (cmd === '/setleave') {
            if (!query) {
                return safeReply(chatId, "Provide text. Use {name} for their name.", msg.message_id);
            }
            botConfig.leaveText = query;
            saveData(CONFIG_FILE, botConfig);
            return safeReply(chatId, `✅ Leave message set.`, msg.message_id);
        }
        
        if (cmd === '/setchatlink') {
            if (!query) {
                return safeReply(chatId, "Provide a link.", msg.message_id);
            }
            botConfig.chatLink = query;
            saveData(CONFIG_FILE, botConfig);
            return safeReply(chatId, `✅ Chat link set.`, msg.message_id);
        }
        
        if (cmd === '/setverify') {
            if (query === 'none' || query === 'talk' || query === 'media') {
                botConfig.verifyMode = query;
                saveData(CONFIG_FILE, botConfig);
                return safeReply(chatId, `✅ Verification mode set to: <b>${query}</b>`, msg.message_id, 'HTML');
            } else {
                return safeReply(chatId, "⚠️ Use: /setverify none | talk | media", msg.message_id);
            }
        }
        
        if (cmd === '/setactivityreset') {
            let hour = parseInt(query);
            if (isNaN(hour) || hour < 0 || hour > 23) {
                return safeReply(chatId, "⚠️ Provide an hour between 0 and 23 (EST time).", msg.message_id);
            }
            botConfig.activityResetHour = hour;
            saveData(CONFIG_FILE, botConfig);
            return safeReply(chatId, `✅ Activity board will now reset at ${hour}:00 EST every day.`, msg.message_id);
        }
    }

    // 🔒 DELEGATED PERMISSIONS COMMANDS
    let canAddSongs = hasPerm(fromId, 'addsongs');
    if (canAddSongs) {
        if (cmd === '/addsong') {
            musicDB = loadObjectData(MUSIC_DB_FILE); 
            let kb = []; 
            let row = [];
            
            let genres = Object.keys(musicDB);
            for (let i = 0; i < genres.length; i++) {
                let genre = genres[i];
                row.push({ text: `${genre} (${musicDB[genre].length})`, callback_data: `ADDGENRE_SEL_${genre}` });
                if (row.length === 2) { 
                    kb.push(row); 
                    row = []; 
                }
            }
            if (row.length > 0) {
                kb.push(row);
            }
            kb.push([{ text: "➕ Add New Genre", callback_data: `ADDGENRE_NEW` }]);
            kb.push([{ text: "❌ Cancel", callback_data: `CANCEL_ADDSONG` }]);

            const p = await bot.sendMessage(chatId, "🎵 <b>Add New Song</b>\n\nSelect a genre or add a new one:", { reply_markup: { inline_keyboard: kb }, parse_mode: 'HTML' });
            addSongState[fromId] = { 
                chatId: chatId, 
                step: 'GENRE_SELECT', 
                triggerId: msg.message_id, 
                promptId: p.message_id 
            };
            return;
        }
    }

    let canBan = hasPerm(fromId, 'permaban');
    if (canBan) {
        if (cmd === "/permban") {
            if (query) {
                if (!bannedUsers.includes(query)) { 
                    bannedUsers.push(query); 
                    saveData(BAN_FILE, bannedUsers); 
                }
                return bot.sendMessage(chatId, `Banned: ${query}`);
            }
        }
        
        if (cmd === "/unpermban") {
            if (query) {
                bannedUsers = bannedUsers.filter(id => id !== query); 
                saveData(BAN_FILE, bannedUsers);
                return bot.sendMessage(chatId, `Unbanned: ${query}`);
            }
        }
    }

    let canAiConfig = hasPerm(fromId, 'aiconfig');
    if (canAiConfig) {
        if (cmd === '/newmodel') {
            if (!query) {
                return safeReply(chatId, "Provide a model ID.", msg.message_id);
            }
            botConfig.aiModel = query; 
            saveData(CONFIG_FILE, botConfig);
            return safeReply(chatId, `✅ <b>Model updated to:</b> ${query}`, msg.message_id, 'HTML');
        }
        
        if (cmd === '/changerole') {
            if (!query) {
                return safeReply(chatId, "⚠️ Please provide a persona prompt.", msg.message_id);
            }
            botConfig.aiPersona = query; 
            saveData(CONFIG_FILE, botConfig);
            return safeReply(chatId, `✅ <b>Persona updated:</b>\n\n<i>${query}</i>`, msg.message_id, 'HTML');
        }
        
        if (cmd === '/currentrole') {
            return safeReply(chatId, `🎭 <b>Current AI Persona:</b>\n\n<i>${botConfig.aiPersona}</i>`, msg.message_id, 'HTML');
        }
    }

    if (cmd === '/toggleai') {
        let adminStatus = await isAdmin(chatId, fromId);
        if (adminStatus) {
            isAiEnabled = !isAiEnabled; 
            let stateStr = "OFF";
            if (isAiEnabled) {
                stateStr = "ON";
            }
            return safeReply(chatId, `AI Chat: <b>${stateStr}</b>`, msg.message_id, 'HTML');
        }
    }

    if (cmd === '/gulag') {
        let adminStatus = await isAdmin(chatId, fromId);
        if (adminStatus) {
            if (msg.reply_to_message) {
                if (msg.reply_to_message.from) {
                    let targetId = String(msg.reply_to_message.from.id);
                    
                    if (targetId === botId || OWNER_IDS.includes(targetId)) {
                        return safeReply(chatId, "⚠️ Cannot gulag this user.", msg.message_id);
                    }
                    
                    let currentLevel = 0;
                    if (gulagStats[targetId]) {
                        currentLevel = gulagStats[targetId];
                    }
                    
                    const durationsSeconds = [
                        3 * 60,         
                        5 * 60,         
                        10 * 60,        
                        30 * 60,        
                        60 * 60,        
                        2 * 60 * 60,    
                        4 * 60 * 60,    
                        8 * 60 * 60,    
                        24 * 60 * 60    
                    ];
                    
                    const durationLabels = [
                        "3 minutes",
                        "5 minutes",
                        "10 minutes",
                        "30 minutes",
                        "1 hour",
                        "2 hours",
                        "4 hours",
                        "8 hours",
                        "1 day"
                    ];
                    
                    if (currentLevel >= durationsSeconds.length) {
                        currentLevel = durationsSeconds.length - 1;
                    }
                    
                    let muteDuration = durationsSeconds[currentLevel];
                    let muteLabel = durationLabels[currentLevel];
                    
                    let untilDate = Math.floor(Date.now() / 1000) + muteDuration;
                    
                    try {
                        await bot.restrictChatMember(chatId, targetId, {
                            permissions: {
                                can_send_messages: false,
                                can_send_media_messages: false,
                                can_send_polls: false,
                                can_send_other_messages: false,
                                can_add_web_page_previews: false,
                                can_change_info: false,
                                can_invite_users: false,
                                can_pin_messages: false
                            },
                            until_date: untilDate
                        });
                        
                        gulagStats[targetId] = currentLevel + 1;
                        saveData(GULAG_FILE, gulagStats);
                        
                        let gulagMessage = `<b><a href="https://t.me/gulagged">You have been sent to the gulag for ${muteLabel}</a></b>`;
                        
                        await bot.sendMessage(chatId, gulagMessage, { 
                            parse_mode: 'HTML', 
                            reply_to_message_id: msg.reply_to_message.message_id,
                            disable_web_page_preview: true
                        });
                    } catch (err) {
                        return safeReply(chatId, `⚠️ Failed to gulag user. Make sure the bot is an admin.`, msg.message_id);
                    }
                }
            } else {
                return safeReply(chatId, "⚠️ You must reply to the user you want to gulag.", msg.message_id);
            }
        }
    }

    if (cmd === '/commands') {
        const userIsAdmin = await isAdmin(chatId, fromId);
        let menu = `<b>COMMAND DIRECTORY</b>\n━━━━━━━━━━\n\n`;

        if (isOwner) {
            menu += `<b>[ OWNER CONTROLS ]</b>\n`;
            menu += `• /promote (reply) - Grant features to users\n`;
            menu += `• $restart - Reboot the bot immediately\n`;
            menu += `• /setwelcome [text] - Setup welcome msg\n`;
            menu += `• /setleave [text] - Setup leave msg\n`;
            menu += `• /setchatlink [url] - Chat link for leave msg\n`;
            menu += `• /setverify [none|talk|media] - Welcome mode\n`;
            menu += `• /setactivityreset [hour] - Auto-wipe hour (EST)\n`;
            menu += `• /forcebday - Force send today's birthday cards\n\n`;
        }
        
        let showDelegated = false;
        if (canAddSongs || canAiConfig || canBan) showDelegated = true;

        if (showDelegated) {
            menu += `<b>[ DELEGATED ADMIN ]</b>\n`;
            if (canAddSongs) menu += `• /addsong - Add a song to the music quiz\n`;
            if (canAiConfig) {
                menu += `• /newmodel [id] - Set OpenRouter model\n`;
                menu += `• /changerole [prompt] - Set AI personality\n`;
                menu += `• /currentrole - View current personality\n`;
            }
            if (canBan) {
                menu += `• /permban [id] - Ban from group\n`;
                menu += `• /unpermban [id] - Unban from group\n`;
            }
            menu += `\n`;
        }

        if (userIsAdmin) {
            menu += `<b>[ ADMIN CONTROLS ]</b>\n`;
            menu += `• /toggleai - Enable/Disable AI chat\n`;
            menu += `• /gulag (reply) - Mutes user for increasing duration\n`;
            menu += `• /newevent - Open event creation wizard\n`;
            menu += `• /summarize - Summarize chat since 5AM\n`;
            menu += `• /setbday MM-DD - Set user birthday (reply)\n`;
            menu += `• /testbday - Generate test birthday card\n`;
            menu += `• /memories - View all AI memory logs\n`;
            menu += `• /forget [num] - Delete a specific memory\n\n`;
        }
        
        menu += `<b>[ GENERAL CONTROLS ]</b>\n`;
        menu += `• /yo [text] - Force the AI to respond\n`;
        menu += `• /tl (reply or text) - Translate text to English\n`;
        menu += `• /songquiz - Play a music guessing game\n`;
        menu += `• /songtop - View Song Quiz Leaderboard\n`;
        menu += `• /connect4 - Play Connect 4 with someone\n`;
        menu += `• /c4top - View Connect 4 Leaderboard\n`;
        menu += `• /activity - View daily message counts\n`;
        menu += `• /events - View all upcoming events\n`;
        menu += `• /bdays - View all saved birthdays\n`;
        menu += `• /topcredit - Show highest social credit\n`;
        menu += `• /worstcredit - Show lowest social credit\n`;
        menu += `• /mycredit - Check your own social credit\n`;
        menu += `• + / - (reply) - Add/Remove 20 social credit\n`;
        menu += `• /when (reply) - Check exact message age`;
        
        return safeReply(chatId, menu, null, 'HTML'); 
    }

    if (cmd === '/activity') {
        const arr = Object.values(activityStats).sort((a, b) => b.count - a.count).slice(0, 15);
        if (arr.length === 0) {
            return safeReply(chatId, "No messages sent yet.");
        }
        
        let b = "📊 <b>Activity Leaderboard (Today)</b>\n━━━━━━━━━━\n\n";
        for (let i = 0; i < arr.length; i++) {
            let u = arr[i];
            b += `${i + 1}. ${u.name}: <b>${u.count} msgs</b>\n`;
        }
        return safeReply(chatId, b, null, 'HTML');
    }

    if (cmd === '/tl' || cmd === '/translate') {
        let textToTranslate = "";
        
        if (msg.reply_to_message) {
            if (msg.reply_to_message.text) {
                textToTranslate = msg.reply_to_message.text;
            } else if (msg.reply_to_message.caption) {
                textToTranslate = msg.reply_to_message.caption;
            }
        } else if (query !== "") {
            textToTranslate = query;
        }

        if (textToTranslate !== "") {
            bot.sendChatAction(chatId, 'typing').catch(()=>{});
            const transResult = await translateText(textToTranslate);
            let targetMsgId = msg.message_id;
            if (msg.reply_to_message) {
                targetMsgId = msg.reply_to_message.message_id;
            }
            return safeReply(chatId, `🇺🇸 <b>Translation:</b>\n${transResult}`, targetMsgId, 'HTML');
        } else {
            return safeReply(chatId, "⚠️ Reply to a message or provide text to translate.", msg.message_id);
        }
    }

    if (cmd === '/songtop' || cmd === '/musictop') {
        const arr = Object.values(musicStats).sort((a, b) => b.points - a.points).slice(0, 15);
        if (arr.length === 0) {
            return safeReply(chatId, "No Music Quiz games played yet.");
        }
        
        let b = "🏆 <b>Song Quiz Leaderboard</b>\n━━━━━━━━━━\n\n";
        for (let i = 0; i < arr.length; i++) {
            let u = arr[i];
            b += `${i + 1}. ${u.name}: <b>${u.points} Pts</b> (${u.wins} Wins)\n`;
        }
        return safeReply(chatId, b, null, 'HTML');
    }

    if (cmd === '/songquiz' || cmd === '/musicquiz') {
        if (activeMusicGames[chatId]) {
            return safeReply(chatId, "A game is already running!", msg.message_id);
        }
        
        musicDB = loadObjectData(MUSIC_DB_FILE); 
        let allGenres = Object.keys(musicDB);
        
        if (allGenres.length === 0) {
            return safeReply(chatId, "⚠️ The `music.json` database has no songs. An admin needs to add some!", msg.message_id);
        }

        pendingMusicGames[chatId] = { 
            initiator: fromId 
        };

        let kb = []; 
        let row = [];
        
        for (let i = 0; i < allGenres.length; i++) {
            let genre = allGenres[i];
            let songCount = musicDB[genre].length;
            
            row.push({ text: `${genre} (${songCount})`, callback_data: `MZ_GENRE_${genre}` });
            
            if (row.length === 2) { 
                kb.push(row); 
                row = []; 
            }
        }
        if (row.length > 0) {
            kb.push(row);
        }
        kb.push([{text: "❌ Cancel", callback_data: "MZ_CANCEL"}]);
        
        return bot.sendMessage(chatId, "🎧 <b>GUESS THE SONG</b>\nSelect a genre to start:", { parse_mode: 'HTML', reply_markup: { inline_keyboard: kb } });
    }

    if (cmd === '/stopquiz') {
        let adminStatus = await isAdmin(chatId, fromId);
        if (adminStatus) {
            if (activeMusicGames[chatId]) {
                clearTimeout(activeMusicGames[chatId].timer);
                delete activeMusicGames[chatId];
                return safeReply(chatId, "🛑 Game stopped by admin.");
            }
        }
    }

    if (cmd === '/connect4' || cmd === '/c4') {
        const gameId = Date.now().toString();
        activeC4Games[gameId] = { 
            id: gameId, 
            p1: { id: fromId, name: name }, 
            p2: null, 
            board: createC4Board(), 
            turn: 1, 
            status: 'waiting' 
        };
        const ui = renderC4Message(activeC4Games[gameId]);
        
        try {
            await bot.sendMessage(chatId, ui.text, { 
                reply_to_message_id: msg.message_id, 
                parse_mode: 'HTML', 
                reply_markup: { inline_keyboard: ui.kb } 
            });
        } catch (err) {}
        return;
    }

    if (cmd === '/c4top' || cmd === '/c4leaderboard') {
        const arr = Object.values(c4Stats).sort((a, b) => b.wins - a.wins).slice(0, 15);
        if (arr.length === 0) {
            return safeReply(chatId, "No Connect 4 games played yet.");
        }
        
        let b = "🏆 <b>Connect 4 Leaderboard</b>\n━━━━━━━━━━\n\n";
        for (let i = 0; i < arr.length; i++) {
            let u = arr[i];
            b += `${i + 1}. ${u.name}: <b>${u.wins} Wins</b> (${u.losses} L)\n`;
        }
        return safeReply(chatId, b, null, 'HTML');
    }

    if (msg.reply_to_message) {
        if (msg.reply_to_message.from) {
            const lower = text.toLowerCase();
            let isUpvote = false;
            let isDownvote = false;
            
            if (text === '+' || lower.includes('thank you')) {
                isUpvote = true;
            }
            if (text === '-' || lower.includes('fuck you')) {
                isDownvote = true;
            }

            if (isUpvote || isDownvote) {
                const rId = String(msg.reply_to_message.from.id);
                let rName = "User";
                if (msg.reply_to_message.from.first_name) {
                    rName = msg.reply_to_message.from.first_name;
                }
                
                if (rId !== fromId && rId !== botId) {
                    const cdKey = `${fromId}_${rId}`; 
                    const now = Date.now();
                    
                    let canVote = false;
                    if (!repCooldowns[cdKey]) {
                        canVote = true;
                    } else if ((now - repCooldowns[cdKey]) >= 60000) {
                        canVote = true;
                    }
                    
                    if (canVote) {
                        repCooldowns[cdKey] = now; 
                        
                        if (!reputations[rId]) {
                            reputations[rId] = { score: 0, name: rName };
                        }
                        
                        if (isUpvote) {
                            reputations[rId].score += 20; 
                        } else {
                            reputations[rId].score -= 20;
                        }
                        
                        saveData(REP_FILE, reputations);
                        
                        let stickerToSend = "";
                        if (isUpvote) {
                            stickerToSend = PLUS_CREDIT_STICKER;
                        } else {
                            stickerToSend = MINUS_CREDIT_STICKER;
                        }
                        
                        const targetMessageId = msg.reply_to_message.message_id; 
                        
                        if (stickerToSend !== '') {
                            try {
                                await bot.sendSticker(chatId, stickerToSend, { reply_to_message_id: targetMessageId });
                            } catch (err) {
                                await safeReply(chatId, `<b>Sticker failed to send.</b> Score is now: <b>${reputations[rId].score}</b>`, targetMessageId, 'HTML');
                            }
                        } else {
                            let act = "";
                            if (isUpvote) {
                                act = "increased";
                            } else {
                                act = "decreased";
                            }
                            await safeReply(chatId, `<b>${name}</b> ${act} <b>${rName}'s</b> Social Credit by 20. (Score: <b>${reputations[rId].score}</b>)`, targetMessageId, 'HTML');
                        }
                    }
                }
            }
        }
    }

    if (cmd === '/topcredit' || cmd === '/toprep') {
        const arr = Object.values(reputations).sort((a, b) => b.score - a.score).slice(0, 15);
        if (arr.length === 0) {
            return safeReply(chatId, "No Social Credit scores yet.");
        }
        let b = "<b>Highest Social Credit</b>\n━━━━━━━━━━\n\n"; 
        for (let i = 0; i < arr.length; i++) {
            let u = arr[i];
            b += `${i + 1}. ${u.name}: <b>${u.score}</b>\n`;
        }
        return safeReply(chatId, b, null, 'HTML');
    }
    
    if (cmd === '/worstcredit' || cmd === '/worstrep') {
        const arr = Object.values(reputations).sort((a, b) => a.score - b.score).slice(0, 15);
        if (arr.length === 0) {
            return safeReply(chatId, "No Social Credit scores yet.");
        }
        let b = "<b>Lowest Social Credit</b>\n━━━━━━━━━━\n\n"; 
        for (let i = 0; i < arr.length; i++) {
            let u = arr[i];
            b += `${i + 1}. ${u.name}: <b>${u.score}</b>\n`;
        }
        return safeReply(chatId, b, null, 'HTML');
    }
    
    if (cmd === '/mycredit' || cmd === '/myrep') {
        let score = "None";
        if (reputations[fromId]) {
            score = reputations[fromId].score;
        }
        return safeReply(chatId, `👤 <b>${name}</b>, your Social Credit score is: <b>${score}</b>`, msg.message_id, 'HTML');
    }

    if (cmd === '/yo') {
        if (isAiEnabled) {
            if (!query) {
                return safeReply(chatId, "What's up?", msg.message_id);
            }
            bot.sendChatAction(chatId, 'typing').catch(()=>{});
            const response = await askAI(query); 
            
            let sentMsg = await safeReply(chatId, response, msg.message_id, 'HTML'); 
            if (sentMsg && sentMsg.message_id) {
                aiMessageIds.push(sentMsg.message_id);
                if (aiMessageIds.length > 50) {
                    aiMessageIds.shift();
                }
            }
            return;
        }
    }

    if (msg.reply_to_message) {
        if (String(msg.reply_to_message.from.id) === botId) {
            if (!text.startsWith('/')) {
                if (isAiEnabled) {
                    // ⚠️ NEW: ONLY REPLY IF THE MESSAGE REPLIED TO WAS GENERATED BY THE AI ENGINE
                    if (aiMessageIds.includes(msg.reply_to_message.message_id)) {
                        bot.sendChatAction(chatId, 'typing').catch(()=>{});
                        const response = await askAI(text); 
                        
                        let sentMsg = await safeReply(chatId, response, msg.message_id, 'HTML'); 
                        if (sentMsg && sentMsg.message_id) {
                            aiMessageIds.push(sentMsg.message_id);
                            if (aiMessageIds.length > 50) {
                                aiMessageIds.shift();
                            }
                        }
                        return;
                    }
                }
            }
        }
    }

    if (cmd === '/summarize') {
        let adminStatus = await isAdmin(chatId, fromId);
        if (adminStatus) {
            bot.sendChatAction(chatId, 'typing').catch(()=>{});
            
            try {
                const loadingMsg = await bot.sendMessage(chatId, "⏳ <i>Reading today's chat logs...</i>", { parse_mode: 'HTML', reply_to_message_id: msg.message_id });
                const summary = await askSummarizer();
                bot.deleteMessage(chatId, loadingMsg.message_id).catch(()=>{});
                return safeReply(chatId, summary, msg.message_id, 'HTML');
            } catch (err) {}
        }
    }

    if (cmd === '/newevent') {
        let adminStatus = await isAdmin(chatId, fromId);
        if (adminStatus) {
            const p = await bot.sendMessage(chatId, "📝 Event name?", { reply_to_message_id: msg.message_id, reply_markup: { force_reply: true } });
            eventSetupState[fromId] = { 
                chatId: chatId, 
                step: 'NAME', 
                triggerMsgId: msg.message_id, 
                lastPromptId: p.message_id, 
                eventName: '', 
                reminders: [] 
            };
            return;
        }
    }
    
    if (cmd === '/events') {
        return renderPublicEventList(chatId, null, fromId, msg.message_id);
    }

    if (cmd === '/setbday') {
        let adminStatus = await isAdmin(chatId, fromId);
        if (adminStatus) {
            if (!/^\d{2}-\d{2}$/.test(query)) {
                return bot.sendMessage(chatId, "Use: /setbday MM-DD");
            }
            
            let u = msg.from;
            if (msg.reply_to_message) {
                u = msg.reply_to_message.from;
            }
            
            birthdays = birthdays.filter(b => b.userId !== String(u.id));
            
            let uName = "User";
            if (u.first_name) {
                uName = u.first_name;
            }
            let uUsername = "";
            if (u.username) {
                uUsername = u.username;
            }
            
            birthdays.push({ 
                userId: String(u.id), 
                username: uUsername, 
                name: uName, 
                date: query 
            });
            saveData(BDAY_FILE, birthdays);
            
            return safeReply(chatId, `<b>Saved!</b> ${uName} on ${query}.`, msg.message_id, 'HTML');
        }
    }
    
    if (cmd === '/bdays') {
        let adminStatus = await isAdmin(chatId, fromId);
        if (adminStatus) {
            if (birthdays.length === 0) {
                return bot.sendMessage(chatId, "No birthdays.");
            }
            
            let sortedBdays = birthdays.sort((a,b) => a.date.localeCompare(b.date));
            let bdayStrings = [];
            for (let i = 0; i < sortedBdays.length; i++) {
                bdayStrings.push(`🎂 ${sortedBdays[i].name}: <b>${sortedBdays[i].date}</b>`);
            }
            
            return safeReply(chatId, `<b>Birthdays:</b>\n\n${bdayStrings.join('\n')}`, null, 'HTML');
        }
    }
    
    if (cmd === '/testbday') {
        let adminStatus = await isAdmin(chatId, fromId);
        if (adminStatus) {
            bot.sendMessage(chatId, "Generating...");
            
            let testObj = { 
                userId: String(msg.from.id), 
                username: msg.from.username, 
                name: msg.from.first_name, 
                date: "TEST" 
            };
            
            return triggerBirthdayCard(chatId, testObj);
        }
    }

    if (cmd === '/memories') {
        let adminStatus = await isAdmin(chatId, fromId);
        if (adminStatus) {
            if (botMemories.length === 0) {
                return safeReply(chatId, "Empty.");
            }
            
            let memStrings = [];
            for (let i = 0; i < botMemories.length; i++) {
                memStrings.push(`${i + 1}. ${botMemories[i]}`);
            }
            
            return safeReply(chatId, `<b>Memories:</b>\n\n${memStrings.join('\n')}`, null, 'HTML');
        }
    }
    
    if (cmd === '/forget') {
        let adminStatus = await isAdmin(chatId, fromId);
        if (adminStatus) {
            const idx = parseInt(query) - 1;
            if (botMemories[idx]) { 
                botMemories.splice(idx, 1); 
                saveData(MEMORY_FILE, botMemories); 
                return safeReply(chatId, "Deleted."); 
            }
        }
    }

    if (isTargetGroup) {
        if (cmd === '/when') {
            if (msg.reply_to_message) {
                const t = msg.reply_to_message;
                
                let dateToUse = t.date;
                if (t.forward_date) {
                    dateToUse = t.forward_date;
                }
                
                const diff = DateTime.now().diff(DateTime.fromSeconds(dateToUse), ['years', 'months', 'days', 'hours', 'minutes', 'seconds']).toObject();
                
                let units = ['years', 'months', 'days', 'hours', 'minutes', 'seconds'];
                let parts = [];
                
                for (let i = 0; i < units.length; i++) {
                    let u = units[i];
                    if (diff[u] > 0 || u === 'seconds') {
                        parts.push(`${Math.floor(diff[u])} ${u}`);
                    }
                }
                
                bot.sendMessage(chatId, `${parts.join(', ')} old`, { reply_to_message_id: t.message_id });
            }
        }
    }
    
});

// ==========================================
// 🕹️ INLINE CALENDAR, EDIT, & GAME HANDLER
// ==========================================
bot.on('callback_query', async (query) => {
    const data = query.data; 
    const chatId = String(query.message.chat.id); 
    const fromId = String(query.from.id);
    
    let name = "User";
    if (query.from.first_name) {
        name = query.from.first_name;
    }

    if (data === 'IGNORE') {
        return bot.answerCallbackQuery(query.id).catch(()=>{});
    }

    // 🔒 DELEGATED ADMIN PROMOTE CALLBACKS
    if (data.startsWith('PROM_')) {
        let parts = data.split('_');
        if (parts[1] === 'DONE') {
            bot.deleteMessage(chatId, query.message.message_id).catch(()=>{});
            return bot.answerCallbackQuery(query.id, { text: "Permissions Saved!" });
        }
        
        let permName = parts[1];
        let targetId = parts[2];
        
        if (!OWNER_IDS.includes(fromId)) {
            return bot.answerCallbackQuery(query.id, { text: "Only the bot owner can use this menu.", show_alert: true });
        }
        
        if (delegatedPerms[targetId]) {
            if (delegatedPerms[targetId][permName] === true) {
                delegatedPerms[targetId][permName] = false;
            } else {
                delegatedPerms[targetId][permName] = true;
            }
        }
        
        saveData(PERMS_FILE, delegatedPerms);
        
        let perms = delegatedPerms[targetId];
        let kb = [
            [{ text: `Permaban: ${perms.permaban ? '🟢' : '🔴'}`, callback_data: `PROM_permaban_${targetId}` }],
            [{ text: `Add Songs: ${perms.addsongs ? '🟢' : '🔴'}`, callback_data: `PROM_addsongs_${targetId}` }],
            [{ text: `AI Config: ${perms.aiconfig ? '🟢' : '🔴'}`, callback_data: `PROM_aiconfig_${targetId}` }],
            [{ text: "✅ Done", callback_data: `PROM_DONE_${targetId}` }]
        ];
        
        try {
            await bot.editMessageReplyMarkup({ inline_keyboard: kb }, { chat_id: chatId, message_id: query.message.message_id });
        } catch (err) {}
        
        return bot.answerCallbackQuery(query.id);
    }

    // 🔒 VERIFICATION LOGIC
    if (data.startsWith('VERIFY_ACCEPT_')) {
        let targetGroup = data.replace('VERIFY_ACCEPT_', '');
        try {
            if (botConfig.verifyMode === 'talk') {
                await bot.restrictChatMember(targetGroup, fromId, {
                    permissions: {
                        can_send_messages: true,
                        can_send_media_messages: false,
                        can_send_polls: false,
                        can_send_other_messages: false,
                        can_add_web_page_previews: false,
                        can_change_info: false,
                        can_invite_users: false,
                        can_pin_messages: false
                    }
                });
            } else if (botConfig.verifyMode === 'media') {
                await bot.restrictChatMember(targetGroup, fromId, {
                    permissions: {
                        can_send_messages: true,
                        can_send_media_messages: true,
                        can_send_polls: true,
                        can_send_other_messages: true,
                        can_add_web_page_previews: true,
                        can_change_info: false,
                        can_invite_users: false,
                        can_pin_messages: false
                    }
                });
            }
            bot.deleteMessage(chatId, query.message.message_id).catch(()=>{});
            bot.sendMessage(chatId, "✅ <b>Rules accepted.</b> You have been granted permissions in the chat.", { parse_mode: 'HTML' });
            return bot.answerCallbackQuery(query.id);
        } catch (err) {
            return bot.answerCallbackQuery(query.id, { text: "Error granting permissions.", show_alert: true });
        }
    }

    // 🎵 ADD SONG: CALLBACK LOGIC
    if (data === 'CANCEL_ADDSONG') {
        bot.deleteMessage(chatId, query.message.message_id).catch(()=>{});
        delete addSongState[fromId];
        return bot.answerCallbackQuery(query.id, { text: "Cancelled." });
    }
    
    if (data.startsWith('ADDGENRE_SEL_')) {
        const genre = data.replace('ADDGENRE_SEL_', '');
        if (addSongState[fromId]) {
            addSongState[fromId].genre = genre;
            addSongState[fromId].step = 'QUERY';
            bot.deleteMessage(chatId, query.message.message_id).catch(()=>{});
            
            let pText = `🎵 <b>Genre: ${genre}</b>\n\nSend the iTunes Search Query (e.g. 'Uptown Funk Bruno Mars')\n\n<i>Type /done when finished.</i>`;
            const p = await bot.sendMessage(chatId, pText, { reply_markup: { force_reply: true }, parse_mode: 'HTML' });
            addSongState[fromId].promptId = p.message_id;
        }
        return bot.answerCallbackQuery(query.id);
    }
    
    if (data === 'ADDGENRE_NEW') {
        if (addSongState[fromId]) {
            addSongState[fromId].step = 'NEW_GENRE';
            bot.deleteMessage(chatId, query.message.message_id).catch(()=>{});
            
            let pText = `📝 Send the name for the new Genre:`;
            const p = await bot.sendMessage(chatId, pText, { reply_markup: { force_reply: true }, parse_mode: 'HTML' });
            addSongState[fromId].promptId = p.message_id;
        }
        return bot.answerCallbackQuery(query.id);
    }

    // 🎧 MUSIC QUIZ CALLBACKS
    if (data.startsWith('MZ_')) {
        if (!pendingMusicGames[chatId]) {
            return bot.answerCallbackQuery(query.id, { text: "This menu has expired.", show_alert: true });
        }
        if (pendingMusicGames[chatId].initiator !== fromId) {
            return bot.answerCallbackQuery(query.id, { text: "You didn't start this game!", show_alert: true });
        }
        
        if (data === 'MZ_CANCEL') {
            delete pendingMusicGames[chatId];
            bot.deleteMessage(chatId, query.message.message_id).catch(()=>{});
            return bot.answerCallbackQuery(query.id, { text: "Cancelled." });
        }
        
        if (data.startsWith('MZ_GENRE_')) {
            const genre = data.replace('MZ_GENRE_', '');
            
            musicDB = loadObjectData(MUSIC_DB_FILE);
            if (!musicDB[genre] || musicDB[genre].length === 0) {
                return bot.answerCallbackQuery(query.id, { text: "⚠️ This genre is empty. An admin needs to add songs first!", show_alert: true });
            }

            pendingMusicGames[chatId].genre = genre;
            
            let kb = [
                [
                    {text: "3 Rounds", callback_data: "MZ_ROUNDS_3"}, 
                    {text: "5 Rounds", callback_data: "MZ_ROUNDS_5"}
                ],
                [
                    {text: "10 Rounds", callback_data: "MZ_ROUNDS_10"}, 
                    {text: "20 Rounds", callback_data: "MZ_ROUNDS_20"}
                ],
                [{text: "❌ Cancel", callback_data: "MZ_CANCEL"}]
            ];
            
            let pText = `🎧 <b>Genre: ${genre}</b>\nHow many rounds?`;
            
            try {
                await bot.editMessageText(pText, {
                    chat_id: chatId, 
                    message_id: query.message.message_id, 
                    parse_mode: 'HTML', 
                    reply_markup: { inline_keyboard: kb }
                });
            } catch (err) {}
            
            return bot.answerCallbackQuery(query.id);
        }
        
        if (data.startsWith('MZ_ROUNDS_')) {
            const rounds = parseInt(data.replace('MZ_ROUNDS_', ''));
            const genre = pendingMusicGames[chatId].genre;
            
            musicDB = loadObjectData(MUSIC_DB_FILE);
            
            if (!musicDB[genre] || musicDB[genre].length === 0) {
                bot.deleteMessage(chatId, query.message.message_id).catch(()=>{});
                return bot.answerCallbackQuery(query.id, { text: "No songs available in this genre.", show_alert: true });
            }

            let maxR = Math.min(rounds, musicDB[genre].length);

            bot.deleteMessage(chatId, query.message.message_id).catch(()=>{});
            
            let startText = `🎧 <b>Starting Music Quiz!</b>\nGenre: <b>${genre}</b>\nRounds: <b>${maxR}</b>\nGet ready...`;
            bot.sendMessage(chatId, startText, { parse_mode: 'HTML' });
            
            let poolCopy = [];
            for (let i = 0; i < musicDB[genre].length; i++) {
                poolCopy.push(musicDB[genre][i]);
            }

            activeMusicGames[chatId] = {
                status: 'loading',
                pool: poolCopy, 
                round: 1,
                maxRounds: maxR, 
                scores: {},
                currentSong: null,
                timer: null
            };
            
            delete pendingMusicGames[chatId];
            
            setTimeout(() => {
                startMusicRound(chatId);
            }, 2000);
            
            return bot.answerCallbackQuery(query.id);
        }
    }

    if (data.startsWith('EVSUB_')) {
        const evId = data.replace('EVSUB_', '');
        
        let ev = null;
        for (let i = 0; i < calendarEvents.length; i++) {
            let idToCheck = calendarEvents[i].id;
            if (!idToCheck) {
                idToCheck = String(calendarEvents[i].timestamp);
            }
            if (idToCheck === evId) {
                ev = calendarEvents[i];
                break;
            }
        }
        
        if (!ev) {
            return bot.answerCallbackQuery(query.id, { text: "Event not found or already passed!", show_alert: true });
        }
        
        if (!ev.subscribers) {
            ev.subscribers = [];
        }
        
        let isSubbed = ev.subscribers.includes(fromId);
        if (isSubbed) {
            let newSubscribers = [];
            for (let i = 0; i < ev.subscribers.length; i++) {
                if (ev.subscribers[i] !== fromId) {
                    newSubscribers.push(ev.subscribers[i]);
                }
            }
            ev.subscribers = newSubscribers;
        } else {
            ev.subscribers.push(fromId);
        }
        
        saveData(EVENT_FILE, calendarEvents);
        
        let alertText = "";
        if (isSubbed) {
            alertText = "🔕 Reminder cancelled for you.";
        } else {
            alertText = "🔔 You will be pinged when this starts!";
        }
        
        return bot.answerCallbackQuery(query.id, { 
            text: alertText, 
            show_alert: true 
        });
    }

    if (data.startsWith('C4_')) {
        const parts = data.split('_'); 
        const action = parts[1]; 
        const gameId = parts[2]; 
        const game = activeC4Games[gameId];

        if (!game) {
            return bot.answerCallbackQuery(query.id, { text: "This game has expired or doesn't exist.", show_alert: true });
        }

        if (action === 'JOIN') {
            if (game.p1.id === fromId) {
                return bot.answerCallbackQuery(query.id, { text: "You can can't play against yourself!", show_alert: true });
            }
            game.p2 = { id: fromId, name: name };
            game.status = 'playing';
            
            let ui = renderC4Message(game);
            try {
                await bot.editMessageText(ui.text, { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'HTML', reply_markup: { inline_keyboard: ui.kb } });
            } catch (err) {}
            return bot.answerCallbackQuery(query.id, { text: "You joined the game!" });
        }

        if (action === 'LEAVE') {
            let isAdminUser = await isAdmin(chatId, fromId);
            
            let isPlayer1 = (fromId === game.p1.id);
            let isPlayer2 = false;
            if (game.p2 && fromId === game.p2.id) {
                isPlayer2 = true;
            }
            
            if (!isPlayer1 && !isPlayer2 && !isAdminUser) {
                return bot.answerCallbackQuery(query.id, { text: "You are not in this game!", show_alert: true });
            }
            
            game.status = 'forfeit';
            
            let ui = renderC4Message(game);
            try {
                await bot.editMessageText(ui.text, { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'HTML', reply_markup: { inline_keyboard: ui.kb } });
            } catch (err) {}
            delete activeC4Games[gameId];
            return bot.answerCallbackQuery(query.id, { text: "Game cancelled." });
        }

        if (action === 'DROP') {
            const col = parseInt(parts[3]);
            
            let isP1 = (fromId === game.p1.id);
            let isP2 = false;
            if (game.p2 && fromId === game.p2.id) {
                isP2 = true;
            }
            
            if (!isP1 && !isP2) {
                return bot.answerCallbackQuery(query.id, { text: "You are not in this game!", show_alert: true });
            }
            
            if (game.turn === 1 && !isP1) {
                return bot.answerCallbackQuery(query.id, { text: "It's not your turn!", show_alert: true });
            }
            if (game.turn === 2 && !isP2) {
                return bot.answerCallbackQuery(query.id, { text: "It's not your turn!", show_alert: true });
            }

            let targetRow = -1;
            for (let r = 5; r >= 0; r--) {
                if (game.board[r][col] === 0) { 
                    targetRow = r; 
                    break; 
                }
            }

            if (targetRow === -1) {
                return bot.answerCallbackQuery(query.id, { text: "This column is full!", show_alert: true });
            }

            game.board[targetRow][col] = game.turn;

            const winCoords = checkC4Win(game.board, game.turn);

            if (winCoords) {
                game.status = 'won';
                game.winner = game.turn;
                
                for (let i = 0; i < winCoords.length; i++) {
                    let coord = winCoords[i];
                    game.board[coord[0]][coord[1]] = 3; 
                }

                if (!c4Stats[game.p1.id]) {
                    c4Stats[game.p1.id] = { name: game.p1.name, wins: 0, losses: 0, draws: 0 };
                }
                if (!c4Stats[game.p2.id]) {
                    c4Stats[game.p2.id] = { name: game.p2.name, wins: 0, losses: 0, draws: 0 };
                }
                
                if (game.turn === 1) { 
                    c4Stats[game.p1.id].wins += 1; 
                    c4Stats[game.p2.id].losses += 1; 
                } else { 
                    c4Stats[game.p2.id].wins += 1; 
                    c4Stats[game.p1.id].losses += 1; 
                }
                saveData(C4_STAT_FILE, c4Stats);

            } else {
                let isBoardFull = true;
                for (let c = 0; c < 7; c++) {
                    if (game.board[0][c] === 0) {
                        isBoardFull = false;
                        break;
                    }
                }
                
                if (isBoardFull) {
                    game.status = 'draw';
                    
                    if (!c4Stats[game.p1.id]) {
                        c4Stats[game.p1.id] = { name: game.p1.name, wins: 0, losses: 0, draws: 0 };
                    }
                    if (!c4Stats[game.p2.id]) {
                        c4Stats[game.p2.id] = { name: game.p2.name, wins: 0, losses: 0, draws: 0 };
                    }
                    
                    c4Stats[game.p1.id].draws += 1; 
                    c4Stats[game.p2.id].draws += 1;
                    saveData(C4_STAT_FILE, c4Stats);
                } else {
                    if (game.turn === 1) {
                        game.turn = 2;
                    } else {
                        game.turn = 1;
                    }
                }
            }

            let ui = renderC4Message(game);
            try {
                await bot.editMessageText(ui.text, { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'HTML', reply_markup: { inline_keyboard: ui.kb } });
            } catch (err) {}
            
            if (game.status === 'won' || game.status === 'draw') {
                delete activeC4Games[gameId];
            }
            return bot.answerCallbackQuery(query.id);
        }
    }

    if (data.startsWith('EV_')) {
        const parts = data.split('_');
        const menuOwnerId = parts[parts.length - 1]; 

        if (fromId !== menuOwnerId) {
            return bot.answerCallbackQuery(query.id, { text: "⚠️ This is not your menu! Type /events to open your own.", show_alert: true });
        }

        const coreDataParts = [];
        for (let i = 0; i < parts.length - 1; i++) {
            coreDataParts.push(parts[i]);
        }
        const coreData = coreDataParts.join('_'); 

        if (coreData === 'EV_ADMIN_MENU') {
            return renderAdminEditList(chatId, query.message.message_id, fromId);
        }
        if (coreData === 'EV_BACK_MAIN') {
            return renderPublicEventList(chatId, query.message.message_id, fromId);
        }
        if (coreData === 'EV_CLOSE') {
            return bot.deleteMessage(chatId, query.message.message_id).catch(()=>{});
        }

        if (coreData.startsWith('EV_DEL_')) {
            const splitCore = coreData.split('_');
            const idx = parseInt(splitCore[2]);
            calendarEvents.sort((a,b) => {
                return a.timestamp - b.timestamp;
            });
            calendarEvents.splice(idx, 1);
            saveData(EVENT_FILE, calendarEvents);
            return renderAdminEditList(chatId, query.message.message_id, fromId); 
        }

        if (coreData.startsWith('EV_EDIT_REM_')) {
            const splitCore = coreData.split('_');
            const idx = parseInt(splitCore[3]);
            return renderEventRemindersMenu(chatId, query.message.message_id, idx, fromId);
        }

        if (coreData.startsWith('EV_TOG_REM_')) {
            const splitCore = coreData.split('_');
            const idx = parseInt(splitCore[3]);
            const val = parseInt(splitCore[4]);
            
            let ev = calendarEvents[idx];
            if (ev) {
                if (!ev.reminders) {
                    ev.reminders = [];
                }
                
                if (ev.reminders.includes(val)) {
                    let newReminders = [];
                    for (let i = 0; i < ev.reminders.length; i++) {
                        if (ev.reminders[i] !== val) {
                            newReminders.push(ev.reminders[i]);
                        }
                    }
                    ev.reminders = newReminders;
                } else {
                    ev.reminders.push(val);
                }
                
                saveData(EVENT_FILE, calendarEvents);
                return renderEventRemindersMenu(chatId, query.message.message_id, idx, fromId);
            }
        }

        if (coreData.startsWith('EV_EDIT_')) {
            const splitCore = coreData.split('_');
            const idx = parseInt(splitCore[2]);
            return renderEventEditMenu(chatId, query.message.message_id, idx, fromId);
        }

        if (coreData.startsWith('EV_FLD_')) {
            const fieldParts = coreData.split('_');
            const field = fieldParts[2]; 
            const idx = parseInt(fieldParts[3]);
            
            let promptText = "";
            if (field === 'NAME') {
                promptText = "📝 Send the new name for this event:";
            } else if (field === 'DATE') {
                promptText = "📅 Send the new date (MM-DD):";
            } else if (field === 'TIME') {
                promptText = "⏰ Send the new time (e.g., 4:00 PM):";
            } else if (field === 'TZ') {
                promptText = "🌍 Send the new timezone (PST, CST, EST, GMT):";
            }
            
            const p = await bot.sendMessage(chatId, promptText, { reply_markup: { force_reply: true } });
            
            eventEditState[fromId] = {
                chatId: chatId, 
                eventIndex: idx, 
                field: field,
                menuMsgId: query.message.message_id, 
                promptMsgId: p.message_id
            };
            return bot.answerCallbackQuery(query.id);
        }
    }

    let isCalendarData = false;
    if (data === 'CANCEL' || data === 'REM_DONE') {
        isCalendarData = true;
    } else if (data.startsWith('REM_TOGGLE_')) {
        isCalendarData = true;
    } else if (data.startsWith('M_')) {
        isCalendarData = true;
    } else if (data.startsWith('D_')) {
        isCalendarData = true;
    } else if (data.startsWith('H_')) {
        isCalendarData = true;
    } else if (data.startsWith('MIN_')) {
        isCalendarData = true;
    } else if (data.startsWith('AMPM_')) {
        isCalendarData = true;
    } else if (data.startsWith('T_')) {
        isCalendarData = true;
    }

    if (isCalendarData) {
        const state = eventSetupState[fromId];
        if (!state) {
            return bot.answerCallbackQuery(query.id, { text: "Not your active menu!", show_alert: true });
        }
        if (state.chatId !== chatId) {
            return bot.answerCallbackQuery(query.id, { text: "Not your active menu!", show_alert: true });
        }
        
        if (data === 'CANCEL') {
            bot.deleteMessage(chatId, query.message.message_id).catch(()=>{}); 
            delete eventSetupState[fromId];
            return bot.sendMessage(chatId, "Cancelled.", { reply_to_message_id: state.triggerMsgId });
        }
        
        if (data.startsWith('M_')) {
            state.eventMonth = data.replace('M_', ''); 
            state.step = 'DAY';
            bot.deleteMessage(chatId, query.message.message_id).catch(()=>{}); 
            
            const d = DateTime.local(DateTime.now().year, parseInt(state.eventMonth)).daysInMonth;
            let kb = []; 
            let r = [];
            for (let i = 1; i <= d; i++) { 
                r.push({ text: `${i}`, callback_data: `D_${i}` }); 
                if (r.length === 5 || i === d) { 
                    kb.push(r); 
                    r = []; 
                } 
            }
            if (r.length > 0) {
                kb.push(r);
            }
            kb.push([{ text: "Cancel", callback_data: `CANCEL` }]);
            
            const p = await bot.sendMessage(chatId, "📅 <b>Day:</b>", { parse_mode: 'HTML', reply_markup: { inline_keyboard: kb }, reply_to_message_id: state.triggerMsgId });
            state.lastPromptId = p.message_id; 
            return bot.answerCallbackQuery(query.id);
        }
        
        if (data.startsWith('D_')) {
            state.eventDay = data.replace('D_', ''); 
            state.step = 'HOUR';
            bot.deleteMessage(chatId, query.message.message_id).catch(()=>{}); 
            
            let kb = []; 
            let r = [];
            for (let i = 1; i <= 12; i++) { 
                r.push({ text: `${i}`, callback_data: `H_${i}` }); 
                if (r.length === 4) { 
                    kb.push(r); 
                    r = []; 
                } 
            }
            if (r.length > 0) {
                kb.push(r);
            }
            kb.push([{ text: "Cancel", callback_data: `CANCEL` }]);
            
            const p = await bot.sendMessage(chatId, "⏰ <b>Select Hour:</b>", { parse_mode: 'HTML', reply_markup: { inline_keyboard: kb }, reply_to_message_id: state.triggerMsgId });
            state.lastPromptId = p.message_id; 
            return bot.answerCallbackQuery(query.id);
        }
        
        if (data.startsWith('H_')) {
            state.eventHour = data.replace('H_', ''); 
            state.step = 'MIN';
            bot.deleteMessage(chatId, query.message.message_id).catch(()=>{}); 
            
            let kb = [
                [
                    { text: ":00", callback_data: `MIN_00` }, 
                    { text: ":15", callback_data: `MIN_15` }, 
                    { text: ":30", callback_data: `MIN_30` }, 
                    { text: ":45", callback_data: `MIN_45` }
                ], 
                [{ text: "Cancel", callback_data: `CANCEL` }]
            ];
            
            const p = await bot.sendMessage(chatId, "⏱️ <b>Select Minute:</b>", { parse_mode: 'HTML', reply_markup: { inline_keyboard: kb }, reply_to_message_id: state.triggerMsgId });
            state.lastPromptId = p.message_id; 
            return bot.answerCallbackQuery(query.id);
        }
        
        if (data.startsWith('MIN_')) {
            state.eventMinute = data.replace('MIN_', ''); 
            state.step = 'AMPM';
            bot.deleteMessage(chatId, query.message.message_id).catch(()=>{}); 
            
            let kb = [
                [
                    { text: "☀️ AM", callback_data: `AMPM_AM` }, 
                    { text: "🌙 PM", callback_data: `AMPM_PM` }
                ], 
                [{ text: "Cancel", callback_data: `CANCEL` }]
            ];
            
            const p = await bot.sendMessage(chatId, "🌓 <b>AM or PM?</b>", { parse_mode: 'HTML', reply_markup: { inline_keyboard: kb }, reply_to_message_id: state.triggerMsgId });
            state.lastPromptId = p.message_id; 
            return bot.answerCallbackQuery(query.id);
        }
        
        if (data.startsWith('AMPM_')) {
            state.eventAmPm = data.replace('AMPM_', ''); 
            state.step = 'TZ';
            state.eventTime = `${state.eventHour}:${state.eventMinute} ${state.eventAmPm}`;
            bot.deleteMessage(chatId, query.message.message_id).catch(()=>{}); 
            
            const k = { 
                inline_keyboard: [
                    [
                        {text: "PST", callback_data: `T_America/Los_Angeles`},
                        {text: "CST", callback_data: `T_America/Chicago`}
                    ],
                    [
                        {text: "EST", callback_data: `T_America/New_York`},
                        {text: "GMT", callback_data: `T_Europe/London`}
                    ],
                    [{text: "Cancel", callback_data: `CANCEL`}]
                ] 
            };
            
            const p = await bot.sendMessage(chatId, "🌍 <b>Time Zone:</b>", { parse_mode: 'HTML', reply_markup: k, reply_to_message_id: state.triggerMsgId });
            state.lastPromptId = p.message_id; 
            return bot.answerCallbackQuery(query.id);
        }
        
        if (data.startsWith('T_')) {
            const tz = data.replace('T_', ''); 
            bot.deleteMessage(chatId, query.message.message_id).catch(()=>{}); 
            
            const tN = { 
                'America/Los_Angeles': 'PST', 
                'America/Chicago': 'CST', 
                'America/New_York': 'EST', 
                'Europe/London': 'GMT' 
            };
            
            let sT = state.eventTime;
            let year = DateTime.now().year; 
            let eD = DateTime.fromFormat(`${state.eventMonth}/${state.eventDay}/${year} ${sT}`, "M/d/yyyy h:mm a", { zone: tz });
            
            if (eD.isValid) {
                if (eD < DateTime.now()) { 
                    eD = eD.plus({ years: 1 }); 
                    year += 1; 
                }
            }
            
            if (!eD.isValid) { 
                delete eventSetupState[fromId]; 
                return bot.sendMessage(chatId, `Bad time format. Restart /newevent.`); 
            }
            
            state.eventDateMillis = eD.toMillis();
            
            let tzDisplay = tz;
            if (tN[tz]) {
                tzDisplay = tN[tz];
            }
            
            state.eventDateString = `${DateTime.local(year, parseInt(state.eventMonth), parseInt(state.eventDay)).toFormat('MMM d')} @ ${sT} (${tzDisplay})`;
            state.raw = { 
                month: state.eventMonth, 
                day: state.eventDay, 
                year: year, 
                time: sT, 
                tz: tz 
            };
            state.step = 'REMINDERS';
            
            const kb = generateReminderKeyboard(state.reminders);
            
            try {
                const p = await bot.sendMessage(chatId, `⏰ Select early reminders for <b>${state.eventName}</b>:`, { 
                    reply_to_message_id: state.triggerMsgId, 
                    parse_mode: 'HTML', 
                    reply_markup: { inline_keyboard: kb } 
                });
                state.lastPromptId = p.message_id;
            } catch (err) {}
            
            return bot.answerCallbackQuery(query.id);
        }
        
        if (data.startsWith('REM_TOGGLE_')) {
            const val = parseInt(data.replace('REM_TOGGLE_', ''));
            
            if (state.reminders.includes(val)) {
                let newReminders = [];
                for (let i = 0; i < state.reminders.length; i++) {
                    if (state.reminders[i] !== val) {
                        newReminders.push(state.reminders[i]);
                    }
                }
                state.reminders = newReminders;
            } else {
                state.reminders.push(val);
            }
            
            const kb = generateReminderKeyboard(state.reminders);
            
            try {
                await bot.editMessageReplyMarkup({ inline_keyboard: kb }, { chat_id: chatId, message_id: query.message.message_id });
            } catch (err) {}
            return;
        }
        
        if (data === 'REM_DONE') {
            const evId = Date.now().toString();
            
            calendarEvents.push({ 
                id: evId, 
                name: state.eventName, 
                timestamp: state.eventDateMillis, 
                dateString: state.eventDateString, 
                chatId: chatId, 
                raw: state.raw, 
                subscribers: [], 
                reminders: state.reminders, 
                sentReminders: []
            });
            
            saveData(EVENT_FILE, calendarEvents);
            bot.deleteMessage(chatId, query.message.message_id).catch(()=>{});
            
            let successMessage = `✅ <b>Event Successfully Scheduled!</b>\n\n📝 <b>Name:</b> ${state.eventName}\n📅 <b>Time:</b> ${state.eventDateString}\n\n<i>Click the button below to be quietly pinged when it starts!</i>`;
            
            try {
                await bot.sendMessage(chatId, successMessage, { 
                    reply_to_message_id: state.triggerMsgId,
                    parse_mode: 'HTML',
                    reply_markup: { 
                        inline_keyboard: [[{ text: `🔔 Remind Me: ${state.eventName}`, callback_data: `EVSUB_${evId}` }]] 
                    }
                });
            } catch (err) {}

            delete eventSetupState[fromId]; 
            return bot.answerCallbackQuery(query.id, { text: "Event Saved!" });
        }
    } else {
        return bot.answerCallbackQuery(query.id).catch(()=>{});
    }
});

console.log('🤖 MASTER BOT ONLINE.');