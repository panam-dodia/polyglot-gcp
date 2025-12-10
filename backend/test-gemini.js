require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function test() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  
  console.log('Testing gemini-2.0-flash...');
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  const result = await model.generateContent('Translate "hold your horses" to Hindi naturally and colloquially');
  console.log('✅ SUCCESS!');
  console.log('Translation:', result.response.text());
}

test().catch(err => {
  console.error('❌ FAILED:', err.message);
});