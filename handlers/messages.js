const axios = require('axios');
const { DateTime } = require('luxon');
const { saveData, loadObjectData } = require('../dataManager');

module.exports = function(bot, state, config, utils, modules) {
    const { ai, music, connect4, events, birthdays } = modules;



    // 🎧 THE HANDSHAKE (Add this right here!)
    bot.on('pre_checkout_query', async (query) => {
        console.log(`🌟 PAYMENT ATTEMPT: ${query.from.first_name} is trying to buy!`);
        try {
            await bot.answerPreCheckoutQuery(query.id, true);
            console.log("✅ HANDSHAKE SENT: Loading should stop now.");
        } catch (err) {
            console.error("❌ HANDSHAKE ERROR:", err.message);
        }
    });

    // ... your existing bot.on('message') logic starts below ...
    // 🚪 WELCOME / LEAVE & BAN CHECK (Supergroup Safe)
        bot.on('chat_member', async (event) => {
        // 👇 ADD THIS LINE to completely ignore channel joins
        if (event.chat.type === 'channel') return;

        const chatId = String(event.chat.id); 
        const userId = String(event.new_chat_member.user.id);
        const user = event.new_chat_member.user;
        // 👇 ADD THIS LINE 👇
        console.log(`🔥 CHAT MEMBER EVENT: ${user.first_name} went from ${event.old_chat_member.status} to ${event.new_chat_member.status}`);

        // BAN CHECK
        // ... (rest of your code)

        // BAN CHECK
        if (chatId === config.TARGET_GROUP_ID) {
            if (['member', 'restricted'].includes(event.new_chat_member.status)) {
                if (state.bannedUsers.includes(userId)) {
                    bot.banChatMember(chatId, userId).catch(() => {});
                    return;
                }
            }
        }
    async function hasPremium(chatId) {
        // Owner always has premium
        if (chatId === config.OWNER_ID) return true;
        
        const sub = state.subscriptions[chatId];
        if (!sub) return false;

        // Check if the subscription has expired
        const now = Date.now();
        if (sub.expiry && now > sub.expiry) return false;

        return true;
    }
        

        
// A join is when the new status is 'member'/'restricted' AND the old status wasn't already 'member'/'restricted'
       
        const oldStatus = event.old_chat_member.status;
        const newStatus = event.new_chat_member.status;
        
        // These 4 statuses mean the user is currently inside the chat
        const activeStatuses = ['member', 'creator', 'administrator', 'restricted'];
        const wasInChat = ['member', 'creator', 'administrator', 'restricted'].includes(oldStatus);
        const isNowInChat = ['member', 'creator', 'administrator', 'restricted'].includes(newStatus);
        const isJoin = !wasInChat && isNowInChat;
        const isLeave = wasInChat && !isNowInChat;

        // ONLY fire welcome/leave messages in the main group, not the channel
        if (chatId === config.TARGET_GROUP_ID) {
            

            // WELCOME LISTENER
            if (isJoin && userId === state.botId) {
                // Record who added the bot
                const adderId = String(event.from.id);
                const adderName = event.from.first_name || "Unknown";
                const chatTitle = event.chat.title || "Private Chat";
                
                state.groups[chatId] = {
                    title: chatTitle,
                    addedBy: adderName,
                    addedById: adderId,
                    date: DateTime.now().setZone('America/New_York').toFormat('yyyy-MM-dd HH:mm:ss')
                };
                saveData(config.FILES.GROUPS, state.groups);
            
                // 1. Create the invisible tag
                // We use a Zero-Width Space (&#8203;) and wrap it in a mention link
                const invisibleTag = `<a href="tg://user?id=${userId}">&#8203;</a>`;
                
                // 2. Insert the tag at the start of the message
                let welcomeMsg = invisibleTag + state.botConfig.welcomeText.replace('{name}', user.first_name);
                
                if (['talk', 'media', 'channel'].includes(state.botConfig.verifyMode)) {
                    let perms = state.botConfig.verifyMode === 'talk' 
                        ? { can_send_messages: false }
                        : { 
                            can_send_messages: true, can_send_audios: false, can_send_documents: false, 
                            can_send_photos: false, can_send_videos: false, can_send_video_notes: false, 
                            can_send_voice_notes: false, can_send_polls: false, can_send_other_messages: false 
                        };
                    
                    if (state.botConfig.verifyMode === 'channel') {
                        perms = { can_send_messages: false };
                    }

                    try { await bot.restrictChatMember(chatId, userId, { permissions: perms }); } catch(e) {}
                    
                    let kb = [[{ text: "✅ Tap to Verify", url: `https://t.me/${state.botUsername}?start=verify_${chatId}` }]];
                    await bot.sendMessage(chatId, welcomeMsg, { parse_mode: 'HTML', reply_markup: { inline_keyboard: kb } });
                } else {
                    await bot.sendMessage(chatId, welcomeMsg, { parse_mode: 'HTML' });
                }
            }

            // LEAVE LISTENER
            if (isLeave && userId !== state.botId && state.botConfig.chatLink !== "") {
                let leftMsg = state.botConfig.leaveText.replace('{name}', user.first_name);
                let dmText = `${leftMsg}\n\nHere is the link if you want to return: ${state.botConfig.chatLink}`;
                await bot.sendMessage(userId, dmText).catch(()=>{});
            }
        }
    });

    bot.on('message', async (msg) => {


    
    // Add this temporary debug line:
    if (msg.successful_payment) console.log("💰 I SEE A SUCCESSFUL PAYMENT!");
    
    // ... rest of your code

        const chatId = String(msg.chat.id); 
        const fromId = String(msg.from.id);
        
        let name = msg.from?.first_name || "User";
        let text = msg.text || msg.caption || "";
        // 🔎 AUTO-DISCOVERY: Record group if not already known
        if (msg.chat.type !== 'private' && !state.groups[chatId]) {
            state.groups[chatId] = {
                title: msg.chat.title || "Unknown Group",
                addedBy: "Auto-Discovered", // We don't know who added it originally
                addedById: "N/A",
                date: DateTime.now().setZone('America/New_York').toFormat('yyyy-MM-dd HH:mm:ss')
            };
            saveData(config.FILES.GROUPS, state.groups);
            console.log(`📡 Discovered new group: ${msg.chat.title}`);
        }


        // 🔒 DEEP LINK VERIFICATION LISTENER (Private DMs)
        if (msg.chat && msg.chat.type === 'private') {
            if (text.startsWith('/start verify_')) {
                let targetGroup = text.split('_')[1];
                
                if (state.botConfig.verifyMode === 'channel') {
                    let channel = state.botConfig.verifyChannel;
                    if (!channel) return bot.sendMessage(chatId, "⚠️ Verification channel not set up by admin.");
                    
                    let cleanChannel = channel.replace('@', '');
                    let kb = [
                        [{ text: "📢 Join Channel", url: `https://t.me/${cleanChannel}` }],
                        [{ text: "✅ I have joined", callback_data: `VERIFY_CHECK_${targetGroup}` }]
                    ];
                    await bot.sendMessage(chatId, `Welcome! To gain access to the group, you must join our channel first.`, { reply_markup: { inline_keyboard: kb }});
                } else {
                    let kb = [[{ text: "📜 I Accept the Rules", callback_data: `VERIFY_ACCEPT_${targetGroup}` }]];
                    await bot.sendMessage(chatId, "Welcome! Please accept the rules to gain full permissions in the group.", { reply_markup: { inline_keyboard: kb }});
                }
                return;
            }
            if (config.OWNER_IDS.includes(fromId) && msg.sticker) {
                return bot.sendMessage(chatId, `🎯 <b>Sticker ID:</b>\n<code>${msg.sticker.file_id}</code>\n\n<i>Copy and paste this into the code!</i>`, { parse_mode: 'HTML' });
            }
        }

        if (!msg.chat || text === "") return;
        
        const isTargetGroup = (chatId === config.TARGET_GROUP_ID);
        const isOwner = config.OWNER_IDS.includes(fromId);

        if (!isTargetGroup && !isOwner) return;

        if (isTargetGroup && state.bannedUsers.includes(fromId)) {
            bot.deleteMessage(chatId, msg.message_id).catch(()=>{});
            bot.banChatMember(chatId, fromId).catch(()=>{});
            return;
        }

        let dataChanged = false;
        
        // 📈 UPDATE DATABASES & ACTIVITY LEADERBOARD
        // Inside your bot.on('message', async (msg) => { ...

        const userId = fromId; // <--- ADD THIS LINE to fix the ReferenceError
        const userName = msg.from.first_name || "Unknown";

        if (!msg.from.is_bot && chatId === config.TARGET_GROUP_ID) {
            // 1. Daily Activity
            if (!state.activityStats[userId]) state.activityStats[userId] = { name: userName, count: 0 };
            state.activityStats[userId].count++;
            
            // 2. Monthly Activity
            if (!state.monthlyActivity[userId]) state.monthlyActivity[userId] = { name: userName, count: 0 };
            state.monthlyActivity[userId].count++;

            // 3. All-Time Activity (Stored in Reputation JSON)
            if (!state.reputations[userId]) state.reputations[userId] = { name: userName, score: 0, msg_count: 0 };
            state.reputations[userId].msg_count = (state.reputations[userId].msg_count || 0) + 1;

            // Save the changes
            saveData(config.FILES.ACTIVITY, state.activityStats);
            saveData(config.FILES.MONTHLY_ACTIVITY, state.monthlyActivity);
            saveData(config.FILES.REP, state.reputations);
        }
                
        if (state.activityStats[fromId].name !== name) {
            state.activityStats[fromId].name = name;
            dataChanged = true;
        }
        if (!text.startsWith('/')) {
            state.activityStats[fromId].count += 1;
            dataChanged = true;
        }
        if (state.reputations[fromId] && state.reputations[fromId].name !== name) { 
            state.reputations[fromId].name = name; dataChanged = true; 
        }
        if (state.c4Stats[fromId] && state.c4Stats[fromId].name !== name) { 
            state.c4Stats[fromId].name = name; dataChanged = true; 
        }
        if (state.musicStats[fromId] && state.musicStats[fromId].name !== name) {
            state.musicStats[fromId].name = name; dataChanged = true;
        }
        
        let bdayIndex = state.birthdays.findIndex(b => b.userId === fromId);
        if (bdayIndex !== -1) {
            if (state.birthdays[bdayIndex].name !== name || state.birthdays[bdayIndex].username !== (msg.from.username || '')) {
                state.birthdays[bdayIndex].name = name; 
                state.birthdays[bdayIndex].username = msg.from.username || ''; 
                dataChanged = true;
            }
        }
        
        if (dataChanged) { 
            saveData(config.FILES.ACTIVITY, state.activityStats);
            saveData(config.FILES.REP, state.reputations); 
            saveData(config.FILES.BDAY, state.birthdays); 
            saveData(config.FILES.C4_STAT, state.c4Stats); 
            saveData(config.FILES.MUSIC_STAT, state.musicStats);
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
            return utils.safeReply(chatId, `<b>${randomAnswer}</b>`, msg.message_id, 'HTML');
        }

        // 1. ADD SONG WIZARD CHECK
        if (state.addSongState[fromId] && state.addSongState[fromId].chatId === chatId) {
            const st = state.addSongState[fromId];
            if (text.toLowerCase() === '/done' || text.toLowerCase() === '/cancel') {
                bot.deleteMessage(chatId, msg.message_id).catch(()=>{}); 
                bot.deleteMessage(chatId, st.promptId).catch(()=>{});
                delete state.addSongState[fromId];
                return bot.sendMessage(chatId, "✅ <b>Finished adding songs.</b>", { parse_mode: 'HTML' });
            }

            if (msg.reply_to_message && msg.reply_to_message.message_id === st.promptId) {
                if (st.step === 'NEW_GENRE') {
                    st.genre = text.trim();
                    if (!state.musicDB[st.genre]) state.musicDB[st.genre] = [];
                    saveData(config.FILES.MUSIC_DB, state.musicDB);
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
                        let validTrack = response.data.results?.find(t => t.previewUrl && !(!st.query.toLowerCase().includes('live') && (t.trackName.toLowerCase().includes('(live') || t.trackName.toLowerCase().includes(' - live') || t.trackName.toLowerCase().includes('[live'))));

                        if (validTrack) {
                            const displayName = `${validTrack.trackName} - ${validTrack.artistName}`;
                            let isDuplicate = state.musicDB[st.genre]?.some(s => s.name === displayName);

                            if (isDuplicate) {
                                let dupText = `⚠️ <b>Duplicate Song!</b>\n\n<b>${displayName}</b> is already in the <b>${st.genre}</b> genre.\n\nSend a different iTunes Search Query (or type /done):`;
                                const p = await bot.sendMessage(chatId, dupText, { reply_markup: { force_reply: true }, parse_mode: 'HTML' });
                                st.promptId = p.message_id;
                                return;
                            }
                            
                            let trackNameLower = validTrack.trackName.toLowerCase().replace(/’/g, "'");
                            let baseRaw = trackNameLower.split('(')[0].split('-')[0].trim();
                            let baseWithApos = baseRaw.replace(/[^a-z0-9\s']/g, '').replace(/\s+/g, ' ').trim();
                            let baseNoApos = baseWithApos.replace(/'/g, '');
                            let altWithApos = trackNameLower.replace(/[^a-z0-9\s']/g, '').replace(/\s+/g, ' ').trim();
                            let altNoApos = altWithApos.replace(/'/g, '');
                            
                            let answers = [baseNoApos];
                            if (baseWithApos !== baseNoApos) answers.push(baseWithApos);
                            if (!answers.includes(altNoApos)) answers.push(altNoApos);
                            if (altWithApos !== altNoApos && !answers.includes(altWithApos)) answers.push(altWithApos);

                            if (!state.musicDB[st.genre]) state.musicDB[st.genre] = [];
                            state.musicDB[st.genre].push({ query: st.query, name: displayName, answers: answers });
                            saveData(config.FILES.MUSIC_DB, state.musicDB);
                            
                            let successText = `✅ <b>Added:</b> ${displayName}\n\nSend the next iTunes Search Query (or type /done):`;
                            const p = await bot.sendMessage(chatId, successText, { reply_markup: { force_reply: true }, parse_mode: 'HTML' });
                            st.promptId = p.message_id;
                            return;
                        } else {
                            let failText = `❌ <b>Song not found on iTunes!</b> (or no clean version).\n\nTry a different search query (or type /done):`;
                            const p = await bot.sendMessage(chatId, failText, { reply_markup: { force_reply: true }, parse_mode: 'HTML' });
                            st.promptId = p.message_id;
                            return;
                        }
                    } catch (err) {
                        const p = await bot.sendMessage(chatId, `⚠️ iTunes API Error. Try again (or type /done):`, { reply_markup: { force_reply: true }, parse_mode: 'HTML' });
                        st.promptId = p.message_id;
                        return;
                    }
                }
            }
        }

        // 2. EVENT CREATION WIZARD CHECK
        if (state.eventSetupState[fromId] && state.eventSetupState[fromId].chatId === chatId) {
            const st = state.eventSetupState[fromId];
            if (text === '/cancel') {
                bot.deleteMessage(chatId, msg.message_id).catch(()=>{}); 
                bot.deleteMessage(chatId, st.lastPromptId).catch(()=>{});
                delete state.eventSetupState[fromId]; 
                return bot.sendMessage(chatId, "🚫 Cancelled.", { reply_to_message_id: st.triggerMsgId });
            }
            if (msg.reply_to_message && msg.reply_to_message.message_id === st.lastPromptId && st.step === 'NAME') {
                st.eventName = text; 
                st.step = 'MONTH';
                bot.deleteMessage(chatId, msg.message_id).catch(()=>{}); 
                bot.deleteMessage(chatId, st.lastPromptId).catch(()=>{}); 
                
                const m = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]; 
                let k = [];
                for (let i = 0; i < 12; i += 3) {
                    k.push([{text: m[i], callback_data: `M_${i+1}`}, {text: m[i+1], callback_data: `M_${i+2}`}, {text: m[i+2], callback_data: `M_${i+3}`}]);
                }
                k.push([{text: "Cancel", callback_data: `CANCEL`}]);
                
                const p = await bot.sendMessage(chatId, "📅 <b>Month:</b>", { parse_mode: 'HTML', reply_markup: { inline_keyboard: k }, reply_to_message_id: st.triggerMsgId });
                st.lastPromptId = p.message_id; 
                return;
            }
        }

        // 3. EVENT EDIT MENU CHECK
        if (state.eventEditState[fromId] && state.eventEditState[fromId].chatId === chatId) {
            const st = state.eventEditState[fromId];
            if (msg.reply_to_message && msg.reply_to_message.message_id === st.promptMsgId) {
                bot.deleteMessage(chatId, msg.message_id).catch(()=>{}); 
                bot.deleteMessage(chatId, st.promptMsgId).catch(()=>{});
                
                state.calendarEvents.sort((a,b) => a.timestamp - b.timestamp);
                let ev = state.calendarEvents[st.eventIndex];
                
                if (ev) {
                    if (st.field === 'NAME') {
                        ev.name = text;
                    } else if (st.field === 'DATE' && ev.raw) {
                        const parts = text.split('-');
                        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                            ev.raw.month = parts[0]; ev.raw.day = parts[1];
                        } else {
                            bot.sendMessage(chatId, "⚠️ Invalid date format. Use MM-DD.").then(m => setTimeout(() => bot.deleteMessage(chatId, m.message_id).catch(()=>{}), 3000));
                            delete state.eventEditState[fromId]; 
                            return events.renderEventEditMenu(chatId, st.menuMsgId, st.eventIndex, fromId);
                        }
                    } else if (st.field === 'TIME' && ev.raw) {
                        ev.raw.time = text.trim().toUpperCase().replace(/\s*([AP]M)/, ' $1');
                    } else if (st.field === 'TZ' && ev.raw) {
                        const tzMap = { 'PST': 'America/Los_Angeles', 'CST': 'America/Chicago', 'EST': 'America/New_York', 'GMT': 'Europe/London' };
                        let inputTz = text.toUpperCase().trim();
                        if (tzMap[inputTz]) ev.raw.tz = tzMap[inputTz];
                    }
                    
                    if (st.field !== 'NAME' && ev.raw) {
                        const r = ev.raw;
                        let eventDate = DateTime.fromFormat(`${r.month}/${r.day}/${r.year} ${r.time}`, "M/d/yyyy h:mm a", { zone: r.tz });
                        if (eventDate.isValid && eventDate < DateTime.now()) { eventDate = eventDate.plus({ years: 1 }); r.year += 1; }
                        if (eventDate.isValid) {
                            ev.timestamp = eventDate.toMillis();
                            const tzNames = { 'America/Los_Angeles': 'PST', 'America/Chicago': 'CST', 'America/New_York': 'EST', 'Europe/London': 'GMT' };
                            ev.dateString = `${DateTime.local(r.year, parseInt(r.month), parseInt(r.day)).toFormat('MMMM d')} @ ${r.time} (${tzNames[ev.raw.tz] || ev.raw.tz})`;
                        }
                    }
                    saveData(config.FILES.EVENT, state.calendarEvents);
                }
                delete state.eventEditState[fromId]; 
                return events.renderEventEditMenu(chatId, st.menuMsgId, st.eventIndex, fromId); 
            }
        }

        // 🎧 GUESS THE SONG INTERCEPTOR
        if (state.activeMusicGames[chatId] && state.activeMusicGames[chatId].status === 'playing' && state.activeMusicGames[chatId].currentSong) {
            const game = state.activeMusicGames[chatId];
            let rawGuess = text.toLowerCase().replace(/’/g, "'");
            let guessWithApos = rawGuess.replace(/[^a-z0-9\s']/g, '').replace(/\s+/g, ' ').trim();
            let guessNoApos = guessWithApos.replace(/'/g, '');
            
            let isCorrect = game.currentSong.answers.some(ans => guessWithApos.includes(ans) || guessNoApos.includes(ans));
            
            if (isCorrect) {
                game.status = 'loading'; 
                clearTimeout(game.timer);
                
                if (!game.scores[fromId]) game.scores[fromId] = { id: fromId, name: msg.from.first_name, score: 0 };
                game.scores[fromId].score += 10;
                
                await bot.sendMessage(chatId, `🎉 <b>YES!</b> ${msg.from.first_name} got it!\nSong: <b>${game.currentSong.name}</b>\n<i>+10 Points</i>`, { parse_mode: 'HTML', reply_to_message_id: msg.message_id });
                game.round += 1;
                setTimeout(() => music.startMusicRound(chatId), 4000);
                return;
            }
        }

        let args = text.split(' '); 
        let cmd = args[0].split('@')[0].toLowerCase(); 
        let query = args.slice(1).join(' ').trim();

        // 👑 OWNER COMMANDS
        if (isOwner) {
            if (cmd === '$restart') {
                return bot.sendMessage(chatId, "🔄 <b>Restarting bot...</b>", { parse_mode: 'HTML', reply_to_message_id: msg.message_id }).then(() => process.exit(1));
            }
            if (cmd === '/promote') {
                if (!msg.reply_to_message || !msg.reply_to_message.from) return utils.safeReply(chatId, "⚠️ You must reply to a user to promote them.", msg.message_id);
                let targetId = String(msg.reply_to_message.from.id);
                if (!state.delegatedPerms[targetId]) state.delegatedPerms[targetId] = { permaban: false, addsongs: false, aiconfig: false };
                saveData(config.FILES.PERMS, state.delegatedPerms);
                let perms = state.delegatedPerms[targetId];
                let kb = [
                    [{ text: `Permaban: ${perms.permaban ? '🟢' : '🔴'}`, callback_data: `PROM_permaban_${targetId}` }],
                    [{ text: `Add Songs: ${perms.addsongs ? '🟢' : '🔴'}`, callback_data: `PROM_addsongs_${targetId}` }],
                    [{ text: `AI Config: ${perms.aiconfig ? '🟢' : '🔴'}`, callback_data: `PROM_aiconfig_${targetId}` }],
                    [{ text: "✅ Done", callback_data: `PROM_DONE_${targetId}` }]
                ];
                return bot.sendMessage(chatId, `👑 <b>Delegating Permissions for ${msg.reply_to_message.from.first_name}</b>`, { parse_mode: 'HTML', reply_markup: { inline_keyboard: kb } });
            }
            if (cmd === '/setwelcome' && query) { state.botConfig.welcomeText = query; saveData(config.FILES.CONFIG, state.botConfig); return utils.safeReply(chatId, `✅ Welcome message set.`, msg.message_id); }
            if (cmd === '/setleave' && query) { state.botConfig.leaveText = query; saveData(config.FILES.CONFIG, state.botConfig); return utils.safeReply(chatId, `✅ Leave message set.`, msg.message_id); }
            if (cmd === '/setchatlink' && query) { state.botConfig.chatLink = query; saveData(config.FILES.CONFIG, state.botConfig); return utils.safeReply(chatId, `✅ Chat link set.`, msg.message_id); }
            if (cmd === '/setverify') {
                if (['none', 'talk', 'media', 'channel'].includes(query)) { 
                    state.botConfig.verifyMode = query; 
                    saveData(config.FILES.CONFIG, state.botConfig); 
                    return utils.safeReply(chatId, `✅ Verification mode set to: <b>${query}</b>`, msg.message_id, 'HTML'); 
                }
                return utils.safeReply(chatId, "⚠️ Use: /setverify none | talk | media | channel", msg.message_id);
            }
            if (cmd === '/setchannel') {
                if (!query) return utils.safeReply(chatId, "⚠️ Provide the channel @username.", msg.message_id);
                if (!query.startsWith('@')) query = '@' + query;
                state.botConfig.verifyChannel = query;
                saveData(config.FILES.CONFIG, state.botConfig);
                return utils.safeReply(chatId, `✅ Verification channel set to: <b>${query}</b>\n\n<i>Make sure I am an admin in that channel!</i>`, msg.message_id, 'HTML');
            }
            if (cmd === '/setactivityreset') {
                let hour = parseInt(query);
                if (isNaN(hour) || hour < 0 || hour > 23) return utils.safeReply(chatId, "⚠️ Provide an hour between 0 and 23 (EST time).", msg.message_id);
                state.botConfig.activityResetHour = hour; saveData(config.FILES.CONFIG, state.botConfig); return utils.safeReply(chatId, `✅ Activity board will now reset at ${hour}:00 EST every day.`, msg.message_id);
            }
        }

        if (cmd === '/whereami' && isOwner) {
            const entries = Object.entries(state.groups);
            let groupList = `<b>bot instance location report</b>\n`;
            groupList += `Total Active Connections: <b>${entries.length}</b>\n━━━━━━━━━━\n\n`;
            
            if (entries.length === 0) {
                groupList += "<i>No group data recorded yet.</i>";
            } else {
                entries.forEach(([id, info], i) => {
                    groupList += `${i + 1}. <b>${info.title}</b>\n`;
                    groupList += `ID: <code>${id}</code>\n`;
                    groupList += `Source: <i>${info.addedBy}</i>\n\n`;
                });
            }
            
            return utils.safeReply(chatId, groupList, msg.message_id, 'HTML');
        }

        // 🔒 DELEGATED PERMISSIONS COMMANDS
        if (utils.hasPerm(fromId, 'addsongs') && cmd === '/addsong') {
            state.musicDB = loadObjectData(config.FILES.MUSIC_DB); 
            let kb = []; let row = [];
            Object.keys(state.musicDB).forEach(genre => {
                row.push({ text: `${genre} (${state.musicDB[genre].length})`, callback_data: `ADDGENRE_SEL_${genre}` });
                if (row.length === 2) { kb.push(row); row = []; }
            });
            if (row.length > 0) kb.push(row);
            kb.push([{ text: "➕ Add New Genre", callback_data: `ADDGENRE_NEW` }, { text: "❌ Cancel", callback_data: `CANCEL_ADDSONG` }]);
            const p = await bot.sendMessage(chatId, "🎵 <b>Add New Song</b>\n\nSelect a genre or add a new one:", { reply_markup: { inline_keyboard: kb }, parse_mode: 'HTML' });
            state.addSongState[fromId] = { chatId: chatId, step: 'GENRE_SELECT', triggerId: msg.message_id, promptId: p.message_id };
            return;
        }

        if (utils.hasPerm(fromId, 'permaban')) {
            if (cmd === "/permban" && query && !state.bannedUsers.includes(query)) { state.bannedUsers.push(query); saveData(config.FILES.BAN, state.bannedUsers); return bot.sendMessage(chatId, `Banned: ${query}`); }
            if (cmd === "/unpermban" && query) { state.bannedUsers = state.bannedUsers.filter(id => id !== query); saveData(config.FILES.BAN, state.bannedUsers); return bot.sendMessage(chatId, `Unbanned: ${query}`); }
        }

        if (utils.hasPerm(fromId, 'aiconfig')) {
            if (cmd === '/newmodel' && query) { state.botConfig.aiModel = query; saveData(config.FILES.CONFIG, state.botConfig); return utils.safeReply(chatId, `✅ <b>Model updated to:</b> ${query}`, msg.message_id, 'HTML'); }
            if (cmd === '/changerole' && query) { state.botConfig.aiPersona = query; saveData(config.FILES.CONFIG, state.botConfig); return utils.safeReply(chatId, `✅ <b>Persona updated:</b>\n\n<i>${query}</i>`, msg.message_id, 'HTML'); }
            if (cmd === '/currentrole') return utils.safeReply(chatId, `🎭 <b>Current AI Persona:</b>\n\n<i>${state.botConfig.aiPersona}</i>`, msg.message_id, 'HTML');
        }

        if (cmd === '/toggleai' && await utils.isAdmin(chatId, fromId)) {
            state.isAiEnabled = !state.isAiEnabled; 
            return utils.safeReply(chatId, `AI Chat: <b>${state.isAiEnabled ? "ON" : "OFF"}</b>`, msg.message_id, 'HTML');
        }

        if (cmd === '/gulag' && await utils.isAdmin(chatId, fromId)) {
            if (msg.reply_to_message?.from) {
                let targetId = String(msg.reply_to_message.from.id);
                if (targetId === state.botId || config.OWNER_IDS.includes(targetId)) return utils.safeReply(chatId, "⚠️ Cannot gulag this user.", msg.message_id);
                
                let currentLevel = state.gulagStats[targetId] || 0;
                const durations = [180, 300, 600, 1800, 3600, 7200, 14400, 28800, 86400];
                const labels = ["3 minutes", "5 minutes", "10 minutes", "30 minutes", "1 hour", "2 hours", "4 hours", "8 hours", "1 day"];
                
                if (currentLevel >= durations.length) currentLevel = durations.length - 1;
                let untilDate = Math.floor(Date.now() / 1000) + durations[currentLevel];
                
                try {
                    await bot.restrictChatMember(chatId, targetId, { permissions: { can_send_messages: false }, until_date: untilDate });
                    state.gulagStats[targetId] = currentLevel + 1; saveData(config.FILES.GULAG, state.gulagStats);
                    await bot.sendMessage(chatId, `<b><a href="https://t.me/gulagged">You have been sent to the gulag for ${labels[currentLevel]}</a></b>`, { parse_mode: 'HTML', reply_to_message_id: msg.reply_to_message.message_id, disable_web_page_preview: true });
                } catch (err) { return utils.safeReply(chatId, `⚠️ Failed to gulag.`, msg.message_id); }
            } else { return utils.safeReply(chatId, "⚠️ Reply to the user you want to gulag.", msg.message_id); }
        }

        if (cmd === '/commands') {
            let menu = `<b>COMMAND DIRECTORY</b>\n━━━━━━━━━━\n\n`;
            if (isOwner) menu += `<b>[ OWNER CONTROLS ]</b>\n• /promote (reply)\n• $restart\n• /setwelcome [text]\n• /setleave [text]\n• /setchatlink [url]\n• /setverify [none|talk|media|channel]\n• /setchannel [@channel]\n• /setactivityreset [hour]\n\n`;
            if (utils.hasPerm(fromId, 'addsongs') || utils.hasPerm(fromId, 'aiconfig') || utils.hasPerm(fromId, 'permaban')) {
                menu += `<b>[ DELEGATED ADMIN ]</b>\n`;
                if (utils.hasPerm(fromId, 'addsongs')) menu += `• /addsong\n`;
                if (utils.hasPerm(fromId, 'aiconfig')) menu += `• /newmodel [id]\n• /changerole [prompt]\n• /currentrole\n`;
                if (utils.hasPerm(fromId, 'permaban')) menu += `• /permban [id]\n• /unpermban [id]\n`;
                menu += `\n`;
            }
            if (await utils.isAdmin(chatId, fromId)) menu += `<b>[ ADMIN CONTROLS ]</b>\n• /toggleai\n• /gulag (reply)\n• /newevent\n• /summarize\n• /setbday MM-DD\n• /testbday\n• /memories\n• /forget [num]\n\n`;
            
            menu += `<b>[ GENERAL CONTROLS ]</b>\n• /yo [text]\n• /tl (reply)\n• /songquiz\n• /songtop\n• /connect4\n• /c4top\n• /activity\n• /events\n• /bdays\n• /topcredit\n• /worstcredit\n• /mycredit\n• + / - (reply)\n• /when (reply)`;
            return utils.safeReply(chatId, menu, null, 'HTML'); 
        }


if (cmd === '/buyai') {
    const sFromId = String(fromId);
    const sOwnerId = String(config.TOKEN_OWNER_ID || config.OWNER_ID);

    // If it's the owner, just let them in.
    let hasAccess = (sFromId === sOwnerId);

    // If not the owner, ask Telegram
    if (!hasAccess) {
        hasAccess = await utils.isAdmin(bot, chatId, fromId, config);
    }

    if (!hasAccess) {
        // This log will show in your VPS terminal
        console.log(`🚫 Access Denied for ID: ${sFromId}`); 
        return bot.sendMessage(chatId, `❌ <b>Access Denied</b>\nYour ID: <code>${sFromId}</code> is not authorized.`, { parse_mode: 'HTML' });
    }

    // ... (rest of your /buyai code)



    const kb = [
        [{ text: "✨ Basic Access (100 Stars)", callback_data: `BUY_TIER_basic_${chatId}` }],
        [{ text: "👑 Full Access (500 Stars)", callback_data: `BUY_TIER_full_${chatId}` }],
        [{ text: "❌ Close Menu", callback_data: `ACT_CLOSE_${fromId}` }]
    ];

    const menuText = 
        `💎 <b>Upgrade AI Premium</b>\n\n` +
        `<b>✨ Basic Access (100 Stars)</b>\n` +
        `• Standard AI responses\n` +
        `• Access to /summarize and /ask\n\n` +
        `<b>👑 Full Access (500 Stars)</b>\n` +
        `• Ability to change AI Personas\n` +
        `• Switch between custom OpenRouter models\n` +
        `• Advanced AI parameter control\n\n` +
        `<i>Select a tier below to generate your invoice:</i>`;

    return bot.sendMessage(chatId, menuText, { 
        parse_mode: 'HTML', 
        reply_markup: { inline_keyboard: kb } 
    });
}


if (cmd === '/activity') {
    const kb = [
        [{ text: "☀️ Daily", callback_data: `ACT_MENU_daily_${fromId}` }],
        [{ text: "📅 Monthly", callback_data: `ACT_MENU_monthly_${fromId}` }, { text: "🏆 All-Time", callback_data: `ACT_MENU_alltime_${fromId}` }],
        [{ text: "❌ Close", callback_data: `ACT_CLOSE_${fromId}` }]
    ];

    return bot.sendMessage(chatId, `📊 <b>Activity Leaderboard</b>\nWhich timeframe would you like to view?`, { 
        parse_mode: 'HTML', 
        reply_markup: { inline_keyboard: kb } 
    });
}

        if (cmd === '/tl' || cmd === '/translate') {
            // This grabs the replied-to text OR the text you typed after the command
            let textToTranslate = msg.reply_to_message?.text || msg.reply_to_message?.caption || query;
            
            if (textToTranslate) {
                bot.sendChatAction(chatId, 'typing').catch(()=>{});
                const translated = await ai.translateText(textToTranslate); // Note: 'ai' or 'modules.ai'
                
                return utils.safeReply(chatId, `🇺🇸 <b>Translation:</b>\n${translated}`, msg.reply_to_message?.message_id || msg.message_id, 'HTML');
            }
            return utils.safeReply(chatId, "⚠️ Reply to a message or provide text.", msg.message_id);
        }

        if (cmd === '/songtop' || cmd === '/musictop') {
            const arr = Object.values(state.musicStats).sort((a, b) => b.points - a.points).slice(0, 15);
            if (arr.length === 0) return utils.safeReply(chatId, "No Music Quiz games played yet.");
            let b = "🏆 <b>Song Quiz Leaderboard</b>\n━━━━━━━━━━\n\n";
            arr.forEach((u, i) => b += `${i + 1}. ${u.name}: <b>${u.points} Pts</b> (${u.wins} Wins)\n`);
            return utils.safeReply(chatId, b, null, 'HTML');
        }

        if (cmd === '/songquiz' || cmd === '/musicquiz') {
            if (state.activeMusicGames[chatId]) return utils.safeReply(chatId, "A game is already running!", msg.message_id);
            state.musicDB = loadObjectData(config.FILES.MUSIC_DB); 
            if (Object.keys(state.musicDB).length === 0) return utils.safeReply(chatId, "⚠️ The database has no songs.", msg.message_id);

            state.pendingMusicGames[chatId] = { initiator: fromId };
            let kb = []; let row = [];
            Object.keys(state.musicDB).forEach(genre => {
                row.push({ text: `${genre} (${state.musicDB[genre].length})`, callback_data: `MZ_GENRE_${genre}` });
                if (row.length === 2) { kb.push(row); row = []; }
            });
            if (row.length > 0) kb.push(row);
            kb.push([{text: "❌ Cancel", callback_data: "MZ_CANCEL"}]);
            return bot.sendMessage(chatId, "🎧 <b>GUESS THE SONG</b>\nSelect a genre to start:", { parse_mode: 'HTML', reply_markup: { inline_keyboard: kb } });
        }

        if (cmd === '/stopquiz' && await utils.isAdmin(chatId, fromId) && state.activeMusicGames[chatId]) {
            clearTimeout(state.activeMusicGames[chatId].timer); delete state.activeMusicGames[chatId];
            return utils.safeReply(chatId, "🛑 Game stopped by admin.");
        }

        if (cmd === '/connect4' || cmd === '/c4') {
            const gameId = Date.now().toString();
            state.activeC4Games[gameId] = { id: gameId, p1: { id: fromId, name: name }, p2: null, board: connect4.createC4Board(), turn: 1, status: 'waiting' };
            const ui = connect4.renderC4Message(state.activeC4Games[gameId]);
            try { await bot.sendMessage(chatId, ui.text, { reply_to_message_id: msg.message_id, parse_mode: 'HTML', reply_markup: { inline_keyboard: ui.kb } }); } catch (err) {}
            return;
        }

        if (cmd === '/c4top' || cmd === '/c4leaderboard') {
            const arr = Object.values(state.c4Stats).sort((a, b) => b.wins - a.wins).slice(0, 15);
            if (arr.length === 0) return utils.safeReply(chatId, "No Connect 4 games played yet.");
            let b = "🏆 <b>Connect 4 Leaderboard</b>\n━━━━━━━━━━\n\n";
            arr.forEach((u, i) => b += `${i + 1}. ${u.name}: <b>${u.wins} Wins</b> (${u.losses} L)\n`);
            return utils.safeReply(chatId, b, null, 'HTML');
        }

        if (msg.reply_to_message?.from) {
            const lower = text.toLowerCase();
            let isUpvote = text === '+' || lower.includes('thank you');
            let isDownvote = text === '-' || lower.includes('fuck you');

            if (isUpvote || isDownvote) {
                const rId = String(msg.reply_to_message.from.id);
                if (rId !== fromId && rId !== state.botId) {
                    const cdKey = `${fromId}_${rId}`; 
                    if (!state.repCooldowns[cdKey] || (Date.now() - state.repCooldowns[cdKey]) >= 60000) {
                        state.repCooldowns[cdKey] = Date.now(); 
                        if (!state.reputations[rId]) state.reputations[rId] = { score: 0, name: msg.reply_to_message.from.first_name || "User" };
                        state.reputations[rId].score += isUpvote ? 20 : -20; 
                        saveData(config.FILES.REP, state.reputations);
                        
                        try {
                            await bot.sendSticker(chatId, isUpvote ? config.STICKERS.PLUS_CREDIT : config.STICKERS.MINUS_CREDIT, { reply_to_message_id: msg.reply_to_message.message_id });
                        } catch (err) {
                            await utils.safeReply(chatId, `<b>${name}</b> ${isUpvote ? "increased" : "decreased"} credit. (Score: <b>${state.reputations[rId].score}</b>)`, msg.reply_to_message.message_id, 'HTML');
                        }
                    }
                }
            }
        }

        if (cmd === '/topcredit' || cmd === '/toprep') {
            const arr = Object.values(state.reputations).sort((a, b) => b.score - a.score).slice(0, 15);
            let b = "<b>Highest Social Credit</b>\n━━━━━━━━━━\n\n"; 
            arr.forEach((u, i) => b += `${i + 1}. ${u.name}: <b>${u.score}</b>\n`);
            return utils.safeReply(chatId, arr.length ? b : "No Social Credit scores yet.", null, 'HTML');
        }
        
        if (cmd === '/worstcredit' || cmd === '/worstrep') {
            const arr = Object.values(state.reputations).sort((a, b) => a.score - b.score).slice(0, 15);
            let b = "<b>Lowest Social Credit</b>\n━━━━━━━━━━\n\n"; 
            arr.forEach((u, i) => b += `${i + 1}. ${u.name}: <b>${u.score}</b>\n`);
            return utils.safeReply(chatId, arr.length ? b : "No Social Credit scores yet.", null, 'HTML');
        }
        
        if (cmd === '/mycredit' || cmd === '/myrep') {
            return utils.safeReply(chatId, `👤 <b>${name}</b>, your Social Credit score is: <b>${state.reputations[fromId]?.score || "None"}</b>`, msg.message_id, 'HTML');
        }

        if ((cmd === '/yo' || (msg.reply_to_message && String(msg.reply_to_message.from.id) === state.botId && !text.startsWith('/') && state.aiMessageIds.includes(msg.reply_to_message.message_id))) && state.isAiEnabled) {
            let prompt = cmd === '/yo' ? (query || "What's up?") : text;
            bot.sendChatAction(chatId, 'typing').catch(()=>{});
            let sentMsg = await utils.safeReply(chatId, await ai.askAI(prompt), msg.message_id, 'HTML'); 
            if (sentMsg?.message_id) { state.aiMessageIds.push(sentMsg.message_id); if (state.aiMessageIds.length > 50) state.aiMessageIds.shift(); }
            return;
        }

        if (cmd === '/summarize' && await utils.isAdmin(chatId, fromId)) {
            const now = Date.now();
            const oneHour = 60 * 60 * 1000; // 3,600,000 milliseconds
            
            // Check if the command was used in this chat within the last hour
            if (state.lastSummary.chatId === chatId && (now - state.lastSummary.timestamp) < oneHour) {
                const remainingMins = Math.ceil((oneHour - (now - state.lastSummary.timestamp)) / 60000);
                
                // Tag the user and point them to the existing summary
                const cooldownMsg = `⚠️ <b>Slow down ${name}!</b>\n\nA summary was already generated recently. You can view it here: <a href="https://t.me/c/${chatId.replace('-100', '')}/${state.lastSummary.messageId}">View Latest Summary</a>\n\n<i>Next summary available in ${remainingMins} minutes.</i>`;
                
                return bot.sendMessage(chatId, cooldownMsg, { 
                    parse_mode: 'HTML', 
                    reply_to_message_id: msg.message_id 
                });
            }

            // If cooldown passed, proceed with AI summary
            bot.sendChatAction(chatId, 'typing').catch(()=>{});
            const loadingMsg = await bot.sendMessage(chatId, "⏳ <i>Reading today's chat logs...</i>", { 
                parse_mode: 'HTML', 
                reply_to_message_id: msg.message_id 
            }).catch(()=>{});

            const summary = await ai.askSummarizer();

            if (loadingMsg) bot.deleteMessage(chatId, loadingMsg.message_id).catch(()=>{});
            
            // Send the actual summary
            const sentSummary = await utils.safeReply(chatId, summary, msg.message_id, 'HTML');

            // Update the state with the new summary info
            if (sentSummary) {
                state.lastSummary = {
                    timestamp: now,
                    chatId: chatId,
                    messageId: sentSummary.message_id
                };
            }
            return;
        }

        if (cmd === '/newevent' && await utils.isAdmin(chatId, fromId)) {
            const p = await bot.sendMessage(chatId, "📝 Event name?", { reply_to_message_id: msg.message_id, reply_markup: { force_reply: true } });
            state.eventSetupState[fromId] = { chatId: chatId, step: 'NAME', triggerMsgId: msg.message_id, lastPromptId: p.message_id, eventName: '', reminders: [] };
            return;
        }
        
        if (cmd === '/events') return events.renderPublicEventList(chatId, null, fromId, msg.message_id);

        if (cmd === '/setbday' && await utils.isAdmin(chatId, fromId)) {
            if (!/^\d{2}-\d{2}$/.test(query)) return bot.sendMessage(chatId, "Use: /setbday MM-DD");
            let u = msg.reply_to_message?.from || msg.from;
            state.birthdays = state.birthdays.filter(b => b.userId !== String(u.id));
            state.birthdays.push({ userId: String(u.id), username: u.username || '', name: u.first_name || "User", date: query });
            saveData(config.FILES.BDAY, state.birthdays);
            return utils.safeReply(chatId, `<b>Saved!</b> ${u.first_name || "User"} on ${query}.`, msg.message_id, 'HTML');
        }
        
        if (cmd === '/bdays' && await utils.isAdmin(chatId, fromId)) {
            if (state.birthdays.length === 0) return bot.sendMessage(chatId, "No birthdays.");
            return utils.safeReply(chatId, `<b>Birthdays:</b>\n\n${state.birthdays.sort((a,b) => a.date.localeCompare(b.date)).map(b => `🎂 ${b.name}: <b>${b.date}</b>`).join('\n')}`, null, 'HTML');
        }
        
        if (cmd === '/testbday' && await utils.isAdmin(chatId, fromId)) {
            bot.sendMessage(chatId, "Generating...");
            return birthdays.triggerBirthdayCard(chatId, { userId: String(msg.from.id), username: msg.from.username, name: msg.from.first_name, date: "TEST" });
        }

        if (cmd === '/memories' && await utils.isAdmin(chatId, fromId)) {
            if (state.botMemories.length === 0) return utils.safeReply(chatId, "Empty.");
            return utils.safeReply(chatId, `<b>Memories:</b>\n\n${state.botMemories.map((m, i) => `${i + 1}. ${m}`).join('\n')}`, null, 'HTML');
        }
        
        if (cmd === '/forget' && await utils.isAdmin(chatId, fromId)) {
            const idx = parseInt(query) - 1;
            if (state.botMemories[idx]) { state.botMemories.splice(idx, 1); saveData(config.FILES.MEMORY, state.botMemories); return utils.safeReply(chatId, "Deleted."); }
        }

        if (isTargetGroup && cmd === '/when' && msg.reply_to_message) {
            const t = msg.reply_to_message;
            const diff = DateTime.now().diff(DateTime.fromSeconds(t.forward_date || t.date), ['years', 'months', 'days', 'hours', 'minutes', 'seconds']).toObject();
            
            let parts = ['years', 'months', 'days', 'hours', 'minutes', 'seconds']
                .filter(u => diff[u] > 0 || u === 'seconds')
                .map(u => `${Math.floor(diff[u])} ${u}`);
                
            // Updated to bold the entire string as requested
            await bot.sendMessage(chatId, `<b>This message is ${parts.join(', ')} old</b>`, { 
                parse_mode: 'HTML',
                reply_to_message_id: t.message_id 
            });
        }
    });
};