const schedule = require('node-schedule');
const { DateTime } = require('luxon');
const config = require('../config');
const { saveData } = require('../dataManager');
const cron = require('node-cron');

module.exports = function(bot, state, utils, config, birthdaysModule) {

    // Birthday and Gulag Reset Scheduler (9 AM EST)
    const bdayRule = new schedule.RecurrenceRule();
    bdayRule.hour = 9; 
    bdayRule.minute = 0; 
    bdayRule.tz = 'America/New_York'; 
    schedule.scheduleJob(bdayRule, async () => {
        const today = DateTime.now().setZone('America/New_York').toFormat('MM-dd');
        for (let i = 0; i < state.birthdays.length; i++) {
            let bday = state.birthdays[i];
            if (bday.date === today) {
                await birthdaysModule.triggerBirthdayCard(config.TARGET_GROUP_ID, bday);
            }
        }
        state.gulagStats = {};
        saveData(config.FILES.GULAG, state.gulagStats);
        console.log('🔄 Gulag stats wiped clean at 9:00 AM EST.');
    });

    // Daily Chat Log Reset Scheduler (5 AM EST)
    const logResetRule = new schedule.RecurrenceRule();
    logResetRule.hour = 5; 
    logResetRule.minute = 0; 
    logResetRule.tz = 'America/New_York';
    schedule.scheduleJob(logResetRule, () => {
        state.dailyChatLog = [];
        saveData(config.FILES.CHAT_LOG, state.dailyChatLog);
        console.log('🔄 Daily chat log wiped clean at 5:00 AM EST.');
    });

    // DAILY RESET (Every night at midnight)
    cron.schedule('0 0 * * *', () => {
        state.activityStats = {};
        saveData(config.FILES.ACTIVITY, state.activityStats);
        console.log("☀️ Daily activity cleared.");
    });

    // MONTHLY RESET (Midnight on the 1st of every month)
    cron.schedule('0 0 1 * *', () => {
        state.monthlyActivity = {};
        saveData(config.FILES.MONTHLY_ACTIVITY, state.monthlyActivity);
        console.log("📅 Monthly activity cleared.");
    });

    // Activity Leaderboard Reset Scheduler (Every minute check for dynamic hour)
    schedule.scheduleJob('0 * * * *', async () => {
        const now = DateTime.now().setZone('America/New_York');
        if (now.hour === state.botConfig.activityResetHour) {
            let arr = Object.values(state.activityStats).sort((a,b) => b.count - a.count);
            let msg = `📊 <b>Final Activity Leaderboard Before Reset</b>\n━━━━━━━━━━\n\n`;
            if (arr.length === 0) {
                msg += "No messages sent.";
            } else {
                for (let i = 0; i < Math.min(arr.length, 25); i++) {
                    msg += `${i + 1}. ${arr[i].name}: <b>${arr[i].count} msgs</b>\n`;
                }
            }
            await utils.safeReply(config.LOG_ID, msg, null, 'HTML');

        }
    });

    // Master Event Scheduler (Every Minute)
    schedule.scheduleJob('* * * * *', async () => {
        const now = DateTime.now().toMillis();
        let changed = false;
        const timeLabels = { 15: '15 MINUTES', 30: '30 MINUTES', 60: '1 HOUR', 120: '2 HOURS', 1440: '1 DAY' };
        
        for (let i = state.calendarEvents.length - 1; i >= 0; i--) {
            let ev = state.calendarEvents[i];
            let invisibleTags = '';
            if (ev.subscribers && ev.subscribers.length > 0) {
                invisibleTags = ev.subscribers.map(sub => `<a href="tg://user?id=${sub}">&#8203;</a>`).join('');
            }
            
            if (!ev.sentReminders) ev.sentReminders = [];
            
            if (ev.reminders && ev.reminders.length > 0) {
                for (let j = 0; j < ev.reminders.length; j++) {
                    let mins = ev.reminders[j];
                    let remTime = ev.timestamp - (mins * 60000);
                    
                    if (now >= remTime && now < remTime + (5 * 60000) && !ev.sentReminders.includes(mins)) {
                        let timeStr = timeLabels[mins] || `${mins} MINUTES`;
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
                state.calendarEvents.splice(i, 1);
                changed = true;
            }
        }
        if (changed) saveData(config.FILES.EVENT, state.calendarEvents);
    });
};