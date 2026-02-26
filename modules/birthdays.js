const Jimp = require('jimp');
const path = require('path');
const fs = require('fs');

module.exports = function(bot, state) {
    
    async function triggerBirthdayCard(chatId, bday) {
        try {
            const profilePhotos = await bot.getUserProfilePhotos(bday.userId, { limit: 1 });
            let imageBuffer = null;
            
            if (profilePhotos.total_count > 0) {
                const photos = profilePhotos.photos[0];
                const imageUrl = await bot.getFileLink(photos[photos.length - 1].file_id);
                const image = await Jimp.read(imageUrl);
                
                // Keep looking for confetti.png in the main bot folder
                const confettiPath = path.join(__dirname, '../confetti.png');
                
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

    return { triggerBirthdayCard };
};