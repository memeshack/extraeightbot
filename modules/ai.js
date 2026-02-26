const { OpenAI } = require('openai');
const config = require('../config');
const { saveData } = require('../dataManager');
const googleTranslate = require('google-translate-api-next');

module.exports = function(bot, state, utils) {

    const openai = new OpenAI({ 
        baseURL: "https://openrouter.ai/api/v1", 
        apiKey: config.OPENROUTER_API_KEY 
    });

    function formatAiToHtml(str) {
        let newStr = str;
        newStr = newStr.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        newStr = newStr.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
        newStr = newStr.replace(/(?<!\w)\*(.*?)\*(?!\w)/g, '<i>$1</i>');
        newStr = newStr.replace(/`(.*?)`/g, '<code>$1</code>');    
        return newStr;
    }

    async function askAI(userPrompt) {
        try {
            let recentMems = state.botMemories.slice(-2);
            let words = userPrompt.toLowerCase().split(/\W+/);
            let keywords = words.filter(w => w.length > 3);
            
            let matchedMems = state.botMemories.filter(mem => {
                let memLower = mem.toLowerCase();
                return keywords.some(kw => memLower.includes(kw));
            });
            
            let combined = [...recentMems, ...matchedMems];
            let uniqueSet = new Set(combined);
            let finalMemories = [...uniqueSet].slice(-5);
            
            let memoryList = finalMemories.length > 0 ? finalMemories.join("\n") : "No past memories.";
            const contextList = state.recentChatHistory.join("\n");

            const systemMessage = `${state.botConfig.aiPersona}\n\n🧠 MEMORIES:\n${memoryList}\n\n💬 RECENT CHAT:\n${contextList}\n\n🔴 RULE: If user shares a NEW fact, output "SAVE_MEM: <fact>" at the end of your message. Use standard markdown for formatting.`;

            const chatCompletion = await openai.chat.completions.create({
                model: state.botConfig.aiModel, 
                messages: [
                    { role: "system", content: systemMessage }, 
                    { role: "user", content: userPrompt }
                ],
                temperature: 0.7, 
                max_tokens: 1024,
            });

            let response = chatCompletion.choices?.[0]?.message?.content || "";
            if (!response || response.trim() === "") return "⚠️ API returned blank.";

            if (response.includes("SAVE_MEM:")) {
                const parts = response.split("SAVE_MEM:");
                const cleanResponse = parts[0].trim();
                const memoryToSave = parts[1].trim();

                if (memoryToSave && !state.botMemories.includes(memoryToSave)) {
                    state.botMemories.push(memoryToSave); 
                    saveData(config.FILES.MEMORY, state.botMemories);
                    utils.safeReply(config.LOG_ID, `🧠 <b>Learned:</b> ${formatAiToHtml(memoryToSave)}`, null, 'HTML');
                }
                return formatAiToHtml(cleanResponse);
            }
            
            return formatAiToHtml(response);
        } catch (error) { 
            return `⚠️ <b>AI Error:</b> ${error.message}`; 
        }
    }


        // ... inside your module.exports function ...

    async function translateText(textToTranslate) {
        try {
            // We force 'to: en' and use 'forceTo: true' to ensure it doesn't just bypass translation
            const res = await googleTranslate(textToTranslate, { 
                to: 'en', 
                from: 'auto',
                forceTo: true 
            });
            
            // If the library returns the exact same text, it might be stuck.
            // We check if it's identical and try one more time without 'auto' detection.
            if (res.text === textToTranslate) {
                // This second attempt is a safety net
                const resRetry = await googleTranslate(textToTranslate, { to: 'en' });
                return resRetry.text;
            }
            
            return res.text;
        } catch (error) {
            console.error("Translation Error:", error);
            return `⚠️ <b>Translation Error:</b> ${error.message}`;
        }
    }

    async function askSummarizer() {
        try {
            if (state.dailyChatLog.length < 5) return "Not enough messages today to summarize yet. Tell everyone to wake up and talk!";
            
            const logText = state.dailyChatLog.join("\n");
            const systemMessage = `You are a helpful, professional, and concise group chat summarizer. 
            You are reading a chat log that started at 5:00 AM EST today. 
            Analyze the log and provide a clean summary of what happened. 
            Group it by major topics, mention key decisions or events, and highlight any particularly funny or notable quotes. 
            Do not roleplay or act rude. Be clear, easy to read, and use standard markdown formatting (e.g. **bold** for emphasis).`;

            const chatCompletion = await openai.chat.completions.create({
                model: state.botConfig.aiModel, 
                messages: [
                    { role: "system", content: systemMessage }, 
                    { role: "user", content: `Here is the chat log so far today:\n\n${logText}` }
                ],
                temperature: 0.5, 
                max_tokens: 1500, 
            });

            let response = chatCompletion.choices?.[0]?.message?.content || "";
            if (!response || response.trim() === "") return "⚠️ Summarizer API returned blank.";

            return `📊 <b>Daily Chat Summary (Since 5 AM)</b>\n━━━━━━━━━━\n\n${formatAiToHtml(response)}`;
        } catch (error) { 
            return `⚠️ <b>Summarizer Error:</b> ${error.message}`; 
        }
    }

return { formatAiToHtml, askAI, translateText, askSummarizer };
};