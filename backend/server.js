require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const speech = require('@google-cloud/speech');
const { Translate } = require('@google-cloud/translate').v2;
const { ElevenLabsClient } = require('elevenlabs');
const { VertexAI } = require('@google-cloud/vertexai')

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Initialize Google Cloud clients
const speechClient = new speech.SpeechClient();
const translateClient = new Translate();

// Initialize ElevenLabs client
const elevenlabs = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY
});

// Initialize Vertex AI for Gemini
const vertexAI = new VertexAI({
  project: process.env.GOOGLE_CLOUD_PROJECT,
  location: 'us-central1'
});
const model = vertexAI.getGenerativeModel({
  model: 'gemini-1.5-flash'
});

// Store rooms and participants
const rooms = new Map(); // roomId -> { participants: Map(userId -> {ws, language, recognizeStream}) }

// Generate random room ID
function generateRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// WebSocket connection handler
wss.on('connection', (ws) => {
  console.log('New client connected');
  
  let userId = null;
  let currentRoom = null;
  let recognizeStream = null;

  ws.on('message', async (message) => {
    try {
      // Check if it's binary audio data or JSON
      if (message instanceof Buffer) {
        // Try to parse as JSON first
        try {
          const text = message.toString('utf8');
          const data = JSON.parse(text);
          
          console.log('Received JSON:', data.type);
          
          if (data.type === 'create_room') {
            // Create new room
            const roomId = generateRoomId();
            userId = Date.now().toString();
            
            rooms.set(roomId, {
              participants: new Map()
            });
            
            rooms.get(roomId).participants.set(userId, {
              ws: ws,
              language: data.language,
              name: data.name,
              recognizeStream: null
            });
            
            currentRoom = roomId;
            
            console.log(`Room ${roomId} created by user ${userId}`);
            
            ws.send(JSON.stringify({
              type: 'room_created',
              roomId: roomId,
              userId: userId
            }));
            
            broadcastParticipants(roomId);
          }
          
          if (data.type === 'join_room') {
            // Join existing room
            const roomId = data.roomId.toUpperCase();
            userId = Date.now().toString();
            
            if (!rooms.has(roomId)) {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Room not found'
              }));
              return;
            }
            
            rooms.get(roomId).participants.set(userId, {
              ws: ws,
              language: data.language,
              name: data.name,
              recognizeStream: null
            });
            
            currentRoom = roomId;
            
            console.log(`User ${userId} joined room ${roomId}`);
            
            ws.send(JSON.stringify({
              type: 'room_joined',
              roomId: roomId,
              userId: userId
            }));
            
            broadcastParticipants(roomId);
          }
          
          if (data.type === 'start_speaking') {
            // Start recording and transcribing
            if (!currentRoom || !userId) return;
            
            const participant = rooms.get(currentRoom).participants.get(userId);
            
            console.log(`User ${userId} started speaking in ${participant.language}`);
            
            // Create streaming recognition request
            const request = {
              config: {
                encoding: 'WEBM_OPUS',
                sampleRateHertz: 48000,
                languageCode: participant.language,
                enableAutomaticPunctuation: true,
              },
              interimResults: true,
            };
            
            recognizeStream = speechClient
              .streamingRecognize(request)
              .on('error', (error) => {
                console.error('Speech recognition error:', error);
                ws.send(JSON.stringify({ type: 'error', message: error.message }));
              })
              .on('data', async (response) => {
                const result = response.results[0];
                if (result && result.alternatives[0]) {
                  const transcript = result.alternatives[0].transcript;
                  const isFinal = result.isFinal;
                  
                  console.log(`User ${userId} transcript (${isFinal ? 'final' : 'interim'}): ${transcript}`);
                  
                  // Send transcript to speaker
                  ws.send(JSON.stringify({
                    type: 'transcript',
                    text: transcript,
                    isFinal: isFinal
                  }));
                  
                  // If final, translate and broadcast to others
                  if (isFinal) {
                    await translateAndBroadcast(currentRoom, userId, transcript, participant.language);
                  }
                }
              });
            
            participant.recognizeStream = recognizeStream;
            
            ws.send(JSON.stringify({ type: 'ready' }));
          }
          
          if (data.type === 'stop_speaking') {
            if (recognizeStream) {
              recognizeStream.end();
              recognizeStream = null;
            }
            console.log(`User ${userId} stopped speaking`);
          }
          
          return;
          
        } catch (jsonError) {
          // Not JSON, treat as binary audio data
          if (recognizeStream) {
            recognizeStream.write(message);
          }
          return;
        }
      }
      
    } catch (error) {
      console.error('Message handling error:', error);
    }
  });

  ws.on('close', () => {
    console.log(`Client disconnected - userId: ${userId}, room: ${currentRoom}`);
    if (recognizeStream) {
      recognizeStream.end();
    }
    if (currentRoom && userId) {
      const room = rooms.get(currentRoom);
      if (room) {
        room.participants.delete(userId);
        console.log(`Removed user ${userId} from room ${currentRoom}`);
        if (room.participants.size === 0) {
          rooms.delete(currentRoom);
          console.log(`Room ${currentRoom} deleted (empty)`);
        } else {
          broadcastParticipants(currentRoom);
        }
      }
    }
  });
});

