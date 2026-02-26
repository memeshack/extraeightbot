const { DateTime } = require('luxon');
const { saveData, loadObjectData } = require('../dataManager');

module.exports = function(bot, state, config, utils, modules) {
    const { ai, music, connect4, events, birthdays } = modules;

    bot.on('callback_query', async (query) => {
        const data = query.data; 
        const chatId = String(query.message.chat.id); 
        const fromId = String(query.from.id);
        let name = query.from.first_name || "User";
        

// FIND: if (data.startsWith('ACT_TOP_')) {
// REPLACE THE WHOLE BLOCK WITH:

// 📊 PAGINATED ACTIVITY
        if (data.startsWith('ACT_PAGE_')) {
            // Now splits into 5 parts because of the ID at the end
            const parts = data.split('_');
            const type = parts[2];
            const page = parseInt(parts[3]);
            const targetId = parts[4]; // The ID of the menu owner

            // 🛑 SECURITY CHECK
            if (fromId !== targetId) {
                return bot.answerCallbackQuery(query.id, { text: "⚠️ This is not your menu!", show_alert: true });
            }

            const itemsPerPage = 15;
            let dataSource = type === 'monthly' ? state.monthlyActivity : state.activityStats;

            const allUsers = Object.entries(dataSource || {})
                .filter(([key, val]) => !isNaN(key) && typeof val === 'object' && val.count)
                .sort(([, a], [, b]) => b.count - a.count);

            const totalPages = Math.ceil(allUsers.length / itemsPerPage);
            const start = page * itemsPerPage;
            const currentItems = allUsers.slice(start, start + itemsPerPage);

            let lbText = `🏆 <b>Leaderboard - ${type.toUpperCase()}</b>\n<i>Page ${page + 1} of ${totalPages || 1}</i>\n\n`;
            currentItems.forEach(([id, user], index) => {
                lbText += `${start + index + 1}. <b>${user.name}</b>: <code>${user.count}</code>\n`;
            });

            // Pass the targetId to the Next/Back buttons too
            const navButtons = [];
            if (page > 0) navButtons.push({ text: "⬅️ Back", callback_data: `ACT_PAGE_${type}_${page - 1}_${targetId}` });
            if (start + itemsPerPage < allUsers.length) navButtons.push({ text: "Next ➡️", callback_data: `ACT_PAGE_${type}_${page + 1}_${targetId}` });

            const kb = [navButtons, [{ text: "🏠 Main Stats", callback_data: `ACT_STATS_MAIN_${targetId}` }]];
            return bot.editMessageText(lbText, { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'HTML', reply_markup: { inline_keyboard: kb } });
        }

        // 🏠 MAIN STATS MENU (Returning from a page)
        if (data.startsWith('ACT_STATS_MAIN_')) {
            const targetId = data.replace('ACT_STATS_MAIN_', '');

            // 🛑 SECURITY CHECK
            if (fromId !== targetId) {
                return bot.answerCallbackQuery(query.id, { text: "⚠️ This is not your menu!", show_alert: true });
            }

            const daily = state.activityStats.GLOBAL_STATS?.daily || 0;
            const monthly = state.monthlyActivity.GLOBAL_STATS?.monthly || 0;
            const allTime = state.activityStats.GLOBAL_STATS?.allTime || 0;
            
            const kb = [
                [{ text: "☀️ Daily Top", callback_data: `ACT_PAGE_daily_0_${targetId}` }, { text: "📅 Monthly Top", callback_data: `ACT_PAGE_monthly_0_${targetId}` }],
                [{ text: "🏆 All-Time Top", callback_data: `ACT_PAGE_alltime_0_${targetId}` }],
                [{ text: "❌ Close", callback_data: `ACT_CLOSE_${targetId}` }]
            ];
            
            return bot.editMessageText(`📊 <b>Group Message Totals</b>\n☀️ Today: ${daily}\n📅 Month: ${monthly}\n🌎 Total: ${allTime}`, { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'HTML', reply_markup: { inline_keyboard: kb } });
        }

        // ❌ CLOSE MENU (Already protected, just making sure you have it)
        if (data.startsWith('ACT_CLOSE_')) {
            if (fromId !== data.split('_')[2]) {
                return bot.answerCallbackQuery(query.id, { text: "⚠️ This is not your menu!", show_alert: true });
            }
            return bot.deleteMessage(chatId, query.message.message_id).catch(()=>{});
        }

if (data === 'ACT_STATS_MAIN') {
    const daily = state.activityStats?.GLOBAL_STATS?.daily || 0;
    const monthly = state.monthlyActivity?.GLOBAL_STATS?.monthly || 0;
    const allTime = state.activityStats?.GLOBAL_STATS?.allTime || 0;

    const statsMsg = 
        `📊 <b>Group Message Totals</b>\n` +
        `\n` +
        `☀️ <b>Today:</b> <code>${daily.toLocaleString()}</code>\n` +
        `📅 <b>Month:</b> <code>${monthly.toLocaleString()}</code>\n` +
        `🌎 <b>All-Time:</b> <code>${allTime.toLocaleString()}</code>\n` +
        `\n` +
        `<i>Use buttons for rankings:</i>`;

    const kb = [
        [{ text: "☀️ Daily Top", callback_data: "ACT_PAGE_daily_0" }, { text: "📅 Monthly Top", callback_data: "ACT_PAGE_monthly_0" }],
        [{ text: "🌎 All-Time Top", callback_data: "ACT_PAGE_alltime_0" }],
        [{ text: "❌ Close", callback_data: `ACT_CLOSE_${query.from.id}` }] // The only one that needs an ID
    ];

    return bot.editMessageText(statsMsg, {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: kb }
    });
}

// 💎 TELEGRAM STARS AI PURCHASING
        if (data.startsWith('BUY_TIER_')) {
            const parts = data.split('_');
            const tier = parts[2]; // 'basic' or 'full'
            
            let title, description, amount, photoUrl, payload;

// 1. Configure the Tiers
// 1. Configure the Tiers
            if (tier === 'basic') {
                title = "✨ Basic Tier";
                description = "Instant Activation.";
                amount = 100; // 100 Stars
                photoUrl = "https://i.postimg.cc/BZHJZgQK/tier1.png"; 
                payload = `AI_SUB_BASIC_${fromId}`;
            } else {
                title = "👑 Premium Tier";
                description = "Instant Activation";
                amount = 500; // 500 Stars
                photoUrl = "https://i.postimg.cc/RVm4WHNN/tier2.png";
                payload = `AI_SUB_FULL_${fromId}`;
            }

            // 2. Telegram Stars Configuration
            const prices = [{ label: title, amount: amount }];
            const providerToken = ""; // MUST be empty for Stars
            const currency = "XTR";   // MUST be XTR for Stars

            const invoiceOptions = {
                photo_url: photoUrl,
                photo_width: 800,
                photo_height: 400,
                need_name: false,
                need_email: false,
                need_phone_number: false,
                need_shipping_address: false,
                is_flexible: false,
                reply_markup: {
                    inline_keyboard: [
                        [{ text: `⭐️ Pay ${amount} Stars`, pay: true }],
                        [{ text: "❌ Cancel", callback_data: `ACT_CLOSE_${fromId}` }]
                    ]
                }
            };

            try {
                // Delete the text menu to keep the chat clean
                await bot.deleteMessage(chatId, query.message.message_id).catch(()=>{});

                // Send the premium native invoice
                await bot.sendInvoice(
                    chatId,
                    title,
                    description,
                    payload,
                    providerToken,
                    currency,
                    prices,
                    invoiceOptions
                );
                return bot.answerCallbackQuery(query.id);
            } catch (err) {
                console.error("Star Invoice Error:", err.message);
                return bot.answerCallbackQuery(query.id, { text: "Error generating invoice.", show_alert: true });
            }
        }

        // 📊 ACTIVITY MENU & PAGINATION
        if (data.startsWith('ACT_')) {
            const parts = data.split('_'); 
            const action = parts[1]; // MENU or PAGE or CLOSE
            const targetUserId = parts[parts.length - 1];

            if (fromId !== targetUserId) {
                return bot.answerCallbackQuery(query.id, { text: "⚠️ This is not your menu!", show_alert: true });
            }

            if (action === 'CLOSE') {
                return bot.deleteMessage(chatId, query.message.message_id).catch(() => {});
            }

            // This part handles the initial choice (Daily, Monthly, All-Time)
            if (action === 'MENU' || action === 'PAGE') {
                const timeframe = parts[2]; // daily, monthly, or alltime
                const page = action === 'PAGE' ? parseInt(parts[3]) : 0;
                
                let statsArray = [];
                let title = "";

                // UPDATE THIS SECTION TO ROUTE DATA CORRECTLY
                if (timeframe === 'daily') {
                    statsArray = Object.values(state.activityStats);
                    title = "Daily";
                } else if (timeframe === 'monthly') {
                    // Now points to your new monthly tracker
                    statsArray = Object.values(state.monthlyActivity); 
                    title = "Monthly";
                } else {
                    // Pulls the msg_count we added to the reputation file
                    statsArray = Object.values(state.reputations)
                        .map(u => ({ name: u.name, count: u.msg_count || 0 }));
                    title = "All-Time";
                }

                statsArray.sort((a, b) => b.count - a.count);

                if (statsArray.length === 0) {
                    return bot.answerCallbackQuery(query.id, { text: "No data available for this period.", show_alert: true });
                }

                const pageSize = 10;
                const totalPages = Math.ceil(statsArray.length / pageSize);
                const sliced = statsArray.slice(page * pageSize, (page + 1) * pageSize);

                let text = `📊 <b>${title} Leaderboard (Page ${page + 1}/${totalPages})</b>\n\n`;
                sliced.forEach((u, i) => {
                    text += `${(page * pageSize) + i + 1}. ${u.name}: <b>${u.count} msgs</b>\n`;
                });

                let kb = [];
                let navRow = [];
                if (page > 0) navRow.push({ text: "⬅️", callback_data: `ACT_PAGE_${timeframe}_${page - 1}_${fromId}` });
                if (page + 1 < totalPages) navRow.push({ text: "➡️", callback_data: `ACT_PAGE_${timeframe}_${page + 1}_${fromId}` });
                
                if (navRow.length > 0) kb.push(navRow);
                kb.push([{ text: "🔙 Back to Menu", callback_data: `ACT_BACK_${fromId}` }]);

                try {
                    await bot.editMessageText(text, {
                        chat_id: chatId,
                        message_id: query.message.message_id,
                        parse_mode: 'HTML',
                        reply_markup: { inline_keyboard: kb }
                    });
                } catch (e) {}
                return bot.answerCallbackQuery(query.id);
            }

            if (action === 'BACK') {
                const kb = [
                    [{ text: "☀️ Daily", callback_data: `ACT_MENU_daily_${fromId}` }],
                    [{ text: "📅 Monthly", callback_data: `ACT_MENU_monthly_${fromId}` }, { text: "🏆 All-Time", callback_data: `ACT_MENU_alltime_${fromId}` }],
                    [{ text: "❌ Close", callback_data: `ACT_CLOSE_${fromId}` }]
                ];
                try {
                    await bot.editMessageText(`📊 <b>Activity Leaderboard</b>\nWhich timeframe would you like to view?`, {
                        chat_id: chatId,
                        message_id: query.message.message_id,
                        parse_mode: 'HTML',
                        reply_markup: { inline_keyboard: kb }
                    });
                } catch (e) {}
                return bot.answerCallbackQuery(query.id);
            }
        }


        if (data === 'IGNORE') return bot.answerCallbackQuery(query.id).catch(()=>{});

        // 🔒 DELEGATED ADMIN PROMOTE CALLBACKS
        if (data.startsWith('PROM_')) {
            let parts = data.split('_');
            if (parts[1] === 'DONE') {
                bot.deleteMessage(chatId, query.message.message_id).catch(()=>{});
                return bot.answerCallbackQuery(query.id, { text: "Permissions Saved!" });
            }
            if (!config.OWNER_IDS.includes(fromId)) return bot.answerCallbackQuery(query.id, { text: "Only the bot owner can use this menu.", show_alert: true });
            
            let targetId = parts[2];
            if (state.delegatedPerms[targetId]) state.delegatedPerms[targetId][parts[1]] = !state.delegatedPerms[targetId][parts[1]];
            saveData(config.FILES.PERMS, state.delegatedPerms);
            
            let perms = state.delegatedPerms[targetId];
            let kb = [
                [{ text: `Permaban: ${perms.permaban ? '🟢' : '🔴'}`, callback_data: `PROM_permaban_${targetId}` }],
                [{ text: `Add Songs: ${perms.addsongs ? '🟢' : '🔴'}`, callback_data: `PROM_addsongs_${targetId}` }],
                [{ text: `AI Config: ${perms.aiconfig ? '🟢' : '🔴'}`, callback_data: `PROM_aiconfig_${targetId}` }],
                [{ text: "✅ Done", callback_data: `PROM_DONE_${targetId}` }]
            ];
            try { await bot.editMessageReplyMarkup({ inline_keyboard: kb }, { chat_id: chatId, message_id: query.message.message_id }); } catch (err) {}
            return bot.answerCallbackQuery(query.id);
        }

        // 🔒 VERIFICATION LOGIC (Standard Accept)
        // 🔒 VERIFICATION LOGIC (Standard Accept)
// 🔒 VERIFICATION UNMUTE LOGIC
// 🔒 VERIFICATION LOGIC (Standard Accept)
        if (data.startsWith('VERIFY_ACCEPT_')) {
            let targetGroup = data.replace('VERIFY_ACCEPT_', '');
            try {
                // The pre-4PM flat permissions list
                let opts = {
                    can_send_messages: true,
                    can_send_audios: true,
                    can_send_documents: true,
                    can_send_photos: true,
                    can_send_videos: true,
                    can_send_video_notes: true,
                    can_send_voice_notes: true,
                    can_send_polls: true,
                    can_send_other_messages: true,
                    can_add_web_page_previews: true,
                    can_change_info: true,
                    can_invite_users: true,
                    can_pin_messages: true,
                    can_manage_topics: true
                };
                
                await bot.restrictChatMember(targetGroup, Number(fromId), opts);
                bot.deleteMessage(chatId, query.message.message_id).catch(()=>{});
                bot.sendMessage(chatId, "✅ <b>Rules accepted.</b> You have been granted permissions in the chat.", { parse_mode: 'HTML' });
                if (state.pendingVerifications && state.pendingVerifications[fromId]) {
                    bot.editMessageReplyMarkup(
                        { inline_keyboard: [] }, 
                        { chat_id: targetGroup, message_id: state.pendingVerifications[fromId] }
                    ).catch(()=>{});
                    
                    // Clean up memory
                    delete state.pendingVerifications[fromId];
                }
                return bot.answerCallbackQuery(query.id);
            } catch (err) { 
                return bot.answerCallbackQuery(query.id, { text: `API Error: ${err.message}`, show_alert: true }); 
            }
        }

        // 🔒 VERIFICATION LOGIC (Channel Join Check)
        if (data.startsWith('VERIFY_CHECK_')) {
            let targetGroup = data.replace('VERIFY_CHECK_', '');
            let channel = state.botConfig.verifyChannel;
            if (!channel) return bot.answerCallbackQuery(query.id, { text: "Channel not configured.", show_alert: true });
            
            try {
                let member = await bot.getChatMember(channel, fromId);
                if (['member', 'administrator', 'creator'].includes(member.status)) {
                    
                    // The pre-4PM flat permissions list
                    let opts = {
                        can_send_messages: true,
                        can_send_audios: true,
                        can_send_documents: true,
                        can_send_photos: true,
                        can_send_videos: true,
                        can_send_video_notes: true,
                        can_send_voice_notes: true,
                        can_send_polls: true,
                        can_send_other_messages: true,
                        can_add_web_page_previews: true,
                        can_change_info: true,
                        can_invite_users: true,
                        can_pin_messages: true,
                        can_manage_topics: true
                    };
                    
                    await bot.restrictChatMember(targetGroup, Number(fromId), opts);
                    bot.deleteMessage(chatId, query.message.message_id).catch(()=>{});
                    bot.sendMessage(chatId, "✅ <b>Verification complete.</b> You have been granted full permissions in the group.", { parse_mode: 'HTML' });
                    if (state.pendingVerifications && state.pendingVerifications[fromId]) {
                    bot.editMessageReplyMarkup(
                        { inline_keyboard: [] }, 
                        { chat_id: targetGroup, message_id: state.pendingVerifications[fromId] }
                    ).catch(()=>{});
                    
                    // Clean up memory
                    delete state.pendingVerifications[fromId];
                }
                    return bot.answerCallbackQuery(query.id);
                } else {
                    return bot.answerCallbackQuery(query.id, { text: "You haven't joined the channel yet! ❌", show_alert: true });
                }
            } catch (err) {
                return bot.answerCallbackQuery(query.id, { text: `Check failed: ${err.message}`, show_alert: true });
            }
        }

        // 🎵 ADD SONG: CALLBACK LOGIC
        if (data === 'CANCEL_ADDSONG') {
            bot.deleteMessage(chatId, query.message.message_id).catch(()=>{});
            delete state.addSongState[fromId];
            return bot.answerCallbackQuery(query.id, { text: "Cancelled." });
        }
        
        if (data.startsWith('ADDGENRE_SEL_') && state.addSongState[fromId]) {
            state.addSongState[fromId].genre = data.replace('ADDGENRE_SEL_', '');
            state.addSongState[fromId].step = 'QUERY';
            bot.deleteMessage(chatId, query.message.message_id).catch(()=>{});
            const p = await bot.sendMessage(chatId, `🎵 <b>Genre: ${state.addSongState[fromId].genre}</b>\n\nSend the iTunes Search Query (e.g. 'Uptown Funk Bruno Mars')\n\n<i>Type /done when finished.</i>`, { reply_markup: { force_reply: true }, parse_mode: 'HTML' });
            state.addSongState[fromId].promptId = p.message_id;
            return bot.answerCallbackQuery(query.id);
        }
        
        if (data === 'ADDGENRE_NEW' && state.addSongState[fromId]) {
            state.addSongState[fromId].step = 'NEW_GENRE';
            bot.deleteMessage(chatId, query.message.message_id).catch(()=>{});
            const p = await bot.sendMessage(chatId, `📝 Send the name for the new Genre:`, { reply_markup: { force_reply: true }, parse_mode: 'HTML' });
            state.addSongState[fromId].promptId = p.message_id;
            return bot.answerCallbackQuery(query.id);
        }

        // 🎧 MUSIC QUIZ CALLBACKS
        if (data.startsWith('MZ_')) {
            if (!state.pendingMusicGames[chatId]) return bot.answerCallbackQuery(query.id, { text: "This menu has expired.", show_alert: true });
            if (state.pendingMusicGames[chatId].initiator !== fromId) return bot.answerCallbackQuery(query.id, { text: "You didn't start this game!", show_alert: true });
            
            if (data === 'MZ_CANCEL') {
                delete state.pendingMusicGames[chatId];
                bot.deleteMessage(chatId, query.message.message_id).catch(()=>{});
                return bot.answerCallbackQuery(query.id, { text: "Cancelled." });
            }
            
            if (data.startsWith('MZ_GENRE_')) {
                const genre = data.replace('MZ_GENRE_', '');
                state.musicDB = loadObjectData(config.FILES.MUSIC_DB);
                if (!state.musicDB[genre] || state.musicDB[genre].length === 0) return bot.answerCallbackQuery(query.id, { text: "⚠️ This genre is empty!", show_alert: true });

                state.pendingMusicGames[chatId].genre = genre;
                let kb = [[{text: "3 Rounds", callback_data: "MZ_ROUNDS_3"}, {text: "5 Rounds", callback_data: "MZ_ROUNDS_5"}], [{text: "10 Rounds", callback_data: "MZ_ROUNDS_10"}, {text: "20 Rounds", callback_data: "MZ_ROUNDS_20"}], [{text: "❌ Cancel", callback_data: "MZ_CANCEL"}]];
                try { await bot.editMessageText(`🎧 <b>Genre: ${genre}</b>\nHow many rounds?`, { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'HTML', reply_markup: { inline_keyboard: kb } }); } catch (err) {}
                return bot.answerCallbackQuery(query.id);
            }
            
            if (data.startsWith('MZ_ROUNDS_')) {
                const rounds = parseInt(data.replace('MZ_ROUNDS_', ''));
                const genre = state.pendingMusicGames[chatId].genre;
                state.musicDB = loadObjectData(config.FILES.MUSIC_DB);
                
                if (!state.musicDB[genre] || state.musicDB[genre].length === 0) {
                    bot.deleteMessage(chatId, query.message.message_id).catch(()=>{});
                    return bot.answerCallbackQuery(query.id, { text: "No songs available.", show_alert: true });
                }

                let maxR = Math.min(rounds, state.musicDB[genre].length);
                bot.deleteMessage(chatId, query.message.message_id).catch(()=>{});
                bot.sendMessage(chatId, `🎧 <b>Starting Music Quiz!</b>\nGenre: <b>${genre}</b>\nRounds: <b>${maxR}</b>\nGet ready...`, { parse_mode: 'HTML' });
                
                state.activeMusicGames[chatId] = { status: 'loading', pool: [...state.musicDB[genre]], round: 1, maxRounds: maxR, scores: {}, currentSong: null, timer: null };
                delete state.pendingMusicGames[chatId];
                setTimeout(() => music.startMusicRound(chatId), 2000);
                return bot.answerCallbackQuery(query.id);
            }
        }

        if (data.startsWith('EVSUB_')) {
            const evId = data.replace('EVSUB_', '');
            let ev = state.calendarEvents.find(e => (e.id || String(e.timestamp)) === evId);
            if (!ev) return bot.answerCallbackQuery(query.id, { text: "Event not found or already passed!", show_alert: true });
            
            if (!ev.subscribers) ev.subscribers = [];
            let isSubbed = ev.subscribers.includes(fromId);
            ev.subscribers = isSubbed ? ev.subscribers.filter(id => id !== fromId) : [...ev.subscribers, fromId];
            saveData(config.FILES.EVENT, state.calendarEvents);
            return bot.answerCallbackQuery(query.id, { text: isSubbed ? "🔕 Reminder cancelled for you." : "🔔 You will be pinged when this starts!", show_alert: true });
        }

        if (data.startsWith('C4_')) {
            const [, action, gameId, colStr] = data.split('_'); 
            const game = state.activeC4Games[gameId];
            if (!game) return bot.answerCallbackQuery(query.id, { text: "This game has expired.", show_alert: true });

            if (action === 'JOIN') {
                if (game.p1.id === fromId) return bot.answerCallbackQuery(query.id, { text: "You can't play against yourself!", show_alert: true });
                game.p2 = { id: fromId, name: name }; game.status = 'playing';
                let ui = connect4.renderC4Message(game);
                try { await bot.editMessageText(ui.text, { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'HTML', reply_markup: { inline_keyboard: ui.kb } }); } catch (err) {}
                return bot.answerCallbackQuery(query.id, { text: "You joined the game!" });
            }

            if (action === 'LEAVE') {
                if (fromId !== game.p1.id && fromId !== game.p2?.id && !(await utils.isAdmin(chatId, fromId))) return bot.answerCallbackQuery(query.id, { text: "You are not in this game!", show_alert: true });
                game.status = 'forfeit';
                let ui = connect4.renderC4Message(game);
                try { await bot.editMessageText(ui.text, { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'HTML', reply_markup: { inline_keyboard: ui.kb } }); } catch (err) {}
                delete state.activeC4Games[gameId];
                return bot.answerCallbackQuery(query.id, { text: "Game cancelled." });
            }

            if (action === 'DROP') {
                const col = parseInt(colStr);
                if (fromId !== game.p1.id && fromId !== game.p2?.id) return bot.answerCallbackQuery(query.id, { text: "Not in this game!", show_alert: true });
                if ((game.turn === 1 && fromId !== game.p1.id) || (game.turn === 2 && fromId !== game.p2?.id)) return bot.answerCallbackQuery(query.id, { text: "Not your turn!", show_alert: true });

                let targetRow = -1;
                for (let r = 5; r >= 0; r--) if (game.board[r][col] === 0) { targetRow = r; break; }
                if (targetRow === -1) return bot.answerCallbackQuery(query.id, { text: "Column full!", show_alert: true });

                game.board[targetRow][col] = game.turn;
                const winCoords = connect4.checkC4Win(game.board, game.turn);

                if (winCoords) {
                    game.status = 'won'; game.winner = game.turn;
                    winCoords.forEach(c => game.board[c[0]][c[1]] = 3);
                    if (!state.c4Stats[game.p1.id]) state.c4Stats[game.p1.id] = { name: game.p1.name, wins: 0, losses: 0, draws: 0 };
                    if (!state.c4Stats[game.p2.id]) state.c4Stats[game.p2.id] = { name: game.p2.name, wins: 0, losses: 0, draws: 0 };
                    state.c4Stats[game.turn === 1 ? game.p1.id : game.p2.id].wins += 1; 
                    state.c4Stats[game.turn === 1 ? game.p2.id : game.p1.id].losses += 1; 
                    saveData(config.FILES.C4_STAT, state.c4Stats);
                } else if (game.board[0].every(c => c !== 0)) {
                    game.status = 'draw';
                    if (!state.c4Stats[game.p1.id]) state.c4Stats[game.p1.id] = { name: game.p1.name, wins: 0, losses: 0, draws: 0 };
                    if (!state.c4Stats[game.p2.id]) state.c4Stats[game.p2.id] = { name: game.p2.name, wins: 0, losses: 0, draws: 0 };
                    state.c4Stats[game.p1.id].draws += 1; state.c4Stats[game.p2.id].draws += 1;
                    saveData(config.FILES.C4_STAT, state.c4Stats);
                } else {
                    game.turn = game.turn === 1 ? 2 : 1;
                }

                let ui = connect4.renderC4Message(game);
                try { await bot.editMessageText(ui.text, { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'HTML', reply_markup: { inline_keyboard: ui.kb } }); } catch (err) {}
                if (game.status === 'won' || game.status === 'draw') delete state.activeC4Games[gameId];
                return bot.answerCallbackQuery(query.id);
            }
        }

if (data.startsWith('EV_')) {
            const parts = data.split('_');
            const menuOwnerId = parts[parts.length - 1]; 
            const coreData = parts.slice(0, -1).join('_'); 

            // 🛑 SECURITY GUARD: Check if the clicker is an Admin or Owner
            const isGroupAdmin = await utils.isAdmin(bot, chatId, fromId, config);
            const isAdmin = config.OWNER_IDS.includes(fromId) || isGroupAdmin;

            // Define which actions are strictly for Admins
            const isAdminAction = coreData === 'EV_ADMIN_MENU' || coreData.startsWith('EV_EDIT_') || coreData.startsWith('EV_DEL_') || coreData.startsWith('EV_FLD_');

            // Block normal users from taking Admin actions
            if (isAdminAction && !isAdmin) {
                return bot.answerCallbackQuery(query.id, { text: "❌ Access Denied: Admin only.", show_alert: true });
            }

            // Block users from clicking other people's menus (unless they are an admin doing admin things)
            if (fromId !== menuOwnerId && !isAdminAction && coreData !== 'EVSUB') {
                return bot.answerCallbackQuery(query.id, { text: "⚠️ This is not your menu! Type /events to open your own.", show_alert: true });
            }

            if (coreData === 'EV_ADMIN_MENU') return events.renderAdminEditList(chatId, query.message.message_id, fromId);
            
            // We pass 'isAdmin' back into the main menu so the button stays hidden/visible correctly
            if (coreData === 'EV_BACK_MAIN') return events.renderPublicEventList(chatId, query.message.message_id, fromId, null, isAdmin);
            
            if (coreData === 'EV_CLOSE') return bot.deleteMessage(chatId, query.message.message_id).catch(()=>{});

            if (coreData.startsWith('EV_DEL_')) {
                state.calendarEvents.sort((a,b) => a.timestamp - b.timestamp);
                state.calendarEvents.splice(parseInt(coreData.split('_')[2]), 1);
                saveData(config.FILES.EVENT, state.calendarEvents);
                return events.renderAdminEditList(chatId, query.message.message_id, fromId); 
            }

            if (coreData.startsWith('EV_EDIT_REM_')) return events.renderEventRemindersMenu(chatId, query.message.message_id, parseInt(coreData.split('_')[3]), fromId);
            
            if (coreData.startsWith('EV_TOG_REM_')) {
                const [, , , idxStr, valStr] = coreData.split('_');
                const idx = parseInt(idxStr), val = parseInt(valStr);
                let ev = state.calendarEvents[idx];
                if (ev) {
                    if (!ev.reminders) ev.reminders = [];
                    ev.reminders = ev.reminders.includes(val) ? ev.reminders.filter(r => r !== val) : [...ev.reminders, val];
                    saveData(config.FILES.EVENT, state.calendarEvents);
                    return events.renderEventRemindersMenu(chatId, query.message.message_id, idx, fromId);
                }
            }
            
            if (coreData.startsWith('EV_EDIT_')) return events.renderEventEditMenu(chatId, query.message.message_id, parseInt(coreData.split('_')[2]), fromId);
            
            if (coreData.startsWith('EV_FLD_')) {
                const field = coreData.split('_')[2]; 
                const promptText = field === 'NAME' ? "📝 Send the new name:" : field === 'DATE' ? "📅 Send the new date (MM-DD):" : field === 'TIME' ? "⏰ Send the new time (e.g., 4:00 PM):" : "🌍 Send the new timezone (PST, CST, EST, GMT):";
                const p = await bot.sendMessage(chatId, promptText, { reply_markup: { force_reply: true } });
                state.eventEditState[fromId] = { chatId, eventIndex: parseInt(coreData.split('_')[3]), field, menuMsgId: query.message.message_id, promptMsgId: p.message_id };
                return bot.answerCallbackQuery(query.id);
            }
        }

        if (['CANCEL', 'REM_DONE'].includes(data) || data.match(/^(REM_TOGGLE_|M_|D_|H_|MIN_|AMPM_|T_)/)) {
            const st = state.eventSetupState[fromId];
            if (!st || st.chatId !== chatId) return bot.answerCallbackQuery(query.id, { text: "Not your active menu!", show_alert: true });
            
            if (data === 'CANCEL') {
                bot.deleteMessage(chatId, query.message.message_id).catch(()=>{}); delete state.eventSetupState[fromId];
                return bot.sendMessage(chatId, "Cancelled.", { reply_to_message_id: st.triggerMsgId });
            }
            if (data.startsWith('M_')) {
                st.eventMonth = data.replace('M_', ''); st.step = 'DAY'; bot.deleteMessage(chatId, query.message.message_id).catch(()=>{}); 
                const d = DateTime.local(DateTime.now().year, parseInt(st.eventMonth)).daysInMonth;
                let kb = []; let r = [];
                for (let i = 1; i <= d; i++) { r.push({ text: `${i}`, callback_data: `D_${i}` }); if (r.length === 5 || i === d) { kb.push(r); r = []; } }
                kb.push([{ text: "Cancel", callback_data: `CANCEL` }]);
                const p = await bot.sendMessage(chatId, "📅 <b>Day:</b>", { parse_mode: 'HTML', reply_markup: { inline_keyboard: kb }, reply_to_message_id: st.triggerMsgId });
                st.lastPromptId = p.message_id; return bot.answerCallbackQuery(query.id);
            }
            if (data.startsWith('D_')) {
                st.eventDay = data.replace('D_', ''); st.step = 'HOUR'; bot.deleteMessage(chatId, query.message.message_id).catch(()=>{}); 
                let kb = []; let r = [];
                for (let i = 1; i <= 12; i++) { r.push({ text: `${i}`, callback_data: `H_${i}` }); if (r.length === 4) { kb.push(r); r = []; } }
                kb.push([{ text: "Cancel", callback_data: `CANCEL` }]);
                const p = await bot.sendMessage(chatId, "⏰ <b>Select Hour:</b>", { parse_mode: 'HTML', reply_markup: { inline_keyboard: kb }, reply_to_message_id: st.triggerMsgId });
                st.lastPromptId = p.message_id; return bot.answerCallbackQuery(query.id);
            }
            if (data.startsWith('H_')) {
                st.eventHour = data.replace('H_', ''); st.step = 'MIN'; bot.deleteMessage(chatId, query.message.message_id).catch(()=>{}); 
                const p = await bot.sendMessage(chatId, "⏱️ <b>Select Minute:</b>", { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: ":00", callback_data: `MIN_00` }, { text: ":15", callback_data: `MIN_15` }, { text: ":30", callback_data: `MIN_30` }, { text: ":45", callback_data: `MIN_45` }], [{ text: "Cancel", callback_data: `CANCEL` }]] }, reply_to_message_id: st.triggerMsgId });
                st.lastPromptId = p.message_id; return bot.answerCallbackQuery(query.id);
            }
            if (data.startsWith('MIN_')) {
                st.eventMinute = data.replace('MIN_', ''); st.step = 'AMPM'; bot.deleteMessage(chatId, query.message.message_id).catch(()=>{}); 
                const p = await bot.sendMessage(chatId, "🌓 <b>AM or PM?</b>", { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: "☀️ AM", callback_data: `AMPM_AM` }, { text: "🌙 PM", callback_data: `AMPM_PM` }], [{ text: "Cancel", callback_data: `CANCEL` }]] }, reply_to_message_id: st.triggerMsgId });
                st.lastPromptId = p.message_id; return bot.answerCallbackQuery(query.id);
            }
            if (data.startsWith('AMPM_')) {
                st.eventAmPm = data.replace('AMPM_', ''); st.step = 'TZ'; st.eventTime = `${st.eventHour}:${st.eventMinute} ${st.eventAmPm}`; bot.deleteMessage(chatId, query.message.message_id).catch(()=>{}); 
                const p = await bot.sendMessage(chatId, "🌍 <b>Time Zone:</b>", { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{text: "PST", callback_data: `T_America/Los_Angeles`},{text: "CST", callback_data: `T_America/Chicago`}],[{text: "EST", callback_data: `T_America/New_York`},{text: "GMT", callback_data: `T_Europe/London`}],[{text: "Cancel", callback_data: `CANCEL`}]] }, reply_to_message_id: st.triggerMsgId });
                st.lastPromptId = p.message_id; return bot.answerCallbackQuery(query.id);
            }
            if (data.startsWith('T_')) {
                const tz = data.replace('T_', ''); bot.deleteMessage(chatId, query.message.message_id).catch(()=>{}); 
                const tN = { 'America/Los_Angeles': 'PST', 'America/Chicago': 'CST', 'America/New_York': 'EST', 'Europe/London': 'GMT' };
                let year = DateTime.now().year; 
                let eD = DateTime.fromFormat(`${st.eventMonth}/${st.eventDay}/${year} ${st.eventTime}`, "M/d/yyyy h:mm a", { zone: tz });
                if (eD.isValid && eD < DateTime.now()) { eD = eD.plus({ years: 1 }); year += 1; }
                if (!eD.isValid) { delete state.eventSetupState[fromId]; return bot.sendMessage(chatId, `Bad time format. Restart /newevent.`); }
                
                st.eventDateMillis = eD.toMillis();
                st.eventDateString = `${DateTime.local(year, parseInt(st.eventMonth), parseInt(st.eventDay)).toFormat('MMM d')} @ ${st.eventTime} (${tN[tz] || tz})`;
                st.raw = { month: st.eventMonth, day: st.eventDay, year: year, time: st.eventTime, tz: tz }; st.step = 'REMINDERS';
                
                try {
                    const p = await bot.sendMessage(chatId, `⏰ Select early reminders for <b>${st.eventName}</b>:`, { reply_to_message_id: st.triggerMsgId, parse_mode: 'HTML', reply_markup: { inline_keyboard: events.generateReminderKeyboard(st.reminders) } });
                    st.lastPromptId = p.message_id;
                } catch (err) {}
                return bot.answerCallbackQuery(query.id);
            }
            if (data.startsWith('REM_TOGGLE_')) {
                const val = parseInt(data.replace('REM_TOGGLE_', ''));
                st.reminders = st.reminders.includes(val) ? st.reminders.filter(r => r !== val) : [...st.reminders, val];
                try { await bot.editMessageReplyMarkup({ inline_keyboard: events.generateReminderKeyboard(st.reminders) }, { chat_id: chatId, message_id: query.message.message_id }); } catch (err) {}
                return;
            }
            if (data === 'REM_DONE') {
                const evId = Date.now().toString();
                state.calendarEvents.push({ id: evId, name: st.eventName, timestamp: st.eventDateMillis, dateString: st.eventDateString, chatId: chatId, raw: st.raw, subscribers: [], reminders: st.reminders, sentReminders: [] });
                saveData(config.FILES.EVENT, state.calendarEvents);
                bot.deleteMessage(chatId, query.message.message_id).catch(()=>{});
                try { await bot.sendMessage(chatId, `✅ <b>Event Successfully Scheduled!</b>\n\n📝 <b>Name:</b> ${st.eventName}\n📅 <b>Time:</b> ${st.eventDateString}\n\n<i>Click the button below to be quietly pinged when it starts!</i>`, { reply_to_message_id: st.triggerMsgId, parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: `🔔 Remind Me: ${st.eventName}`, callback_data: `EVSUB_${evId}` }]] } }); } catch (err) {}
                delete state.eventSetupState[fromId]; return bot.answerCallbackQuery(query.id, { text: "Event Saved!" });
            }
        } else {
            return bot.answerCallbackQuery(query.id).catch(()=>{});
        }
    });
};