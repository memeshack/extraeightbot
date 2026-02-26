const fs = require('fs');
const path = require('path');

module.exports = function(bot, state, saveData, config) {
const logPath = path.join(process.cwd(), 'payment_logs.txt'); // process.cwd() is safer on VPS

    function logPayment(msg) {
        const time = new Date().toISOString();
        const entry = `[${time}] ${msg}\n`;
        fs.appendFileSync(logPath, entry);
        console.log(`💳 PAY_LOG: ${msg}`);
    }

    // 1. THE HANDSHAKE (Pre-Checkout)
    bot.on('pre_checkout_query', async (query) => {
        logPayment(`PRE_CHECKOUT received from ${query.from.first_name} (${query.from.id}) for payload: ${query.invoice_payload}`);
        
        try {
            // We tell Telegram "OK" to proceed with the Star deduction
            await bot.answerPreCheckoutQuery(query.id, true);
            logPayment(`✅ PRE_CHECKOUT approved for ${query.from.id}`);
        } catch (err) {
            logPayment(`❌ PRE_CHECKOUT failed: ${err.message}`);
        }
    });

    // 2. THE CONFIRMATION (Successful Payment)
    bot.on('message', async (msg) => {
        if (msg.successful_payment) {
            const payload = msg.successful_payment.invoice_payload; // e.g., "sub_full_12345"
            const parts = payload.split('_');
            const tier = parts[1]; // basic or full
            const chatId = String(msg.chat.id);

            const duration = 30 * 24 * 60 * 60 * 1000;
            const newExpiry = Date.now() + duration;

            state.subscriptions[chatId] = {
                active: true,
                tier: tier, // Save if they are 'basic' or 'full'
                expiry: newExpiry,
                purchasedBy: msg.from.id
            };

            saveData(config.FILES.SUBSCRIPTIONS, state.subscriptions);

            const icon = tier === 'full' ? '👑' : '✨';
            return bot.sendMessage(chatId, `🎊 <b>Payment Successful!</b>\n\nYour group now has <b>${tier.toUpperCase()} ${icon}</b> access for 30 days.`);
        }
    });
};