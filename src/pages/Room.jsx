import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useRoom } from '../hooks/useRoom';
import { useMovies } from '../hooks/useMovies';
import { useAuction } from '../hooks/useAuction';
import { useResults } from '../hooks/useResults';
import { clearStoredRoom, getPlayerToken, setStoredRoom, setStoredPlayerId, setHostToken, hashPin } from '../lib/utils';
import MarqueeHeader from '../components/MarqueeHeader';
import Lobby from '../components/Lobby';
import AuctionNight from '../components/AuctionNight';
import Roster from '../components/Roster';
import Rules from '../components/Rules';
import Awards from '../components/Awards';

export default function Room() {
  const { roomCode } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('lobby');

  const {
    room, players, currentPlayer, isHost,
    loading, error, setError,
    joinRoom, setConnected, toggleLock, removePlayer,
  } = useRoom(roomCode);

  const { movies, addMovie, removeMovie } = useMovies(room?.id);
  const auction = useAuction(room?.id, isHost);
  const { results, getStandings } = useResults(room?.id);

  useEffect(() => {
    if (currentPlayer) {
      setConnected(true);
      const handleUnload = () => setConnected(false);
      window.addEventListener('beforeunload', handleUnload);
      return () => {
        window.removeEventListener('beforeunload', handleUnload);
        setConnected(false);
      };
    }
  }, [currentPlayer?.id]);

  useEffect(() => {
    if (auction.isActive) {
      setActiveTab('auction');
    }
  }, [auction.isActive]);

  const handleLeave = () => {
    clearStoredRoom();
    navigate('/');
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0d0a07', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, color: '#c9a227' }}>Loading...</div>
      </div>
    );
  }

  if (error || !room) {
    return (
      <div style={{ minHeight: '100vh', background: '#0d0a07', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, color: '#e63946' }}>{error || 'Room not found'}</div>
        <button onClick={() => { clearStoredRoom(); navigate('/'); }}
          style={{ padding: '10px 24px', background: 'transparent', border: '1px solid #3a3025', borderRadius: 8, color: '#6a5f55', cursor: 'pointer', fontSize: 14 }}>
          Back to Home
        </button>
      </div>
    );
  }

  if (!currentPlayer) {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #0d0a07, #1a1410, #0d0a07)' }}>
        <MarqueeHeader subtitle={'Room: ' + room.code} compact />
        <JoinPrompt room={room} onJoin={joinRoom} error={error} />
      </div>
    );
  }

  const tabs = [
    { id: 'roster', label: 'Home' },
    { id: 'lobby', label: 'Lobby' },
    { id: 'auction', label: 'Auction Night', highlight: true },
    { id: 'rules', label: 'Rules' },
    { id: 'awards', label: 'Awards' },
  ];

  const standings = getStandings(players);

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #0d0a07, #1a1410, #0d0a07)' }}>
      <MarqueeHeader
        compact={activeTab === 'auction'}
        subtitle={activeTab === 'auction' ? '★ AUCTION NIGHT ★' : 'Room: ' + room.code}
      />

      <div style={{ display: 'flex', justifyContent: 'center', gap: 4, padding: '20px 20px 0', flexWrap: 'wrap' }}>
        {tabs.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            style={{
              background: activeTab === tab.id
                ? tab.highlight ? 'linear-gradient(180deg, #2d0a0a, #1a1410)' : 'linear-gradient(180deg, #2a1f15, #1a1410)'
                : 'transparent',
              border: activeTab === tab.id
                ? '1px solid ' + (tab.highlight ? '#e63946' : '#c9a227')
                : '1px solid #2a1f15',
              borderBottom: activeTab === tab.id ? '1px solid #1a1410' : '1px solid #2a1f15',
              borderRadius: '8px 8px 0 0',
              padding: '10px 24px',
              color: activeTab === tab.id ? (tab.highlight ? '#ff6b6b' : '#c9a227') : '#6a5f55',
              fontFamily: 'var(--font-display)',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
              letterSpacing: 2,
              textTransform: 'uppercase',
              transition: 'all 0.2s',
            }}>
            {tab.label}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '0 20px 40px' }}>
        {activeTab === 'roster' && (
          <Roster room={room} players={players} results={results} movies={movies} />
        )}

        {activeTab === 'lobby' && (
          <Lobby
            room={room} players={players} currentPlayer={currentPlayer} isHost={isHost}
            movies={movies} results={results}
            onToggleLock={toggleLock} onRemovePlayer={removePlayer}
            onAddMovie={addMovie} onRemoveMovie={removeMovie} onLeave={handleLeave}
          />
        )}

        {activeTab === 'auction' && (
          <AuctionNight
            room={room} players={players} currentPlayer={currentPlayer} isHost={isHost}
            movies={movies} auction={auction} results={results}
          />
        )}

        {activeTab === 'rules' && (
          <Rules />
        )}

        {activeTab === 'awards' && (
          <Awards players={players} results={results} movies={movies} />
        )}
      </div>
    </div>
  );
}

