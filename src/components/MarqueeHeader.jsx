import { useState, useEffect } from 'react';

export default function MarqueeHeader({ compact = false, subtitle = null }) {
  const [bulbPhase, setBulbPhase] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setBulbPhase((p) => (p + 1) % 3), 600);
    return () => clearInterval(iv);
  }, []);
  const bulbs = Array.from({ length: 60 });

  return (
    <div
      style={{
        position: 'relative',
        background:
          'linear-gradient(180deg, #1a0a0a 0%, #2d0a0a 50%, #1a0a0a 100%)',
        padding: compact ? '12px 40px' : '20px 40px',
        textAlign: 'center',
        borderBottom: '4px solid #c9a227',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'space-around',
          padding: '0 10px',
        }}
      >
        {bulbs.map((_, i) => (
          <div
            key={'t' + i}
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: i % 3 === bulbPhase ? '#ffe066' : '#553300',
              boxShadow:
                i % 3 === bulbPhase
                  ? '0 0 6px #ffe066, 0 0 12px #ffa500'
                  : 'none',
              transition: 'all 0.3s',
              marginTop: 4,
            }}
          />
        ))}
      </div>
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'space-around',
          padding: '0 10px',
        }}
      >
        {bulbs.map((_, i) => (
          <div
            key={'b' + i}
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: (i + 1) % 3 === bulbPhase ? '#ffe066' : '#553300',
              boxShadow:
                (i + 1) % 3 === bulbPhase
                  ? '0 0 6px #ffe066, 0 0 12px #ffa500'
                  : 'none',
              transition: 'all 0.3s',
              marginBottom: 4,
            }}
          />
        ))}
      </div>
      {!compact && (
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 14,
            letterSpacing: 8,
            color: '#c9a227',
            textTransform: 'uppercase',
            marginBottom: 4,
          }}
        >
          {'★ The Annual ★'}
        </div>
      )}
      <h1
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: compact
            ? 'clamp(20px, 4vw, 32px)'
            : 'clamp(28px, 5vw, 52px)',
          fontWeight: 900,
          color: '#fff',
          textShadow:
            '0 0 20px rgba(201,162,39,0.5), 0 2px 4px rgba(0,0,0,0.8)',
          margin: '4px 0',
          letterSpacing: 3,
          lineHeight: 1.1,
        }}
      >
        {'SUMMER MOVIE '}
        <span
          style={{
            color: '#c9a227',
            textShadow:
              '0 0 30px rgba(201,162,39,0.6), 0 2px 4px rgba(0,0,0,0.8)',
          }}
        >
          AUCTION
        </span>
      </h1>
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: compact ? 12 : 16,
          color: '#c9a227',
          letterSpacing: 6,
          marginTop: 4,
        }}
      >
        {subtitle || '— 2026 SEASON —'}
      </div>
    </div>
  );
}
