const path = require('path');

module.exports = {
    TOKEN: 'sadsda',
    OPENROUTER_API_KEY: 'sdfasfas',
    OWNER_IDS: ["190190519", "1122603836"],
    LOG_ID: "190190519",
    TARGET_GROUP_ID: "-1002372844799",
    
    STICKERS: {
        PLUS_CREDIT: 'CAACAgEAAyEFAASNbrz_AAEd1dJpm-dtiWat5QqS_RBNswABX3O5_lwAAnAIAAKOYeBENDzyOu1jjt86BA',
        MINUS_CREDIT: 'CAACAgEAAyEFAASNbrz_AAEd1dNpm-dwbZZnTM8FFslz3QaTTAWn3QACnQcAAo8U4UThtJ_89m0bYDoE'
    },

    FILES: {
        BAN: path.join(__dirname, 'banned.json'),
        GROUPS: path.join(__dirname, 'groups.json'),
        EVENT: path.join(__dirname, 'events.json'),
        MEMORY: path.join(__dirname, 'memory.json'),
        BDAY: path.join(__dirname, 'birthdays.json'),
        REP: path.join(__dirname, 'rep.json'),
        MONTHLY_ACTIVITY: path.join(__dirname, 'monthly_activity.json'),
        CONFIG: path.join(__dirname, 'config.json'),
        CHAT_LOG: path.join(__dirname, 'chat_log.json'),
        C4_STAT: path.join(__dirname, 'c4stats.json'),
        MUSIC_DB: path.join(__dirname, 'music.json'),
        SUBSCRIPTIONS: path.join(__dirname, 'subscriptions.json'),
        MUSIC_STAT: path.join(__dirname, 'musicstats.json'),
        GULAG: path.join(__dirname, 'gulag.json'),
        ACTIVITY: path.join(__dirname, 'activity.json'),
        PERMS: path.join(__dirname, 'perms.json'),
        CRASH_LOG: path.join(__dirname, 'crash.log')
    }
};
