require('dotenv').config();
const { ElevenLabsClient } = require('elevenlabs');

async function test() {
  const elevenlabs = new ElevenLabsClient({
    apiKey: process.env.ELEVENLABS_API_KEY
  });
  
  console.log('Testing ElevenLabs TTS with key:', process.env.ELEVENLABS_API_KEY.substring(0, 15) + '...');
  
  try {
    const audio = await elevenlabs.textToSpeech.convert('pNInz6obpgDQGcFmaJgB', {
      text: 'Hello, this is a test',
      model_id: 'eleven_multilingual_v2'
    });
    
    console.log('✅ SUCCESS! TTS is working!');
  } catch (error) {
    console.error('❌ FAILED:', error.message);
    console.error('Status:', error.statusCode);
  }
}

test();
