import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import {
  getPlayerToken, getStoredRoom, setStoredRoom,
  setStoredPlayerId, getHostToken, setHostToken,
  generateRoomCode, hashPin, getNextColor,
} from '../lib/utils';
import MarqueeHeader from '../components/MarqueeHeader';

export default function Home() {
  const navigate = useNavigate();
  const [mode, setMode] = useState(null); // 'host' | 'join' | 'rejoin'
  const [joinCode, setJoinCode] = useState('');
  const [hostPin, setHostPin] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [studioName, setStudioName] = useState('');
  const [rejoinCode, setRejoinCode] = useState('');
  const [rejoinName, setRejoinName] = useState('');
  const [rejoinPin, setRejoinPin] = useState('');
  const [playerPin, setPlayerPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const storedRoom = getStoredRoom();

  // ─── HOST ─────────────────────────────────────────────────
  const handleHost = async () => {
    if (!playerPin || playerPin.length < 4) { setError('PIN must be at least 4 characters'); return; }
    if (!playerName.trim()) { setError('Enter your name'); return; }
    setLoading(true); setError('');
    try {
      const hostToken = crypto.randomUUID();
      const code = generateRoomCode();
      const pinHash = await hashPin(playerPin);

      const { data: room, error: roomErr } = await supabase
        .from('rooms').insert({ code, host_token: hostToken, host_pin_hash: pinHash }).select().single();
      if (roomErr) throw roomErr;

      const { data: player, error: playerErr } = await supabase
        .from('players').insert({
          room_id: room.id, name: playerName.trim(),
          studio: studioName.trim() || null, color: '#e63946',
          browser_token: getPlayerToken(), is_connected: true,
          pin_hash: pinHash, is_host: true,
        }).select().single();
      if (playerErr) throw playerErr;

      setHostToken(hostToken);
      setStoredRoom(code);
      setStoredPlayerId(player.id);
      navigate('/room/' + code);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  // ─── JOIN (new player) ────────────────────────────────────
  const handleJoin = async () => {
    if (!joinCode.trim()) { setError('Enter a room code'); return; }
    if (!playerName.trim()) { setError('Enter your name'); return; }
    if (!playerPin || playerPin.length < 4) { setError('Set a 4+ character PIN for rejoining later'); return; }
    setLoading(true); setError('');
    try {
      const { data: room, error: roomErr } = await supabase
        .from('rooms').select('*').eq('code', joinCode.trim().toUpperCase()).single();
      if (roomErr || !room) throw new Error('Room not found');
      if (room.is_locked) throw new Error('Room is locked');

      const { data: existingPlayers } = await supabase
        .from('players').select('color').eq('room_id', room.id).eq('is_removed', false);
      const usedColors = (existingPlayers || []).map(p => p.color);

      const pinHash = await hashPin(playerPin);

      const { data: player, error: playerErr } = await supabase
        .from('players').insert({
          room_id: room.id, name: playerName.trim(),
          studio: studioName.trim() || null,
          color: getNextColor(usedColors),
          browser_token: getPlayerToken(), is_connected: true,
          pin_hash: pinHash,
        }).select().single();

      if (playerErr) {
        if (playerErr.message.includes('duplicate')) throw new Error('That name is already taken');
        throw playerErr;
      }

      setStoredRoom(room.code);
      setStoredPlayerId(player.id);
      navigate('/room/' + room.code);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  // ─── REJOIN (existing player, any device) ─────────────────
  const handleRejoin = async () => {
    if (!rejoinCode.trim()) { setError('Enter your room code'); return; }
    if (!rejoinName.trim()) { setError('Enter your name'); return; }
    if (!rejoinPin) { setError('Enter your PIN'); return; }
    setLoading(true); setError('');
    try {
      const { data: room, error: roomErr } = await supabase
        .from('rooms').select('*').eq('code', rejoinCode.trim().toUpperCase()).single();
      if (roomErr || !room) throw new Error('Room not found');

      const pinHash = await hashPin(rejoinPin);

      const { data: players } = await supabase
        .from('players').select('*')
        .eq('room_id', room.id)
        .ilike('name', rejoinName.trim())
        .eq('is_removed', false);

      if (!players || players.length === 0) throw new Error('No player with that name found in this room');

      const player = players.find(p => p.pin_hash === pinHash);
      if (!player) throw new Error('Incorrect PIN');

      // Update browser token and connection status to this device
      await supabase.from('players').update({
        browser_token: getPlayerToken(),
        is_connected: true,
      }).eq('id', player.id);

      // Restore host privileges if this player is the host
      if (player.is_host) {
        setHostToken(room.host_token);
      }

      setStoredRoom(room.code);
      setStoredPlayerId(player.id);
      navigate('/room/' + room.code);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  // ─── Quick rejoin from localStorage ───────────────────────
  const handleQuickRejoin = () => {
    navigate('/room/' + storedRoom);
  };

  const inputStyle = {
    background: '#0d0a07', border: '1px solid #3a3025', borderRadius: 8,
    padding: '12px 16px', color: '#e8d5b7', fontSize: 15,
    width: '100%', boxSizing: 'border-box', outline: 'none',
    fontFamily: 'var(--font-body)',
  };

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #0d0a07, #1a1410, #0d0a07)' }}>
      <MarqueeHeader subtitle="— 2026 SEASON —" />

      <div style={{ maxWidth: 440, margin: '0 auto', padding: '40px 20px' }}>

        {/* Quick rejoin from localStorage */}
        {storedRoom && !mode && (
          <div style={{
            background: 'linear-gradient(135deg, #1a1410, #2a1f15)',
            border: '1px solid #c9a227', borderRadius: 12, padding: 20, marginBottom: 20, textAlign: 'center',
          }}>
            <div style={{ fontSize: 13, color: '#8a7f75', marginBottom: 8 }}>You were in a room</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 900, color: '#c9a227', marginBottom: 12 }}>{storedRoom}</div>
            <button onClick={handleQuickRejoin} style={{
              width: '100%', padding: '12px', background: 'linear-gradient(135deg, #c9a227, #f4d03f)',
              border: 'none', borderRadius: 8, cursor: 'pointer',
              fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700,
              color: '#0d0a07', letterSpacing: 2,
            }}>
              REJOIN
            </button>
          </div>
        )}

        {/* Mode selection buttons */}
        {!mode && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button onClick={() => { setMode('host'); setError(''); }} style={{
              padding: '18px', background: 'linear-gradient(135deg, #c9a227, #f4d03f)',
              border: 'none', borderRadius: 12, cursor: 'pointer',
              fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 900,
              color: '#0d0a07', letterSpacing: 3,
            }}>
              HOST AN AUCTION
            </button>
            <button onClick={() => { setMode('join'); setError(''); }} style={{
              padding: '18px', background: 'linear-gradient(135deg, #1a1410, #2a1f15)',
              border: '2px solid #3a3025', borderRadius: 12, cursor: 'pointer',
              fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700,
              color: '#e8d5b7', letterSpacing: 3,
            }}>
              JOIN AN AUCTION
            </button>
            <button onClick={() => { setMode('rejoin'); setError(''); }} style={{
              padding: '18px', background: 'linear-gradient(135deg, #1a1410, #2a1f15)',
              border: '2px solid #2a9d8f', borderRadius: 12, cursor: 'pointer',
              fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700,
              color: '#2a9d8f', letterSpacing: 3,
            }}>
              REJOIN MY STUDIO
            </button>
          </div>
        )}

        {/* ─── HOST FORM ─────────────────────────────────── */}
        {mode === 'host' && (
          <div style={{
            background: 'linear-gradient(135deg, #1a1410, #2a1f15)',
            border: '1px solid #3a3025', borderRadius: 12, padding: 24,
          }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: '#c9a227', letterSpacing: 2, marginBottom: 20, textAlign: 'center' }}>
              CREATE A ROOM
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 10, color: '#6a5f55', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 4 }}>Your Name *</label>
                <input type="text" value={playerName} onChange={e => setPlayerName(e.target.value)}
                  placeholder="e.g. Ben" style={inputStyle}
                  onFocus={e => e.target.style.borderColor = '#c9a227'} onBlur={e => e.target.style.borderColor = '#3a3025'} />
              </div>
              <div>
                <label style={{ fontSize: 10, color: '#6a5f55', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 4 }}>Studio Name</label>
                <input type="text" value={studioName} onChange={e => setStudioName(e.target.value)}
                  placeholder="e.g. Wild Card Pictures" style={inputStyle}
                  onFocus={e => e.target.style.borderColor = '#c9a227'} onBlur={e => e.target.style.borderColor = '#3a3025'} />
              </div>
              <div>
                <label style={{ fontSize: 10, color: '#6a5f55', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 4 }}>Your PIN * (to rejoin later)</label>
                <input type="password" value={playerPin} onChange={e => setPlayerPin(e.target.value)}
                  placeholder="4+ characters" style={inputStyle}
                  onFocus={e => e.target.style.borderColor = '#c9a227'} onBlur={e => e.target.style.borderColor = '#3a3025'} />
                <div style={{ fontSize: 10, color: '#3a3025', marginTop: 4 }}>You'll use this PIN + your name to rejoin from any device</div>
              </div>
              {error && <div style={{ color: '#e63946', fontSize: 13, textAlign: 'center' }}>{error}</div>}
              <button onClick={handleHost} disabled={loading} style={{
                padding: '14px', background: 'linear-gradient(135deg, #c9a227, #f4d03f)',
                border: 'none', borderRadius: 8, cursor: loading ? 'wait' : 'pointer',
                fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700,
                color: '#0d0a07', letterSpacing: 2, opacity: loading ? 0.6 : 1,
              }}>
                {loading ? 'CREATING...' : 'CREATE ROOM'}
              </button>
              <button onClick={() => { setMode(null); setError(''); }} style={{
                padding: '10px', background: 'transparent', border: 'none',
                color: '#6a5f55', fontSize: 13, cursor: 'pointer',
              }}>Back</button>
            </div>
          </div>
        )}

        {/* ─── JOIN FORM ─────────────────────────────────── */}
        {mode === 'join' && (
          <div style={{
            background: 'linear-gradient(135deg, #1a1410, #2a1f15)',
            border: '1px solid #3a3025', borderRadius: 12, padding: 24,
          }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: '#c9a227', letterSpacing: 2, marginBottom: 20, textAlign: 'center' }}>
              JOIN A ROOM
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 10, color: '#6a5f55', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 4 }}>Room Code *</label>
                <input type="text" value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="SMA-XXXX" style={{ ...inputStyle, textTransform: 'uppercase', letterSpacing: 3, textAlign: 'center', fontSize: 20 }}
                  onFocus={e => e.target.style.borderColor = '#c9a227'} onBlur={e => e.target.style.borderColor = '#3a3025'} />
              </div>
              <div>
                <label style={{ fontSize: 10, color: '#6a5f55', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 4 }}>Your Name *</label>
                <input type="text" value={playerName} onChange={e => setPlayerName(e.target.value)}
                  placeholder="e.g. Dom" style={inputStyle}
                  onFocus={e => e.target.style.borderColor = '#c9a227'} onBlur={e => e.target.style.borderColor = '#3a3025'} />
              </div>
              <div>
                <label style={{ fontSize: 10, color: '#6a5f55', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 4 }}>Studio Name</label>
                <input type="text" value={studioName} onChange={e => setStudioName(e.target.value)}
                  placeholder="e.g. Dominion Films" style={inputStyle}
                  onFocus={e => e.target.style.borderColor = '#c9a227'} onBlur={e => e.target.style.borderColor = '#3a3025'} />
              </div>
              <div>
                <label style={{ fontSize: 10, color: '#6a5f55', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 4 }}>Set Your PIN * (to rejoin later)</label>
                <input type="password" value={playerPin} onChange={e => setPlayerPin(e.target.value)}
                  placeholder="4+ characters" style={inputStyle}
                  onFocus={e => e.target.style.borderColor = '#c9a227'} onBlur={e => e.target.style.borderColor = '#3a3025'} />
                <div style={{ fontSize: 10, color: '#3a3025', marginTop: 4 }}>Remember this — you'll need it to rejoin from another device</div>
              </div>
              {error && <div style={{ color: '#e63946', fontSize: 13, textAlign: 'center' }}>{error}</div>}
              <button onClick={handleJoin} disabled={loading} style={{
                padding: '14px', background: 'linear-gradient(135deg, #c9a227, #f4d03f)',
                border: 'none', borderRadius: 8, cursor: loading ? 'wait' : 'pointer',
                fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700,
                color: '#0d0a07', letterSpacing: 2, opacity: loading ? 0.6 : 1,
              }}>
                {loading ? 'JOINING...' : 'JOIN ROOM'}
              </button>
              <button onClick={() => { setMode(null); setError(''); }} style={{
                padding: '10px', background: 'transparent', border: 'none',
                color: '#6a5f55', fontSize: 13, cursor: 'pointer',
              }}>Back</button>
            </div>
          </div>
        )}

        {/* ─── REJOIN FORM ───────────────────────────────── */}
        {mode === 'rejoin' && (
          <div style={{
            background: 'linear-gradient(135deg, #1a1410, #2a1f15)',
            border: '1px solid #2a9d8f', borderRadius: 12, padding: 24,
          }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: '#2a9d8f', letterSpacing: 2, marginBottom: 20, textAlign: 'center' }}>
              REJOIN MY STUDIO
            </div>
            <div style={{ fontSize: 12, color: '#6a5f55', textAlign: 'center', marginBottom: 16 }}>
              Use your name and PIN to reconnect from any device
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 10, color: '#6a5f55', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 4 }}>Room Code *</label>
                <input type="text" value={rejoinCode} onChange={e => setRejoinCode(e.target.value.toUpperCase())}
                  placeholder="SMA-XXXX" style={{ ...inputStyle, textTransform: 'uppercase', letterSpacing: 3, textAlign: 'center', fontSize: 20 }}
                  onFocus={e => e.target.style.borderColor = '#2a9d8f'} onBlur={e => e.target.style.borderColor = '#3a3025'} />
              </div>
              <div>
                <label style={{ fontSize: 10, color: '#6a5f55', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 4 }}>Your Name *</label>
                <input type="text" value={rejoinName} onChange={e => setRejoinName(e.target.value)}
                  placeholder="Exactly as you entered it" style={inputStyle}
                  onFocus={e => e.target.style.borderColor = '#2a9d8f'} onBlur={e => e.target.style.borderColor = '#3a3025'} />
              </div>
              <div>
                <label style={{ fontSize: 10, color: '#6a5f55', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 4 }}>Your PIN *</label>
                <input type="password" value={rejoinPin} onChange={e => setRejoinPin(e.target.value)}
                  placeholder="The PIN you set when joining" style={inputStyle}
                  onFocus={e => e.target.style.borderColor = '#2a9d8f'} onBlur={e => e.target.style.borderColor = '#3a3025'} />
              </div>
              {error && <div style={{ color: '#e63946', fontSize: 13, textAlign: 'center' }}>{error}</div>}
              <button onClick={handleRejoin} disabled={loading} style={{
                padding: '14px', background: 'linear-gradient(135deg, #2a9d8f, #3dccbb)',
                border: 'none', borderRadius: 8, cursor: loading ? 'wait' : 'pointer',
                fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700,
                color: '#0d0a07', letterSpacing: 2, opacity: loading ? 0.6 : 1,
              }}>
                {loading ? 'RECONNECTING...' : 'REJOIN'}
              </button>
              <button onClick={() => { setMode(null); setError(''); }} style={{
                padding: '10px', background: 'transparent', border: 'none',
                color: '#6a5f55', fontSize: 13, cursor: 'pointer',
              }}>Back</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
