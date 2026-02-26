const axios = require('axios');
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const config = require('../config');
const { saveData } = require('../dataManager');

module.exports = function(bot, state) {
    
    async function startMusicRound(chatId) {
        const game = state.activeMusicGames[chatId];
        if (!game) return;
        if (game.round > game.maxRounds || game.pool.length === 0) {
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
                
                // Saving temp files back in the main root directory 
                const tempIn = path.join(__dirname, `../temp_in_${chatId}.m4a`);
                const tempOut = path.join(__dirname, `../temp_out_${chatId}.ogg`);
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
                            if (state.activeMusicGames[chatId] && state.activeMusicGames[chatId].round === game.round) {
                                game.status = 'loading'; 
                                await bot.sendMessage(chatId, `⏰ <b>Time's up!</b>\nThe song was: <b>${game.currentSong.name}</b>`, { parse_mode: 'HTML' });
                                state.activeMusicGames[chatId].round += 1;
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
        const game = state.activeMusicGames[chatId];
        if (!game) return;
        
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
                if (!state.musicStats[p.id]) {
                    state.musicStats[p.id] = { name: p.name, points: 0, wins: 0 };
                }
                state.musicStats[p.id].points += p.score;
            });

            winners.forEach(w => {
                state.musicStats[w.id].wins += 1;
            });
            saveData(config.FILES.MUSIC_STAT, state.musicStats);
        }
        
        await bot.sendMessage(chatId, msg, { parse_mode: 'HTML' });
        delete state.activeMusicGames[chatId];
    }

    return { startMusicRound, endMusicGame };
};