import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import {
  generateRoomCode,
  hashPin,
  getPlayerToken,
  setHostToken,
  setStoredRoom,
  setStoredPlayerId,
  getStoredRoom,
  getNextColor,
} from '../lib/utils';
import MarqueeHeader from '../components/MarqueeHeader';

export default function Home() {
  const navigate = useNavigate();
  const [mode, setMode] = useState(null); // 'host' | 'join'
  const [joinCode, setJoinCode] = useState('');
  const [hostPin, setHostPin] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [studioName, setStudioName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Check for existing room on mount
  const storedRoom = getStoredRoom();

  const handleHost = async () => {
    if (!hostPin || hostPin.length < 4) {
      setError('PIN must be at least 4 characters');
      return;
    }
    if (!playerName.trim()) {
      setError('Enter your name');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const hostToken = crypto.randomUUID();
      const code = generateRoomCode();
      const pinHash = await hashPin(hostPin);

      const { data: room, error: roomErr } = await supabase
        .from('rooms')
        .insert({ code, host_token: hostToken, host_pin_hash: pinHash })
        .select()
        .single();

      if (roomErr) throw roomErr;

      // Host also joins as a player
      const { data: player, error: playerErr } = await supabase
        .from('players')
        .insert({
          room_id: room.id,
          name: playerName.trim(),
          studio: studioName.trim() || null,
          color: '#e63946',
          browser_token: getPlayerToken(),
          is_connected: true,
        })
        .select()
        .single();

      if (playerErr) throw playerErr;

      setHostToken(hostToken);
      setStoredRoom(code);
      setStoredPlayerId(player.id);

      navigate('/room/' + code);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!joinCode.trim()) {
      setError('Enter a room code');
      return;
    }
    if (!playerName.trim()) {
      setError('Enter your name');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Check if room exists
      const { data: room, error: roomErr } = await supabase
        .from('rooms')
        .select('*')
        .eq('code', joinCode.trim().toUpperCase())
        .single();

      if (roomErr || !room) throw new Error('Room not found');
      if (room.is_locked) throw new Error('This room is locked');

      // Check if this browser already has a player
      const token = getPlayerToken();
      const { data: existing } = await supabase
        .from('players')
        .select('*')
        .eq('room_id', room.id)
        .eq('browser_token', token)
        .eq('is_removed', false)
        .single();

      if (existing) {
        // Reconnect
        await supabase
          .from('players')
          .update({ is_connected: true })
          .eq('id', existing.id);

        setStoredRoom(room.code);
        setStoredPlayerId(existing.id);
        navigate('/room/' + room.code);
        return;
      }

      // Get used colors
      const { data: players } = await supabase
        .from('players')
        .select('color')
        .eq('room_id', room.id);

      const usedColors = (players || []).map((p) => p.color);
      const color = getNextColor(usedColors);

      // Create new player
      const { data: player, error: playerErr } = await supabase
        .from('players')
        .insert({
          room_id: room.id,
          name: playerName.trim(),
          studio: studioName.trim() || null,
          color,
          browser_token: token,
          is_connected: true,
        })
        .select()
        .single();

      if (playerErr) {
        if (playerErr.message.includes('duplicate')) {
          throw new Error('That name is already taken');
        }
        throw playerErr;
      }

      setStoredRoom(room.code);
      setStoredPlayerId(player.id);
      navigate('/room/' + room.code);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRejoin = () => {
    navigate('/room/' + storedRoom);
  };

  const inputStyle = {
    background: '#0d0a07',
    border: '1px solid #3a3025',
    borderRadius: 8,
    padding: '12px 16px',
    color: '#e8d5b7',
    fontSize: 15,
    width: '100%',
    boxSizing: 'border-box',
    outline: 'none',
    fontFamily: 'var(--font-body)',
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #0d0a07, #1a1410, #0d0a07)',
      }}
    >
      <MarqueeHeader subtitle="— 2026 SEASON —" />

      <div style={{ maxWidth: 440, margin: '0 auto', padding: '40px 20px' }}>
        {/* Rejoin prompt */}
        {storedRoom && !mode && (
          <div
            style={{
              background: 'linear-gradient(135deg, #1a1410, #2a1f15)',
              border: '1px solid #c9a227',
              borderRadius: 12,
              padding: 20,
              marginBottom: 20,
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 13, color: '#8a7f75', marginBottom: 8 }}>
              You were in a room
            </div>
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 28,
                fontWeight: 900,
                color: '#c9a227',
                marginBottom: 12,
              }}
            >
              {storedRoom}
            </div>
            <button
              onClick={handleRejoin}
              style={{
                width: '100%',
                padding: '12px',
                background: 'linear-gradient(135deg, #c9a227, #f4d03f)',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                fontFamily: 'var(--font-display)',
                fontSize: 16,
                fontWeight: 700,
                color: '#0d0a07',
                letterSpacing: 2,
              }}
            >
              REJOIN
            </button>
          </div>
        )}

        {/* Mode selection */}
        {!mode && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button
              onClick={() => setMode('host')}
              style={{
                padding: '18px',
                background: 'linear-gradient(135deg, #c9a227, #f4d03f)',
                border: 'none',
                borderRadius: 12,
                cursor: 'pointer',
                fontFamily: 'var(--font-display)',
                fontSize: 18,
                fontWeight: 900,
                color: '#0d0a07',
                letterSpacing: 3,
              }}
            >
              HOST AN AUCTION
            </button>
            <button
              onClick={() => setMode('join')}
              style={{
                padding: '18px',
                background: 'linear-gradient(135deg, #1a1410, #2a1f15)',
                border: '2px solid #3a3025',
                borderRadius: 12,
                cursor: 'pointer',
                fontFamily: 'var(--font-display)',
                fontSize: 18,
                fontWeight: 700,
                color: '#e8d5b7',
                letterSpacing: 3,
              }}
            >
              JOIN AN AUCTION
            </button>
          </div>
        )}

        {/* Host form */}
        {mode === 'host' && (
          <div
            style={{
              background: 'linear-gradient(135deg, #1a1410, #2a1f15)',
              border: '1px solid #3a3025',
              borderRadius: 12,
              padding: 24,
              animation: 'slideUp 0.3s ease-out',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 18,
                fontWeight: 700,
                color: '#c9a227',
                letterSpacing: 2,
                marginBottom: 20,
                textAlign: 'center',
              }}
            >
              CREATE A ROOM
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label
                  style={{
                    fontSize: 10,
                    color: '#6a5f55',
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                    display: 'block',
                    marginBottom: 4,
                  }}
                >
                  Your Name *
                </label>
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="e.g. Ben"
                  style={inputStyle}
                  onFocus={(e) => (e.target.style.borderColor = '#c9a227')}
                  onBlur={(e) => (e.target.style.borderColor = '#3a3025')}
                />
              </div>
              <div>
                <label
                  style={{
                    fontSize: 10,
                    color: '#6a5f55',
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                    display: 'block',
                    marginBottom: 4,
                  }}
                >
                  Studio Name
                </label>
                <input
                  type="text"
                  value={studioName}
                  onChange={(e) => setStudioName(e.target.value)}
                  placeholder="e.g. Reel Deal Studios"
                  style={inputStyle}
                  onFocus={(e) => (e.target.style.borderColor = '#c9a227')}
                  onBlur={(e) => (e.target.style.borderColor = '#3a3025')}
                />
              </div>
              <div>
                <label
                  style={{
                    fontSize: 10,
                    color: '#6a5f55',
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                    display: 'block',
                    marginBottom: 4,
                  }}
                >
                  Admin PIN (4+ characters) *
                </label>
                <input
                  type="password"
                  value={hostPin}
                  onChange={(e) => setHostPin(e.target.value)}
                  placeholder="Set your admin PIN"
                  style={inputStyle}
                  onFocus={(e) => (e.target.style.borderColor = '#c9a227')}
                  onBlur={(e) => (e.target.style.borderColor = '#3a3025')}
                />
                <div style={{ fontSize: 10, color: '#6a5f55', marginTop: 4 }}>
                  Used to access admin controls if you switch devices
                </div>
              </div>

              {error && (
                <div
                  style={{
                    color: '#e63946',
                    fontSize: 13,
                    textAlign: 'center',
                  }}
                >
                  {error}
                </div>
              )}

              <button
                onClick={handleHost}
                disabled={loading}
                style={{
                  padding: '14px',
                  background: 'linear-gradient(135deg, #c9a227, #f4d03f)',
                  border: 'none',
                  borderRadius: 8,
                  cursor: loading ? 'wait' : 'pointer',
                  fontFamily: 'var(--font-display)',
                  fontSize: 16,
                  fontWeight: 700,
                  color: '#0d0a07',
                  letterSpacing: 2,
                  opacity: loading ? 0.6 : 1,
                }}
              >
                {loading ? 'CREATING...' : 'CREATE ROOM'}
              </button>
              <button
                onClick={() => {
                  setMode(null);
                  setError('');
                }}
                style={{
                  padding: '10px',
                  background: 'transparent',
                  border: 'none',
                  color: '#6a5f55',
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                Back
              </button>
            </div>
          </div>
        )}

        {/* Join form */}
        {mode === 'join' && (
          <div
            style={{
              background: 'linear-gradient(135deg, #1a1410, #2a1f15)',
              border: '1px solid #3a3025',
              borderRadius: 12,
              padding: 24,
              animation: 'slideUp 0.3s ease-out',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 18,
                fontWeight: 700,
                color: '#c9a227',
                letterSpacing: 2,
                marginBottom: 20,
                textAlign: 'center',
              }}
            >
              JOIN A ROOM
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label
                  style={{
                    fontSize: 10,
                    color: '#6a5f55',
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                    display: 'block',
                    marginBottom: 4,
                  }}
                >
                  Room Code *
                </label>
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="e.g. SMA-X7K2"
                  style={{
                    ...inputStyle,
                    textAlign: 'center',
                    fontSize: 22,
                    fontWeight: 700,
                    fontFamily: 'var(--font-display)',
                    letterSpacing: 4,
                  }}
                  onFocus={(e) => (e.target.style.borderColor = '#c9a227')}
                  onBlur={(e) => (e.target.style.borderColor = '#3a3025')}
                />
              </div>
              <div>
                <label
                  style={{
                    fontSize: 10,
                    color: '#6a5f55',
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                    display: 'block',
                    marginBottom: 4,
                  }}
                >
                  Your Name *
                </label>
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="e.g. Dom"
                  style={inputStyle}
                  onFocus={(e) => (e.target.style.borderColor = '#c9a227')}
                  onBlur={(e) => (e.target.style.borderColor = '#3a3025')}
                />
              </div>
              <div>
                <label
                  style={{
                    fontSize: 10,
                    color: '#6a5f55',
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                    display: 'block',
                    marginBottom: 4,
                  }}
                >
                  Studio Name
                </label>
                <input
                  type="text"
                  value={studioName}
                  onChange={(e) => setStudioName(e.target.value)}
                  placeholder="e.g. Dominion Films"
                  style={inputStyle}
                  onFocus={(e) => (e.target.style.borderColor = '#c9a227')}
                  onBlur={(e) => (e.target.style.borderColor = '#3a3025')}
                />
              </div>

              {error && (
                <div
                  style={{
                    color: '#e63946',
                    fontSize: 13,
                    textAlign: 'center',
                  }}
                >
                  {error}
                </div>
              )}

              <button
                onClick={handleJoin}
                disabled={loading}
                style={{
                  padding: '14px',
                  background: 'linear-gradient(135deg, #c9a227, #f4d03f)',
                  border: 'none',
                  borderRadius: 8,
                  cursor: loading ? 'wait' : 'pointer',
                  fontFamily: 'var(--font-display)',
                  fontSize: 16,
                  fontWeight: 700,
                  color: '#0d0a07',
                  letterSpacing: 2,
                  opacity: loading ? 0.6 : 1,
                }}
              >
                {loading ? 'JOINING...' : 'JOIN ROOM'}
              </button>
              <button
                onClick={() => {
                  setMode(null);
                  setError('');
                }}
                style={{
                  padding: '10px',
                  background: 'transparent',
                  border: 'none',
                  color: '#6a5f55',
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                Back
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
