import React, { useState } from 'react';
import styled from 'styled-components';
import RoomSetup from './components/RoomSetup';
import RoomInterface from './components/RoomInterface';

const AppContainer = styled.div`
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20px;
`;

const Title = styled.h1`
  color: white;
  font-size: 3rem;
  margin-bottom: 2rem;
  text-align: center;
`;

function App() {
  const [roomData, setRoomData] = useState(null);

  const handleJoinRoom = (roomId, userId, language, mode, name) => {
    setRoomData({ roomId, userId, language, mode, name });
  };
  const handleLeaveRoom = () => {
    setRoomData(null);
  };

  return (
    <AppContainer>
      <Title>🌍 Polyglot - Multilingual Rooms</Title>
      {!roomData ? (
        <RoomSetup onJoinRoom={handleJoinRoom} />
      ) : (
        <RoomInterface
          initialRoomId={roomData.roomId}
          language={roomData.language}
          mode={roomData.mode}
          name={roomData.name}
          onLeaveRoom={handleLeaveRoom}
        />
      )}
    </AppContainer>
  );
}

export default App;