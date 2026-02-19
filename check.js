const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI("AIzaSyBp65W8x8iHx2CpKSTLUJXikjoT_LQOhss");

async function list() {
  console.log("Checking available models...");
  try {
    const models = await genAI.getGenerativeModel({ model: "gemini-1.5-flash" }).apiKey; // Dummy call to init
    // Actually list models
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${genAI.apiKey}`);
    const data = await response.json();
    
    if (data.models) {
        console.log("✅ AVAILABLE MODELS:");
        data.models.forEach(m => {
            if (m.name.includes("gemini")) console.log(m.name.replace("models/", ""));
        });
    } else {
        console.log("❌ Error listing models:", data);
    }
  } catch (e) {
    console.log("❌ Connection Error:", e.message);
  }
}
list();