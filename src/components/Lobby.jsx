import { useState } from 'react';

export default function Lobby({
  room,
  players,
  currentPlayer,
  isHost,
  movies,
  results,
  onToggleLock,
  onRemovePlayer,
  onAddMovie,
  onRemoveMovie,
  onLeave,
}) {
  const [showAddMovie, setShowAddMovie] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newRelease, setNewRelease] = useState('');
  const [newMojoUrl, setNewMojoUrl] = useState('');

  const handleAddMovie = async () => {
    if (!newTitle.trim() || !newRelease) return;
    let slug = null;
    if (newMojoUrl.trim()) {
      const match = newMojoUrl.match(/release\/(rl\d+)/);
      slug = match ? match[1] : newMojoUrl.trim();
    }
    await onAddMovie(newTitle, newRelease, slug);
    setNewTitle('');
    setNewRelease('');
    setNewMojoUrl('');
    setShowAddMovie(false);
  };

  const playerSpent = (playerId) => {
    return results
      .filter((r) => r.player_id === playerId && r.status === 'active')
      .reduce((s, r) => s + r.bid_amount, 0);
  };

  const inputStyle = {
    background: '#0d0a07',
    border: '1px solid #3a3025',
    borderRadius: 8,
    padding: '10px 14px',
    color: '#e8d5b7',
    fontSize: 14,
    width: '100%',
    boxSizing: 'border-box',
    outline: 'none',
  };

  return (
    <div style={{ paddingTop: 20 }}>
      {/* Room Code Display */}
      <div
        style={{
          background: 'linear-gradient(135deg, #1a1410, #2a1f15)',
          border: '2px solid #c9a227',
          borderRadius: 12,
          padding: 24,
          textAlign: 'center',
          marginBottom: 20,
        }}
      >
        <div
          style={{
            fontSize: 11,
            color: '#6a5f55',
            textTransform: 'uppercase',
            letterSpacing: 3,
            marginBottom: 6,
          }}
        >
          ROOM CODE
        </div>
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(36px, 8vw, 56px)',
            fontWeight: 900,
            color: '#c9a227',
            letterSpacing: 6,
            textShadow: '0 0 20px rgba(201,162,39,0.4)',
          }}
        >
          {room.code}
        </div>
        <div style={{ fontSize: 12, color: '#8a7f75', marginTop: 6 }}>
          Share this code with players to join
        </div>

        {/* Host controls */}
        {isHost && (
          <div
            style={{
              display: 'flex',
              gap: 8,
              justifyContent: 'center',
              marginTop: 16,
              flexWrap: 'wrap',
            }}
          >
            <button
              onClick={onToggleLock}
              style={{
                padding: '8px 16px',
                background: room.is_locked ? '#e6394620' : '#2a9d8f20',
                border: '1px solid ' + (room.is_locked ? '#e63946' : '#2a9d8f'),
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
                color: room.is_locked ? '#e63946' : '#2a9d8f',
              }}
            >
              {room.is_locked ? 'UNLOCK ROOM' : 'LOCK ROOM'}
            </button>
          </div>
        )}
      </div>

      {/* Connected Players */}
      <div
        style={{
          background: 'linear-gradient(135deg, #1a1410, #0d0a07)',
          border: '1px solid #2a1f15',
          borderRadius: 12,
          overflow: 'hidden',
          marginBottom: 20,
        }}
      >
        <div
          style={{
            padding: '12px 20px',
            borderBottom: '2px solid #c9a227',
            fontFamily: 'var(--font-display)',
            fontSize: 14,
            fontWeight: 700,
            color: '#c9a227',
            letterSpacing: 2,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>PLAYERS</span>
          <span style={{ color: '#6a5f55', fontSize: 12 }}>
            {players.length + ' connected'}
          </span>
        </div>
        {players.length === 0 ? (
          <div
            style={{
              padding: 24,
              textAlign: 'center',
              color: '#3a3025',
              fontSize: 13,
            }}
          >
            Waiting for players to join...
          </div>
        ) : (
          players.map((p) => {
            const spent = playerSpent(p.id);
            const isMe = p.id === currentPlayer?.id;
            return (
              <div
                key={p.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 20px',
                  borderBottom: '1px solid #1a1410',
                  background: isMe ? '#c9a22708' : 'transparent',
                }}
              >
                <div
                  style={{
                    width: 4,
                    height: 32,
                    borderRadius: 2,
                    background: p.color,
                    flexShrink: 0,
                  }}
                />
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    flexShrink: 0,
                    background: p.is_connected ? '#2a9d8f' : '#3a3025',
                    boxShadow: p.is_connected ? '0 0 6px #2a9d8f' : 'none',
                  }}
                />
                <div style={{ flex: 1 }}>
                  <div
                    style={{ fontWeight: 600, color: '#e8d5b7', fontSize: 15 }}
                  >
                    {p.name}
                    {isMe && (
                      <span
                        style={{
                          color: '#c9a227',
                          fontSize: 11,
                          marginLeft: 6,
                        }}
                      >
                        YOU
                      </span>
                    )}
                  </div>
                  {p.studio && (
                    <div
                      style={{
                        fontSize: 11,
                        color: '#8a7f75',
                        fontStyle: 'italic',
                      }}
                    >
                      {p.studio}
                    </div>
                  )}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontWeight: 700,
                    fontSize: 15,
                    color: spent > 0 ? '#e8d5b7' : '#3a3025',
                  }}
                >
                  {'$' + (100 - spent) + ' left'}
                </div>
                {isHost && !isMe && (
                  <button
                    onClick={() => onRemovePlayer(p.id)}
                    style={{
                      background: 'transparent',
                      border: '1px solid #2a1f15',
                      borderRadius: 4,
                      color: '#3a3025',
                      fontSize: 10,
                      padding: '3px 8px',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = '#e63946';
                      e.currentTarget.style.color = '#e63946';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = '#2a1f15';
                      e.currentTarget.style.color = '#3a3025';
                    }}
                  >
                    KICK
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Movie Roster */}
      <div
        style={{
          background: 'linear-gradient(135deg, #1a1410, #0d0a07)',
          border: '1px solid #2a1f15',
          borderRadius: 12,
          overflow: 'hidden',
          marginBottom: 20,
        }}
      >
        <div
          style={{
            padding: '12px 20px',
            borderBottom: '2px solid #c9a227',
            fontFamily: 'var(--font-display)',
            fontSize: 14,
            fontWeight: 700,
            color: '#c9a227',
            letterSpacing: 2,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>MOVIE ROSTER</span>
          <span style={{ color: '#6a5f55', fontSize: 12 }}>
            {movies.length + ' movies'}
          </span>
        </div>
        {movies.length === 0 ? (
          <div
            style={{
              padding: 24,
              textAlign: 'center',
              color: '#3a3025',
              fontSize: 13,
            }}
          >
            {isHost
              ? 'Add movies to the roster below'
              : 'Host has not added movies yet'}
          </div>
        ) : (
          movies.map((m) => (
            <div
              key={m.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 20px',
                borderBottom: '1px solid #1a1410',
              }}
            >
              <div style={{ flex: 1 }}>
                <div
                  style={{ fontWeight: 600, color: '#e8d5b7', fontSize: 13 }}
                >
                  {m.mojo_slug ? (
                    <a
                      href={
                        'https://www.boxofficemojo.com/release/' +
                        m.mojo_slug +
                        '/'
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: '#e8d5b7',
                        textDecoration: 'none',
                        borderBottom: '1px dotted #6a5f55',
                      }}
                    >
                      {m.title}
                    </a>
                  ) : (
                    m.title
                  )}
                </div>
                <div style={{ fontSize: 11, color: '#8a7f75' }}>
                  {'Releases ' +
                    new Date(m.release_date).toLocaleDateString('en-US', {
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                </div>
              </div>
              {isHost && (
                <button
                  onClick={() => onRemoveMovie(m.id)}
                  style={{
                    background: 'transparent',
                    border: '1px solid #2a1f15',
                    borderRadius: 4,
                    color: '#3a3025',
                    fontSize: 10,
                    padding: '3px 8px',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#e63946';
                    e.currentTarget.style.color = '#e63946';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#2a1f15';
                    e.currentTarget.style.color = '#3a3025';
                  }}
                >
                  REMOVE
                </button>
              )}
            </div>
          ))
        )}
        {movies.length > 0 && (
          <div style={{ padding: '8px 20px', fontSize: 11, color: '#3a3025' }}>
            {movies.length + ' movies in roster'}
          </div>
        )}
      </div>

      {/* Add Movie (host only) */}
      {isHost && (
        <div style={{ marginBottom: 20 }}>
          {!showAddMovie ? (
            <button
              onClick={() => setShowAddMovie(true)}
              style={{
                width: '100%',
                padding: '14px 20px',
                background: 'linear-gradient(135deg, #1a1410, #2a1f15)',
                border: '2px dashed #3a3025',
                borderRadius: 12,
                cursor: 'pointer',
                fontFamily: 'var(--font-display)',
                fontSize: 14,
                fontWeight: 700,
                color: '#6a5f55',
                letterSpacing: 2,
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#c9a227';
                e.currentTarget.style.color = '#c9a227';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#3a3025';
                e.currentTarget.style.color = '#6a5f55';
              }}
            >
              + ADD MOVIE TO ROSTER
            </button>
          ) : (
            <div
              style={{
                background: 'linear-gradient(135deg, #1a1410, #2a1f15)',
                border: '2px solid #c9a227',
                borderRadius: 12,
                padding: 20,
              }}
            >
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 14,
                  fontWeight: 700,
                  color: '#c9a227',
                  letterSpacing: 2,
                  marginBottom: 16,
                }}
              >
                ADD MOVIE
              </div>
              <div
                style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
              >
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
                    Movie Title *
                  </label>
                  <input
                    type="text"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="e.g. Toy Story 5"
                    style={inputStyle}
                    onFocus={(e) => (e.target.style.borderColor = '#c9a227')}
                    onBlur={(e) => (e.target.style.borderColor = '#3a3025')}
                  />
                </div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 140 }}>
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
                      Release Date *
                    </label>
                    <input
                      type="date"
                      value={newRelease}
                      onChange={(e) => setNewRelease(e.target.value)}
                      style={{ ...inputStyle, colorScheme: 'dark' }}
                      onFocus={(e) => (e.target.style.borderColor = '#c9a227')}
                      onBlur={(e) => (e.target.style.borderColor = '#3a3025')}
                    />
                  </div>
                  <div style={{ flex: 2, minWidth: 200 }}>
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
                      Box Office Mojo URL (optional)
                    </label>
                    <input
                      type="text"
                      value={newMojoUrl}
                      onChange={(e) => setNewMojoUrl(e.target.value)}
                      placeholder="https://www.boxofficemojo.com/release/rl..."
                      style={inputStyle}
                      onFocus={(e) => (e.target.style.borderColor = '#c9a227')}
                      onBlur={(e) => (e.target.style.borderColor = '#3a3025')}
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={handleAddMovie}
                    disabled={!newTitle.trim() || !newRelease}
                    style={{
                      flex: 1,
                      padding: '12px',
                      background:
                        newTitle.trim() && newRelease
                          ? 'linear-gradient(135deg, #c9a227, #f4d03f)'
                          : '#2a1f15',
                      border: 'none',
                      borderRadius: 8,
                      cursor:
                        newTitle.trim() && newRelease
                          ? 'pointer'
                          : 'not-allowed',
                      fontFamily: 'var(--font-display)',
                      fontSize: 14,
                      fontWeight: 700,
                      color:
                        newTitle.trim() && newRelease ? '#0d0a07' : '#6a5f55',
                      letterSpacing: 2,
                    }}
                  >
                    ADD TO ROSTER
                  </button>
                  <button
                    onClick={() => {
                      setShowAddMovie(false);
                      setNewTitle('');
                      setNewRelease('');
                      setNewMojoUrl('');
                    }}
                    style={{
                      padding: '12px 20px',
                      background: 'transparent',
                      border: '1px solid #3a3025',
                      borderRadius: 8,
                      cursor: 'pointer',
                      color: '#6a5f55',
                      fontSize: 13,
                    }}
                  >
                    CANCEL
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Leave button */}
      <div style={{ textAlign: 'center' }}>
        <button
          onClick={onLeave}
          style={{
            padding: '8px 20px',
            background: 'transparent',
            border: '1px solid #2a1f15',
            borderRadius: 6,
            color: '#3a3025',
            fontSize: 11,
            cursor: 'pointer',
          }}
        >
          LEAVE ROOM
        </button>
      </div>
    </div>
  );
}
