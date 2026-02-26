const config = require('./config');
const { loadData, loadObjectData, saveData } = require('./dataManager');

// Load static databases once on startup
const state = {
    bannedUsers: loadData(config.FILES.BAN),
    calendarEvents: loadData(config.FILES.EVENT),
    botMemories: loadData(config.FILES.MEMORY),
    birthdays: loadData(config.FILES.BDAY),
    reputations: loadObjectData(config.FILES.REP),
    dailyChatLog: loadData(config.FILES.CHAT_LOG),
    c4Stats: loadObjectData(config.FILES.C4_STAT),
    musicStats: loadObjectData(config.FILES.MUSIC_STAT),
    gulagStats: loadObjectData(config.FILES.GULAG),
    groups: loadObjectData(config.FILES.GROUPS),
    monthlyActivity: loadObjectData(config.FILES.MONTHLY_ACTIVITY),
    activityStats: loadObjectData(config.FILES.ACTIVITY),
    delegatedPerms: loadObjectData(config.FILES.PERMS),
    subscriptions: loadObjectData(config.FILES.SUBSCRIPTIONS),
    musicDB: loadObjectData(config.FILES.MUSIC_DB),
    botConfig: loadObjectData(config.FILES.CONFIG),
    
    // Live in-memory trackers

    lastSummary: {timestamp: 0, chatId: null, messageId: null},
    isAiEnabled: true,
    repCooldowns: {},
    eventSetupState: {},
    eventEditState: {},
    addSongState: {},
    recentChatHistory: [],
    aiMessageIds: [],
    activeC4Games: {},
    activeMusicGames: {},
    pendingMusicGames: {}
};

// Initialize defaults if missing
if (!state.botConfig.aiModel) state.botConfig.aiModel = "google/gemini-2.5-flash";
if (!state.botConfig.aiPersona) state.botConfig.aiPersona = "You are a rude nonchalant telegram bully that thinks they are so tuff. Keep messages somewhat short.";
if (state.botConfig.welcomeText === undefined) state.botConfig.welcomeText = "Welcome {name} to the chat!";
if (state.botConfig.leaveText === undefined) state.botConfig.leaveText = "Goodbye {name}.";
if (state.botConfig.chatLink === undefined) state.botConfig.chatLink = "";
if (state.botConfig.verifyMode === undefined) state.botConfig.verifyMode = "none"; 
if (state.botConfig.activityResetHour === undefined) state.botConfig.activityResetHour = 0; 

module.exports = state;