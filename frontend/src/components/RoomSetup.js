import React, { useState } from 'react';
import styled from 'styled-components';

const Container = styled.div`
  background: white;
  border-radius: 20px;
  padding: 40px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
  max-width: 500px;
  width: 100%;
`;

const Title = styled.h2`
  text-align: center;
  color: #333;
  margin-bottom: 30px;
`;

const Label = styled.label`
  display: block;
  margin-bottom: 10px;
  font-weight: 600;
  color: #333;
`;

const Select = styled.select`
  width: 100%;
  padding: 12px;
  margin-bottom: 25px;
  border: 2px solid #ddd;
  border-radius: 8px;
  font-size: 16px;
  cursor: pointer;
  
  &:focus {
    outline: none;
    border-color: #667eea;
  }
`;

const Input = styled.input`
  width: 100%;
  padding: 12px;
  margin-bottom: 25px;
  border: 2px solid #ddd;
  border-radius: 8px;
  font-size: 16px;
  
  &:focus {
    outline: none;
    border-color: #667eea;
  }
`;

const Button = styled.button`
  width: 100%;
  padding: 15px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 18px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.2s;
  margin-bottom: 15px;
  
  &:hover {
    transform: translateY(-2px);
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const Divider = styled.div`
  text-align: center;
  margin: 20px 0;
  color: #999;
  position: relative;
  
  &:before {
    content: '';
    position: absolute;
    left: 0;
    top: 50%;
    width: 45%;
    height: 1px;
    background: #ddd;
  }
  
  &:after {
    content: '';
    position: absolute;
    right: 0;
    top: 50%;
    width: 45%;
    height: 1px;
    background: #ddd;
  }
`;

const languages = [
  { code: 'en-US', name: 'English (US)' },
  { code: 'es-ES', name: 'Spanish' },
  { code: 'fr-FR', name: 'French' },
  { code: 'de-DE', name: 'German' },
  { code: 'it-IT', name: 'Italian' },
  { code: 'pt-BR', name: 'Portuguese (Brazil)' },
  { code: 'ja-JP', name: 'Japanese' },
  { code: 'ko-KR', name: 'Korean' },
  { code: 'zh-CN', name: 'Chinese (Simplified)' },
  { code: 'hi-IN', name: 'Hindi' },
  { code: 'ar-SA', name: 'Arabic' },
];

function RoomSetup({ onJoinRoom }) {
    const [language, setLanguage] = useState('');
    const [roomIdInput, setRoomIdInput] = useState('');
    const [name, setName] = useState('');

    const handleCreateRoom = () => {
    if (!language || !name) return;
    onJoinRoom(null, null, language, 'create', name);
    };

    const handleJoinRoom = () => {
    if (!language || !roomIdInput || !name) return;
    onJoinRoom(roomIdInput.toUpperCase(), null, language, 'join', name);
    };

  return (
    <Container>
      <Title>Join a Translation Room</Title>
      
      <Label>Your Name:</Label>
        <Input
        type="text"
        placeholder="Enter your name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={20}
      />

      <Label>Your Language:</Label>
      <Select value={language} onChange={(e) => setLanguage(e.target.value)}>
        <option value="">Select your language</option>
        {languages.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.name}
          </option>
        ))}
      </Select>

      <Button onClick={handleCreateRoom} disabled={!language || !name}>
        Create New Room
      </Button>

      <Divider>OR</Divider>

      <Label>Room Code:</Label>
      <Input
        type="text"
        placeholder="Enter 6-character room code"
        value={roomIdInput}
        onChange={(e) => setRoomIdInput(e.target.value.toUpperCase())}
        maxLength={6}
      />

      <Button onClick={handleJoinRoom} disabled={!language || !roomIdInput || !name}>
        Join Existing Room
      </Button>
    </Container>
  );
}

export default RoomSetup;