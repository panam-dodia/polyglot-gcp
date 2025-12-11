require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const speech = require('@google-cloud/speech');
const { Translate } = require('@google-cloud/translate').v2;
const { ElevenLabs } = require('@elevenlabs/elevenlabs-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Initialize Google Cloud clients
const speechClient = new speech.SpeechClient();
const translateClient = new Translate();

// Initialize ElevenLabs client
const elevenlabs = new ElevenLabs({
  apiKey: process.env.ELEVENLABS_API_KEY
});

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

// DEBUG: Check environment variables
console.log('=== ENVIRONMENT CHECK ===');
console.log('ELEVENLABS_API_KEY:', process.env.ELEVENLABS_API_KEY ? process.env.ELEVENLABS_API_KEY.substring(0, 15) + '...' : 'NOT SET');
console.log('GEMINI_API_KEY:', process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.substring(0, 15) + '...' : 'NOT SET');
console.log('========================');

// Store rooms and participants
const rooms = new Map(); // roomId -> { participants: Map(...), conversationHistory: [] }

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
              participants: new Map(),
              conversationHistory: []
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

          if (data.type === 'agent_query_start') {
            // Start recording for agent query
            if (!currentRoom || !userId) return;
            
            const participant = rooms.get(currentRoom).participants.get(userId);
            
            console.log(`User ${userId} asking agent in ${participant.language}`);
            
            // Create streaming recognition request
            const request = {
              config: {
                encoding: 'WEBM_OPUS',
                sampleRateHertz: 48000,
                languageCode: data.language,
                enableAutomaticPunctuation: true,
              },
              interimResults: false,
            };
            
            recognizeStream = speechClient
              .streamingRecognize(request)
              .on('error', (error) => {
                console.error('Agent speech recognition error:', error);
                ws.send(JSON.stringify({ type: 'error', message: error.message }));
              })
              .on('data', async (response) => {
                const result = response.results[0];
                if (result && result.alternatives[0] && result.isFinal) {
                  const question = result.alternatives[0].transcript;
                  
                  console.log(`Agent query: ${question}`);
                  
                  // Process agent query
                  await handleAgentQuery(currentRoom, userId, question, participant.language);
                }
              });
            
            participant.recognizeStream = recognizeStream;
            ws.send(JSON.stringify({ type: 'ready' }));
          }

          if (data.type === 'agent_query_stop') {
            if (recognizeStream) {
              recognizeStream.end();
              recognizeStream = null;
            }
            console.log(`User ${userId} stopped agent query`);
          }

          if (data.type === 'personal_mode_start') {
            // Personal mode translation
            console.log(`Personal mode started: ${data.sourceLanguage} -> ${data.targetLanguage}`);
            
            const request = {
              config: {
                encoding: 'WEBM_OPUS',
                sampleRateHertz: 48000,
                languageCode: data.sourceLanguage,
                enableAutomaticPunctuation: true,
              },
              interimResults: true,
            };
            
            recognizeStream = speechClient
              .streamingRecognize(request)
              .on('error', (error) => {
                console.error('Personal mode recognition error:', error);
              })
              .on('data', async (response) => {
                const result = response.results[0];
                if (result && result.alternatives[0]) {
                  const transcript = result.alternatives[0].transcript;
                  const isFinal = result.isFinal;
                  
                  // Send transcript
                  ws.send(JSON.stringify({
                    type: 'personal_transcript',
                    text: transcript
                  }));
                  
                  // If final, translate
                  if (isFinal) {
                    try {
                      const sourceLang = data.sourceLanguage.split('-')[0];
                      const targetLang = data.targetLanguage.split('-')[0];
                      
                      if (sourceLang !== targetLang) {
                        const prompt = `Translate this phrase naturally and colloquially:
          "${transcript}"

          From: ${getLanguageName(data.sourceLanguage)}
          To: ${getLanguageName(data.targetLanguage)}

          ONE LINE ONLY - just the translation.`;

                        const result = await model.generateContent(prompt);
                        const translatedText = result.response.text().trim();
                        
                        ws.send(JSON.stringify({
                          type: 'personal_translation',
                          translated: translatedText
                        }));

                        // Generate audio for personal mode
                        try {
                          const audio = await elevenlabs.textToSpeech.convert('pNInz6obpgDQGcFmaJgB', {
                            text: translatedText,
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
                          
                          ws.send(JSON.stringify({
                            type: 'personal_audio',
                            audio: audioBuffer.toString('base64')
                          }));
                          
                          console.log('Personal mode audio sent');
                        } catch (error) {
                          console.error('Personal mode audio error:', error);
                        }
                      }
                    } catch (error) {
                      console.error('Personal mode translation error:', error);
                    }
                  }
                }
              });
            
            ws.send(JSON.stringify({ type: 'ready' }));
          }

          if (data.type === 'personal_mode_stop') {
            if (recognizeStream) {
              recognizeStream.end();
              recognizeStream = null;
            }
            console.log('Personal mode stopped');
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
        const prompt = `Translate this ${sourceLangName} phrase to ${targetLangName} in a natural, colloquial way as people actually speak:
"${text}"

Rules:
- Use everyday slang and expressions
- Match the casual/formal tone
- Sound natural, not literal
- ONE LINE ONLY - just the translation, nothing else`;

        const result = await model.generateContent(prompt);
        translatedText = result.response.text().trim();
        
        console.log(`Gemini translated to ${targetLangName}: ${translatedText}`);
      }
      
      // Log to conversation history (ADD THIS)
      if (participantId === Array.from(room.participants.keys())[0]) {
        // Only log once per message
        room.conversationHistory.push({
          timestamp: Date.now(),
          speaker: room.participants.get(speakerId).name,
          language: sourceLangName,
          text: text
        });
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
    
    // Use single voice for everyone
    const voiceId = 'pNInz6obpgDQGcFmaJgB';
    
    const audio = await elevenlabs.textToSpeech.convert(voiceId, {
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

// Handle agent queries about conversation
async function handleAgentQuery(roomId, userId, question, userLanguage) {
  const room = rooms.get(roomId);
  if (!room) return;
  
  const participant = room.participants.get(userId);
  
  try {
    console.log(`Processing agent query: "${question}"`);
    
    // Build conversation context
    const conversationContext = room.conversationHistory
      .map(entry => `${entry.speaker} (${entry.language}): ${entry.text}`)
      .join('\n');
    
    // Create prompt for agent
    const prompt = `You are a helpful conversation assistant. You have access to the conversation history below.

CONVERSATION HISTORY:
${conversationContext}

USER QUESTION: ${question}

Provide a helpful, concise answer to the user's question based on the conversation history. If the conversation history is empty or doesn't contain relevant information, politely say so.

Answer in ${getLanguageName(userLanguage)} language.`;

    const result = await model.generateContent(prompt);
    const response = result.response.text().trim();
    
    console.log(`Agent response: ${response}`);
    
    // Send response back to user
    participant.ws.send(JSON.stringify({
      type: 'agent_response',
      response: response
    }));
    
    // Generate speech for the response
    await generateSpeechForParticipant(participant, response);
    
  } catch (error) {
    console.error(`Error processing agent query:`, error);
    participant.ws.send(JSON.stringify({
      type: 'error',
      message: 'Could not process your question'
    }));
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