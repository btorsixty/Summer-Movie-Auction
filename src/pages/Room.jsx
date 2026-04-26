import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useRoom } from '../hooks/useRoom';
import { useMovies } from '../hooks/useMovies';
import { useAuction } from '../hooks/useAuction';
import { useResults } from '../hooks/useResults';
import { clearStoredRoom } from '../lib/utils';
import MarqueeHeader from '../components/MarqueeHeader';
import Lobby from '../components/Lobby';
import AuctionNight from '../components/AuctionNight';
import Roster from '../components/Roster';
import Rules from '../components/Rules';

export default function Room() {
  const { roomCode } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('lobby');

  const {
    room,
    players,
    currentPlayer,
    isHost,
    loading,
    error,
    setError,
    joinRoom,
    setConnected,
    toggleLock,
    removePlayer,
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
      </div>
    </div>
  );
}

function JoinPrompt({ room, onJoin, error }) {
  const [name, setName] = useState('');
  const [studio, setStudio] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    await onJoin(name, studio);
    setLoading(false);
  };

  const inputStyle = {
    background: '#0d0a07', border: '1px solid #3a3025', borderRadius: 8,
    padding: '12px 16px', color: '#e8d5b7', fontSize: 15,
    width: '100%', boxSizing: 'border-box', outline: 'none',
  };

  return (
    <div style={{ maxWidth: 400, margin: '0 auto', padding: '40px 20px' }}>
      <div style={{ background: 'linear-gradient(135deg, #1a1410, #2a1f15)', border: '1px solid #3a3025', borderRadius: 12, padding: 24 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: '#c9a227', letterSpacing: 2, marginBottom: 20, textAlign: 'center' }}>
          JOIN THE AUCTION
        </div>
        {room.is_locked && (
          <div style={{ color: '#e63946', fontSize: 13, textAlign: 'center', marginBottom: 12 }}>
            This room is locked. No new players can join.
          </div>
        )}
        {!room.is_locked && (
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
            {error && <div style={{ color: '#e63946', fontSize: 13, textAlign: 'center' }}>{error}</div>}
            <button onClick={handleSubmit} disabled={loading || !name.trim()}
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
      </div>
    </div>
  );
}
