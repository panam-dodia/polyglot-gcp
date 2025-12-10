import React, { useState, useEffect, useRef } from 'react';
import styled from 'styled-components';

const Container = styled.div`
  background: white;
  border-radius: 20px;
  padding: 40px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
  max-width: 900px;
  width: 100%;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30px;
  padding-bottom: 20px;
  border-bottom: 2px solid #f0f0f0;
`;

const RoomInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const RoomCode = styled.div`
  font-size: 24px;
  font-weight: 700;
  color: #667eea;
  font-family: monospace;
`;

const RoomHint = styled.div`
  font-size: 14px;
  color: #666;
`;

const LeaveButton = styled.button`
  padding: 10px 20px;
  background: #ff4757;
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  
  &:hover {
    background: #ff3838;
  }
`;

const ParticipantsSection = styled.div`
  margin-bottom: 25px;
`;

const SectionTitle = styled.h3`
  font-size: 16px;
  color: #333;
  margin-bottom: 15px;
  text-transform: uppercase;
  letter-spacing: 1px;
`;

const ParticipantsList = styled.div`
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
`;

const ParticipantChip = styled.div`
  padding: 8px 16px;
  background: ${props => props.$isMe ? '#667eea' : '#f0f0f0'};
  color: ${props => props.$isMe ? 'white' : '#333'};
  border-radius: 20px;
  font-size: 14px;
  font-weight: 500;
`;

const TranscriptSection = styled.div`
  margin-bottom: 20px;
`;

const TranscriptBox = styled.div`
  background: #f8f9fa;
  border-radius: 12px;
  padding: 20px;
  min-height: 120px;
  max-height: 300px;
  overflow-y: auto;
`;

const TranscriptItem = styled.div`
  margin-bottom: 15px;
  padding-bottom: 15px;
  border-bottom: 1px solid #e0e0e0;
  
  &:last-child {
    border-bottom: none;
    margin-bottom: 0;
    padding-bottom: 0;
  }
`;

const Speaker = styled.div`
  font-size: 12px;
  color: #667eea;
  font-weight: 600;
  margin-bottom: 5px;
`;

const Text = styled.div`
  font-size: 16px;
  color: #333;
  line-height: 1.5;
`;

const RecordButton = styled.button`
  width: 100%;
  padding: 20px;
  background: ${props => props.$isRecording ? '#ff4757' : '#667eea'};
  color: white;
  border: none;
  border-radius: 12px;
  font-size: 20px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
  
  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 5px 20px rgba(0, 0, 0, 0.2);
  }
`;

const Status = styled.div`
  text-align: center;
  margin-top: 15px;
  color: ${props => props.$error ? '#ff4757' : '#666'};
  font-weight: 500;
`;