// Broadcast participant list to all in room
function broadcastParticipants(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  
  const participantList = Array.from(room.participants.entries()).map(([id, p]) => ({
    userId: id,
    language: p.language,
    name: p.name
  }));
  
  room.participants.forEach((participant) => {
    participant.ws.send(JSON.stringify({
      type: 'participants_update',
      participants: participantList
    }));
  });
}

// Translate and broadcast to all other participants
async function translateAndBroadcast(roomId, speakerId, text, sourceLanguage) {
  const room = rooms.get(roomId);
  if (!room) return;
  
  console.log(`Broadcasting from user ${speakerId}: "${text}"`);
  
  // For each participant (except the speaker)
  for (const [participantId, participant] of room.participants) {
    if (participantId === speakerId) continue; // Don't send back to speaker
    
    try {
      // Get language names for better prompting
      const sourceLangName = getLanguageName(sourceLanguage);
      const targetLangName = getLanguageName(participant.language);
      
      let translatedText = text;
      
      // Only translate if languages are different
      if (sourceLanguage.split('-')[0] !== participant.language.split('-')[0]) {
        // Use Gemini for natural, conversational translation
        const prompt = `You are a professional translator specializing in natural, conversational language.

Translate the following ${sourceLangName} text to ${targetLangName}:
"${text}"

IMPORTANT RULES:
- Use natural, colloquial expressions, not literal word-for-word translation
- Match the casual/formal tone of the original
- Use slang and everyday expressions when appropriate
- Keep it conversational and natural sounding
- If it's a greeting, use common greetings in ${targetLangName}
- If it's an expression (like "that works for me"), use the natural equivalent

Provide ONLY the translation, no explanations or notes.`;

        const result = await model.generateContent(prompt);
        const response = result.response;
        translatedText = response.candidates[0].content.parts[0].text.trim();
        
        console.log(`Gemini translated to ${targetLangName}: ${translatedText}`);
      }
      
      // Send translation to participant
      participant.ws.send(JSON.stringify({
        type: 'translation',
        speakerId: speakerId,
        speakerName: room.participants.get(speakerId).name,
        original: text,
        translated: translatedText
      }));
      
      // Generate and send audio
      await generateSpeechForParticipant(participant, translatedText);
      
    } catch (error) {
      console.error(`Error translating for participant ${participantId}:`, error);
    }
  }
}

// Helper function to get full language name
function getLanguageName(code) {
  const languages = {
    'en-US': 'English',
    'es-ES': 'Spanish',
    'fr-FR': 'French',
    'de-DE': 'German',
    'it-IT': 'Italian',
    'pt-BR': 'Portuguese',
    'ja-JP': 'Japanese',
    'ko-KR': 'Korean',
    'zh-CN': 'Chinese',
    'hi-IN': 'Hindi',
    'ar-SA': 'Arabic',
  };
  return languages[code] || code;
}

// Generate speech for a specific participant
async function generateSpeechForParticipant(participant, text) {
  try {
    console.log('Generating speech:', text);
    
    const audio = await elevenlabs.textToSpeech.convert("pNInz6obpgDQGcFmaJgB", {
      text: text,
      model_id: "eleven_multilingual_v2",
      voice_settings: {
        speed: 0.85,
        stability: 0.5,
        similarity_boost: 0.75
      }
    });
    
    const chunks = [];
    for await (const chunk of audio) {
      chunks.push(chunk);
    }
    const audioBuffer = Buffer.concat(chunks);
    
    participant.ws.send(JSON.stringify({
      type: 'audio',
      audio: audioBuffer.toString('base64')
    }));
    
    console.log('Audio sent to participant');
    
  } catch (error) {
    console.error('Speech synthesis error:', error);
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'Server is running' });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});