require('dotenv').config();
const { ElevenLabsClient } = require('elevenlabs');

async function listVoices() {
  const elevenlabs = new ElevenLabsClient({
    apiKey: process.env.ELEVENLABS_API_KEY
  });
  
  try {
    const voices = await elevenlabs.voices.getAll();
    console.log('Available voices:');
    voices.voices.forEach(voice => {
      console.log(`- ${voice.name} (${voice.labels?.gender || 'unknown'}) - ID: ${voice.voice_id}`);
    });
  } catch (error) {
    console.error('Error:', error.message);
  }
}

listVoices();