function RoomInterface({ initialRoomId, language, mode, name, onLeaveRoom }) {
  const [recording, setRecording] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [transcripts, setTranscripts] = useState([]);
  const [status, setStatus] = useState('Connecting...');
  const [error, setError] = useState('');
  const [roomId, setRoomId] = useState(initialRoomId);
  const [userId, setUserId] = useState(null);
  const [agentMode, setAgentMode] = useState(false);
  const [agentListening, setAgentListening] = useState(false);
  
  const wsRef = useRef(null);
  const mediaRecorderRef = useRef(null);

  useEffect(() => {
    // Connect to WebSocket
    const ws = new WebSocket('wss://polyglot-gcp-253723476028.us-central1.run.app');
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('Connected to server');
      
      // Send create or join message
      if (mode === 'create') {
        ws.send(JSON.stringify({
          type: 'create_room',
          language: language,
          name: name,
        }));
      } else {
        ws.send(JSON.stringify({
          type: 'join_room',
          roomId: initialRoomId,
          language: language,
          name: name,
        }));
      }
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      console.log('Received:', data.type, data);
      
      if (data.type === 'room_created') {
        setRoomId(data.roomId);
        setUserId(data.userId);
        setStatus('Room created - Ready to speak');
      }
      
      if (data.type === 'room_joined') {
        setRoomId(data.roomId);
        setUserId(data.userId);
        setStatus('Joined room - Ready to speak');
      }
      
      if (data.type === 'participants_update') {
        setParticipants(data.participants);
      }
      
      if (data.type === 'transcript') {
        // Your own transcript
        if (data.isFinal) {
          setTranscripts(prev => [...prev, {
            speaker: 'You',
            text: data.text,
            timestamp: Date.now()
          }]);
        }
      }
      
      if (data.type === 'translation') {
        // Translation from another participant
        setTranscripts(prev => [...prev, {
          speaker: data.speakerName,
          text: data.translated,
          original: data.original,
          timestamp: Date.now()
        }]);
      }
      
      if (data.type === 'audio') {
        playAudio(data.audio);
      }
      
      if (data.type === 'ready') {
        setStatus('Recording...');
      }
      
      if (data.type === 'error') {
        setError(data.message);
        setStatus('Error occurred');
      }

      if (data.type === 'agent_response') {
        setTranscripts(prev => [...prev, {
          speaker: 'Agent',
          text: data.response,
          timestamp: Date.now()
        }]);
        setStatus('Ready');
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setError('Connection error');
      setStatus('Connection failed');
    };

    ws.onclose = () => {
      console.log('Disconnected from server');
      setStatus('Disconnected');
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [initialRoomId, language, mode, name]);

  const startRecording = async () => {
    try {
      console.log('Requesting microphone access...');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log('Microphone access granted');
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(event.data);
        }
      };

      mediaRecorder.start(100);
      console.log('MediaRecorder started');
      
      // Send start message
      wsRef.current.send(JSON.stringify({
        type: 'start_speaking'
      }));

      setRecording(true);
      setStatus('Recording...');
      setError('');
      
    } catch (err) {
      console.error('Error accessing microphone:', err);
      setError('Microphone access denied');
      setStatus('Error');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      
      wsRef.current.send(JSON.stringify({ type: 'stop_speaking' }));
      
      setRecording(false);
      setStatus('Ready to speak');
    }
  };

  const playAudio = (base64Audio) => {
    const audio = new Audio('data:audio/mpeg;base64,' + base64Audio);
    audio.play();
  };

  const startAgentListening = async () => {
    try {
      console.log('Starting agent mode...');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(event.data);
        }
      };

      mediaRecorder.start(100);
      
      // Send agent query start message
      wsRef.current.send(JSON.stringify({
        type: 'agent_query_start',
        language: language
      }));

      setAgentMode(true);
      setAgentListening(true);
      setStatus('Ask your question...');
      
    } catch (err) {
      console.error('Error accessing microphone:', err);
      setError('Microphone access denied');
    }
  };

  const stopAgentListening = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      
      wsRef.current.send(JSON.stringify({ type: 'agent_query_stop' }));
      
      setAgentMode(false);
      setAgentListening(false);
      setStatus('Processing your question...');
    }
  };

  const getLanguageName = (code) => {
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
  };

  return (
    <Container>
      <Header>
        <RoomInfo>
          <RoomCode>Room: {roomId || 'Loading...'}</RoomCode>
          <RoomHint>Share this code with others to join</RoomHint>
        </RoomInfo>
        <LeaveButton onClick={onLeaveRoom}>Leave Room</LeaveButton>
      </Header>

      <ParticipantsSection>
        <SectionTitle>Participants ({participants.length})</SectionTitle>
        <ParticipantsList>
          {participants.map((p) => (
            <ParticipantChip key={p.userId} $isMe={p.userId === userId}>
              {p.name} ({getLanguageName(p.language)})
            </ParticipantChip>
          ))}
        </ParticipantsList>
      </ParticipantsSection>

      <TranscriptSection>
        <SectionTitle>Conversation</SectionTitle>
        <TranscriptBox>
          {transcripts.length === 0 ? (
            <Text style={{ color: '#999' }}>Start speaking to begin translation...</Text>
          ) : (
            transcripts.map((t, idx) => (
              <TranscriptItem key={idx}>
                <Speaker>{t.speaker}</Speaker>
                <Text>{t.text}</Text>
              </TranscriptItem>
            ))
          )}
        </TranscriptBox>
      </TranscriptSection>

      <RecordButton
        $isRecording={recording}
        onClick={() => {
          if (recording) {
            stopRecording();
          } else {
            startRecording();
          }
        }}
        style={{ marginBottom: '15px' }}
      >
        {recording ? '⏹️ Stop Speaking' : '🎤 Start Speaking'}
      </RecordButton>

      <RecordButton
        $isRecording={agentMode}
        onClick={() => {
          if (agentMode) {
            stopAgentListening();
          } else {
            startAgentListening();
          }
        }}
        style={{ marginBottom: '15px', background: agentMode ? '#9b59b6' : '#3498db' }}
      >
        {agentMode ? '🤖 Stop Agent' : '🤖 Ask Agent'}
      </RecordButton>

      <Status $error={error}>
        {error || status}
      </Status>
    </Container>
  );
}

export default RoomInterface;