const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const { DateTime } = require('luxon');

// 1. Load configurations and state
const config = require('./config');
const state = require('./state');
const { saveData } = require('./dataManager');

// 2. Initialize Bot
const bot = new TelegramBot(config.TOKEN, { 
    polling: { 
        interval: 100, 
        autoStart: true,
        params: { allowed_updates: JSON.stringify(["message", "callback_query", "chat_member", "my_chat_member", "pre_checkout_query"]) }
    } 
});
bot.on('polling_error', (error) => console.log("⚠️ Polling Error:", error.code))

bot.on('raw_update', (update) => {
    // This will print EVERY single thing Telegram sends to your bot.
    // If you click "Pay" and NOTHING prints here, Telegram is not talking to your VPS.
    if (update.pre_checkout_query) {
        console.log("💎 RAW PRE_CHECKOUT FOUND!");
    }
});

bot.on('pre_checkout_query', (query) => {
    console.log("🌟 HANDSHAKE DETECTED!");
    bot.answerPreCheckoutQuery(query.id, true).catch(e => console.log("Error:", e.message));
});

bot.getMe().then(me => {
    state.botId = String(me.id);
    state.botUsername = me.username;
});

// 3. Load Utils
const utils = require('./utils')(bot, state);

// 4. Initialize Feature Modules
const modules = {
    ai: require('./modules/ai')(bot, state, utils),
    music: require('./modules/music')(bot, state),
    connect4: require('./modules/connect4')(bot, state),
    events: require('./modules/events')(bot, state, utils),
    birthdays: require('./modules/birthdays')(bot, state)
};

// 5. Initialize Schedulers (Cron Jobs)
require('./modules/scheduler')(bot, state, utils, modules.birthdays);

// 6. Initialize Event Handlers (Routing)
require('./handlers/messages')(bot, state, config, utils, modules);
require('./handlers/callbacks')(bot, state, config, utils, modules);

const paymentHandler = require('./handlers/payments');
paymentHandler(bot, state, saveData, config);

console.log("💳 Payment system initialized.");

// 7. Anti-Crash System
function logCrash(err, origin) {
    const timestamp = DateTime.now().setZone('America/New_York').toFormat('yyyy-MM-dd HH:mm:ss');
    let errMessage = err?.stack || err?.message || JSON.stringify(err, null, 2);
    
    try {
        fs.appendFileSync(config.FILES.CRASH_LOG, `\n[${timestamp}] 🚨 ${origin}\n${errMessage}\n---\n`);
        console.log(`⚠️ Crash caught! Bot is still running.`);
        
        if (bot) {
            bot.sendMessage(config.LOG_ID, `🚨 <b>CRASH REPORT (${origin}):</b>\n<pre>${errMessage.slice(0, 3800)}</pre>`, { parse_mode: 'HTML' }).catch(()=>{});
        }
    } catch (e) {}
}



process.on('unhandledRejection', (reason) => logCrash(reason, 'unhandledRejection'));
process.on('uncaughtException', (err) => logCrash(err, 'uncaughtException'));
bot.on('polling_error', (error) => logCrash(error, 'Polling Error'));

console.log('🤖 MASTER BOT ONLINE (MODULARIZED).');