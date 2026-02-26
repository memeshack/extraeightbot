const { db, loadObjectData } = require('./dataManager');
const config = require('./config');

console.log("🚀 Starting Migration...");

// 1. Migrate Social Credit (Reputations)
const repData = loadObjectData(config.FILES.REP);
const insertUser = db.prepare(`INSERT OR REPLACE INTO users (user_id, name, social_credit, msg_count) VALUES (?, ?, ?, ?)`);

Object.keys(repData).forEach(id => {
    // We combine activity counts here if they exist
    const activity = loadObjectData(config.FILES.ACTIVITY)[id] || { count: 0 };
    insertUser.run(id, repData[id].name, repData[id].score, activity.count);
});
console.log("✅ Social Credit & Activity Migrated.");

// 2. Migrate Connect 4 Stats
const c4Data = loadObjectData(config.FILES.C4_STAT);
const insertC4 = db.prepare(`INSERT OR REPLACE INTO connect4_stats (user_id, name, wins, losses, draws) VALUES (?, ?, ?, ?, ?)`);

Object.keys(c4Data).forEach(id => {
    insertC4.run(id, c4Data[id].name, c4Data[id].wins, c4Data[id].losses, c4Data[id].draws || 0);
});
console.log("✅ Connect 4 Stats Migrated.");

// 3. Migrate Music Stats
const musicData = loadObjectData(config.FILES.MUSIC_STAT);
const insertMusic = db.prepare(`INSERT OR REPLACE INTO music_stats (user_id, name, points, wins) VALUES (?, ?, ?, ?)`);

Object.keys(musicData).forEach(id => {
    insertMusic.run(id, musicData[id].name, musicData[id].points, musicData[id].wins);
});
console.log("✅ Music Stats Migrated.");

console.log("🎉 ALL DATA IMPORTED TO SQLITE.");
process.exit();