function JoinPrompt({ room, onJoin, error }) {
  const [joinMode, setJoinMode] = useState('new'); // 'new' | 'rejoin'
  const [name, setName] = useState('');
  const [studio, setStudio] = useState('');
  const [pin, setPin] = useState('');
  const [rejoinName, setRejoinName] = useState('');
  const [rejoinPin, setRejoinPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState('');

  const handleNewJoin = async () => {
    if (!pin || pin.length < 4) { setLocalError('Set a 4+ character PIN for rejoining later'); return; }
    setLoading(true); setLocalError('');
    await onJoin(name, studio, pin);
    setLoading(false);
  };

  const handleRejoin = async () => {
    if (!rejoinName.trim()) { setLocalError('Enter your name'); return; }
    if (!rejoinPin) { setLocalError('Enter your PIN'); return; }
    setLoading(true); setLocalError('');
    try {
      const pinHash = await hashPin(rejoinPin);
      const { data: players } = await supabase
        .from('players').select('*')
        .eq('room_id', room.id)
        .ilike('name', rejoinName.trim())
        .eq('is_removed', false);

      if (!players || players.length === 0) throw new Error('No player with that name found');
      const player = players.find(p => p.pin_hash === pinHash);
      if (!player) throw new Error('Incorrect PIN');

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
      window.location.reload();
    } catch (err) { setLocalError(err.message); }
    finally { setLoading(false); }
  };

  const inputStyle = {
    background: '#0d0a07', border: '1px solid #3a3025', borderRadius: 8,
    padding: '12px 16px', color: '#e8d5b7', fontSize: 15,
    width: '100%', boxSizing: 'border-box', outline: 'none',
  };

  const displayError = localError || error;

  return (
    <div style={{ maxWidth: 400, margin: '0 auto', padding: '40px 20px' }}>
      {/* Toggle tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 0 }}>
        <button onClick={() => { setJoinMode('new'); setLocalError(''); }}
          style={{
            flex: 1, padding: '10px', borderRadius: '8px 8px 0 0', cursor: 'pointer',
            background: joinMode === 'new' ? 'linear-gradient(135deg, #1a1410, #2a1f15)' : 'transparent',
            border: joinMode === 'new' ? '1px solid #c9a227' : '1px solid #2a1f15',
            borderBottom: 'none', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700,
            color: joinMode === 'new' ? '#c9a227' : '#6a5f55', letterSpacing: 2,
          }}>
          NEW PLAYER
        </button>
        <button onClick={() => { setJoinMode('rejoin'); setLocalError(''); }}
          style={{
            flex: 1, padding: '10px', borderRadius: '8px 8px 0 0', cursor: 'pointer',
            background: joinMode === 'rejoin' ? 'linear-gradient(135deg, #1a1410, #2a1f15)' : 'transparent',
            border: joinMode === 'rejoin' ? '1px solid #2a9d8f' : '1px solid #2a1f15',
            borderBottom: 'none', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700,
            color: joinMode === 'rejoin' ? '#2a9d8f' : '#6a5f55', letterSpacing: 2,
          }}>
          REJOIN
        </button>
      </div>

      <div style={{
        background: 'linear-gradient(135deg, #1a1410, #2a1f15)',
        border: '1px solid ' + (joinMode === 'rejoin' ? '#2a9d8f' : '#3a3025'),
        borderRadius: '0 0 12px 12px', padding: 24,
      }}>
        {/* New player form */}
        {joinMode === 'new' && (
          <>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: '#c9a227', letterSpacing: 2, marginBottom: 20, textAlign: 'center' }}>
              JOIN THE AUCTION
            </div>
            {room.is_locked ? (
              <div style={{ color: '#e63946', fontSize: 13, textAlign: 'center' }}>This room is locked. No new players can join.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 10, color: '#6a5f55', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 4 }}>Your Name *</label>
                  <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter your name" style={inputStyle}
                    onFocus={(e) => (e.target.style.borderColor = '#c9a227')} onBlur={(e) => (e.target.style.borderColor = '#3a3025')} />
                </div>
                <div>
                  <label style={{ fontSize: 10, color: '#6a5f55', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 4 }}>Studio Name</label>
                  <input type="text" value={studio} onChange={(e) => setStudio(e.target.value)} placeholder="e.g. Wild Card Pictures" style={inputStyle}
                    onFocus={(e) => (e.target.style.borderColor = '#c9a227')} onBlur={(e) => (e.target.style.borderColor = '#3a3025')} />
                </div>
                <div>
                  <label style={{ fontSize: 10, color: '#6a5f55', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 4 }}>Set Your PIN * (to rejoin later)</label>
                  <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="4+ characters" style={inputStyle}
                    onFocus={(e) => (e.target.style.borderColor = '#c9a227')} onBlur={(e) => (e.target.style.borderColor = '#3a3025')} />
                  <div style={{ fontSize: 10, color: '#3a3025', marginTop: 4 }}>Remember this — you'll need it to rejoin from another device</div>
                </div>
                {displayError && <div style={{ color: '#e63946', fontSize: 13, textAlign: 'center' }}>{displayError}</div>}
                <button onClick={handleNewJoin} disabled={loading || !name.trim()}
                  style={{
                    padding: '14px',
                    background: name.trim() ? 'linear-gradient(135deg, #c9a227, #f4d03f)' : '#2a1f15',
                    border: 'none', borderRadius: 8,
                    cursor: name.trim() ? 'pointer' : 'not-allowed',
                    fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700,
                    color: name.trim() ? '#0d0a07' : '#6a5f55', letterSpacing: 2,
                  }}>
                  {loading ? 'JOINING...' : 'JOIN'}
                </button>
              </div>
            )}
          </>
        )}

        {/* Rejoin form */}
        {joinMode === 'rejoin' && (
          <>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: '#2a9d8f', letterSpacing: 2, marginBottom: 8, textAlign: 'center' }}>
              REJOIN MY STUDIO
            </div>
            <div style={{ fontSize: 12, color: '#6a5f55', textAlign: 'center', marginBottom: 16 }}>
              Enter your name and PIN to reconnect
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 10, color: '#6a5f55', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 4 }}>Your Name *</label>
                <input type="text" value={rejoinName} onChange={(e) => setRejoinName(e.target.value)} placeholder="Exactly as you entered it" style={inputStyle}
                  onFocus={(e) => (e.target.style.borderColor = '#2a9d8f')} onBlur={(e) => (e.target.style.borderColor = '#3a3025')} />
              </div>
              <div>
                <label style={{ fontSize: 10, color: '#6a5f55', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 4 }}>Your PIN *</label>
                <input type="password" value={rejoinPin} onChange={(e) => setRejoinPin(e.target.value)} placeholder="The PIN you set when joining" style={inputStyle}
                  onFocus={(e) => (e.target.style.borderColor = '#2a9d8f')} onBlur={(e) => (e.target.style.borderColor = '#3a3025')} />
              </div>
              {displayError && <div style={{ color: '#e63946', fontSize: 13, textAlign: 'center' }}>{displayError}</div>}
              <button onClick={handleRejoin} disabled={loading || !rejoinName.trim()}
                style={{
                  padding: '14px',
                  background: rejoinName.trim() ? 'linear-gradient(135deg, #2a9d8f, #3dccbb)' : '#2a1f15',
                  border: 'none', borderRadius: 8,
                  cursor: rejoinName.trim() ? 'pointer' : 'not-allowed',
                  fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700,
                  color: rejoinName.trim() ? '#0d0a07' : '#6a5f55', letterSpacing: 2,
                }}>
                {loading ? 'RECONNECTING...' : 'REJOIN'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
