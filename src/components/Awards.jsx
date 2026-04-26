import { useMemo } from 'react';

function fmt(n) {
  if (!n || n === 0) return '$0';
  if (n >= 1000000) return '$' + (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1000) return '$' + (n / 1000).toFixed(0) + 'K';
  return '$' + n.toLocaleString();
}

export default function Awards({ players, results, movies }) {
  // Build enriched movie list with player info
  var enriched = useMemo(function() {
    if (!results || results.length === 0) return [];
    return results.map(function(r) {
      var movie = r.movies || movies.find(function(m) { return m.id === r.movie_id; }) || {};
      var player = players.find(function(p) { return p.id === r.player_id; }) || {};
      var gross = movie.domestic_gross || 0;
      return {
        title: movie.title || 'Unknown',
        gross: gross,
        bid: r.bid_amount,
        roi: r.bid_amount > 0 ? gross / r.bid_amount : 0,
        player: player,
      };
    });
  }, [results, movies, players]);

  var released = enriched.filter(function(m) { return m.gross > 0; });

  // Compute superlatives
  var bestValue = released.length > 0
    ? released.slice().sort(function(a, b) { return b.roi - a.roi; })[0]
    : null;

  var biggestBust = released.filter(function(m) { return m.bid >= 5; }).length > 0
    ? released.filter(function(m) { return m.bid >= 5; }).slice().sort(function(a, b) { return a.roi - b.roi; })[0]
    : null;

  var sleeper = enriched.filter(function(m) { return m.bid <= 5 && m.gross > 0; }).length > 0
    ? enriched.filter(function(m) { return m.bid <= 5 && m.gross > 0; }).slice().sort(function(a, b) { return b.gross - a.gross; })[0]
    : null;

  var topGrosser = released.length > 0
    ? released.slice().sort(function(a, b) { return b.gross - a.gross; })[0]
    : null;

  var awards = [
    {
      icon: '💎', title: 'Best Value',
      desc: 'Highest domestic gross per auction dollar spent',
      winner: bestValue,
      stat: bestValue ? (bestValue.roi / 1000000).toFixed(1) + 'M per $1' : null,
    },
    {
      icon: '💀', title: 'Biggest Bust',
      desc: 'Worst return on a bid of $5 or more',
      winner: biggestBust,
      stat: biggestBust ? fmt(biggestBust.gross) + ' on a $' + biggestBust.bid + ' bid' : null,
    },
    {
      icon: '🌙', title: 'Sleeper of the Summer',
      desc: 'Highest-grossing movie bid at $5 or less',
      winner: sleeper,
      stat: sleeper ? fmt(sleeper.gross) + ' on a $' + sleeper.bid + ' bid' : null,
    },
    {
      icon: '👑', title: 'Top Grosser',
      desc: 'Single movie with the highest raw domestic gross',
      winner: topGrosser,
      stat: topGrosser ? fmt(topGrosser.gross) : null,
    },
  ];

  var hasAnyWinner = awards.some(function(a) { return a.winner; });

  var pastChampions = [
    { year: 2025, winner: 'Dom Marotto' },
  ];

  return (
    <div style={{ paddingTop: 20, maxWidth: 800, margin: '0 auto' }}>

      {/* Page title */}
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <div style={{
          fontFamily: 'var(--font-display)', fontSize: 'clamp(24px, 5vw, 36px)',
          fontWeight: 900, color: '#c9a227',
          textShadow: '0 0 20px rgba(201,162,39,0.3)',
        }}>
          Awards & Superlatives
        </div>
        <div style={{
          fontSize: 11, color: '#6a5f55', marginTop: 6, letterSpacing: 3,
          fontFamily: 'var(--font-display)', textTransform: 'uppercase',
        }}>
          {hasAnyWinner ? '2026 Season' : 'Awards unlock as movies report earnings'}
        </div>
      </div>

      {/* Award tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, marginBottom: 32 }}>
        {awards.map(function(award, i) {
          var hasWinner = award.winner != null;
          return (
            <div key={i} style={{
              background: 'linear-gradient(135deg, #1a1410, #0d0a07)',
              border: '1px solid ' + (hasWinner ? '#c9a227' : '#2a1f15'),
              borderRadius: 12, overflow: 'hidden',
              boxShadow: hasWinner ? '0 0 20px rgba(201,162,39,0.1)' : 'none',
              position: 'relative',
            }}>
              {/* Header */}
              <div style={{
                padding: '14px 20px',
                borderBottom: '2px solid ' + (hasWinner ? '#c9a227' : '#2a1f15'),
                display: 'flex', alignItems: 'center', gap: 12,
                background: hasWinner ? 'linear-gradient(135deg, #c9a22710, transparent)' : 'transparent',
              }}>
                <div style={{ fontSize: 28 }}>{award.icon}</div>
                <div>
                  <div style={{
                    fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 900,
                    color: hasWinner ? '#c9a227' : '#6a5f55', letterSpacing: 1,
                  }}>
                    {award.title}
                  </div>
                  <div style={{ fontSize: 11, color: '#6a5f55', marginTop: 2 }}>{award.desc}</div>
                </div>
              </div>

              {/* Content */}
              <div style={{ padding: '16px 20px' }}>
                {hasWinner ? (
                  <div>
                    <div style={{
                      fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 900,
                      color: '#e8d5b7', marginBottom: 4,
                    }}>
                      {award.winner.title}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <div style={{
                        width: 4, height: 16, borderRadius: 2,
                        background: award.winner.player.color || '#6a5f55',
                      }} />
                      <span style={{
                        fontSize: 13, fontWeight: 600,
                        color: award.winner.player.color || '#6a5f55',
                      }}>
                        {award.winner.player.name || 'Unknown'}
                      </span>
                    </div>
                    <div style={{
                      fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700,
                      color: '#c9a227',
                    }}>
                      {award.stat}
                    </div>
                  </div>
                ) : (
                  <div style={{
                    textAlign: 'center', padding: '12px 0',
                    color: '#3a3025', fontSize: 13, fontStyle: 'italic',
                  }}>
                    Awaiting results...
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Past Champions */}
      <div style={{
        background: 'linear-gradient(135deg, #1a1410, #0d0a07)',
        border: '1px solid #2a1f15', borderRadius: 12, overflow: 'hidden',
        marginBottom: 32,
      }}>
        <div style={{
          padding: '14px 24px',
          borderBottom: '2px solid #c9a227',
          fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 900,
          color: '#c9a227', letterSpacing: 3, textTransform: 'uppercase',
          textAlign: 'center',
        }}>
          Hall of Champions
        </div>
        {pastChampions.map(function(champ, i) {
          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 16, padding: '16px 24px',
              borderBottom: '1px solid #1a1410',
            }}>
              <div style={{
                fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 900,
                color: '#3a3025',
              }}>
                {champ.year}
              </div>
              <div style={{
                width: 2, height: 32, background: '#c9a227', borderRadius: 1,
              }} />
              <div>
                <div style={{
                  fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 900,
                  color: '#e8d5b7',
                }}>
                  {champ.winner}
                </div>
                <div style={{ fontSize: 11, color: '#c9a227', letterSpacing: 2, fontWeight: 600 }}>
                  CHAMPION
                </div>
              </div>
              <div style={{ fontSize: 28, marginLeft: 8 }}>🏆</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
