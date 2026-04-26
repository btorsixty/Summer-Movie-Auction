import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';

var OMDB_KEY = 'f26360dc';

// ─── Helper: extract IMDb tt ID from a URL or raw ID ────────
function extractImdbId(slug) {
  if (!slug) return null;
  var match = slug.match(/(tt\d{7,})/);
  return match ? match[1] : null;
}

// ─── Helper: format currency ────────────────────────────────
function fmt(n) {
  if (!n || n === 0) return '$0';
  if (n >= 1000000) return '$' + (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1000) return '$' + (n / 1000).toFixed(0) + 'K';
  return '$' + n.toLocaleString();
}

function fmtFull(n) {
  if (!n || n === 0) return '$0';
  return '$' + n.toLocaleString();
}

// ─── Helper: get current week's release window (Mon–Sun) ────
function getCurrentWeekWindow() {
  var now = new Date();
  var day = now.getDay(); // 0=Sun
  var diffToMon = day === 0 ? -6 : 1 - day;
  var monday = new Date(now);
  monday.setDate(now.getDate() + diffToMon);
  monday.setHours(0, 0, 0, 0);
  var sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { monday: monday, sunday: sunday };
}

// ─── Poster Frame Component ────────────────────────────────
function PosterFrame({ movie, omdbData }) {
  var poster = omdbData ? omdbData.Poster : null;
  var hasPoster = poster && poster !== 'N/A';
  var releaseStr = new Date(movie.release_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <div style={{
      flex: '0 0 auto', width: 160, textAlign: 'center',
      animation: 'fadeSlideUp 0.6s ease-out both',
    }}>
      {/* Frame */}
      <div style={{
        background: '#0d0a07',
        border: '3px solid #c9a227',
        borderRadius: 4,
        padding: 6,
        boxShadow: '0 0 20px rgba(201,162,39,0.15), inset 0 0 30px rgba(0,0,0,0.5)',
        position: 'relative',
      }}>
        {/* Inner gold border */}
        <div style={{
          border: '1px solid rgba(201,162,39,0.3)',
          borderRadius: 2,
          overflow: 'hidden',
          background: '#1a1410',
        }}>
          {hasPoster ? (
            <img src={poster} alt={movie.title}
              style={{ width: '100%', height: 220, objectFit: 'cover', display: 'block' }}
            />
          ) : (
            <div style={{
              width: '100%', height: 220,
              background: 'linear-gradient(180deg, #2a1f15, #0d0a07)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 12,
            }}>
              <div style={{
                fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700,
                color: '#6a5f55', textAlign: 'center', lineHeight: 1.3,
              }}>
                {movie.title}
              </div>
            </div>
          )}
        </div>
        {/* Corner ornaments */}
        {['top-left', 'top-right', 'bottom-left', 'bottom-right'].map(function(corner) {
          var isTop = corner.includes('top');
          var isLeft = corner.includes('left');
          return (
            <div key={corner} style={{
              position: 'absolute',
              [isTop ? 'top' : 'bottom']: 2,
              [isLeft ? 'left' : 'right']: 2,
              width: 8, height: 8,
              borderTop: isTop ? '1px solid #c9a227' : 'none',
              borderBottom: isTop ? 'none' : '1px solid #c9a227',
              borderLeft: isLeft ? '1px solid #c9a227' : 'none',
              borderRight: isLeft ? 'none' : '1px solid #c9a227',
            }} />
          );
        })}
      </div>
      {/* Title below frame */}
      <div style={{
        fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700,
        color: '#e8d5b7', marginTop: 8, lineHeight: 1.3,
      }}>
        {movie.title}
      </div>
      <div style={{ fontSize: 10, color: '#6a5f55', marginTop: 2 }}>
        {releaseStr}
      </div>
    </div>
  );
}

// ─── Simple SVG Line Chart ──────────────────────────────────
function EarningsChart({ weeklyData, players }) {
  var W = 700;
  var H = 300;
  var PAD = { top: 30, right: 20, bottom: 40, left: 60 };
  var chartW = W - PAD.left - PAD.right;
  var chartH = H - PAD.top - PAD.bottom;

  if (!weeklyData || weeklyData.length === 0) {
    return (
      <div style={{
        background: 'linear-gradient(135deg, #1a1410, #0d0a07)',
        border: '1px solid #2a1f15', borderRadius: 12, padding: 40,
        textAlign: 'center', color: '#3a3025', fontSize: 14,
      }}>
        Earnings data will appear here once movies start reporting box office numbers.
      </div>
    );
  }

  var weeks = weeklyData.map(function(w) { return w.week_label; });
  var maxVal = 0;
  var playerLines = {};

  players.forEach(function(p) {
    playerLines[p.id] = [];
  });

  weeklyData.forEach(function(weekData, wi) {
    players.forEach(function(p) {
      var cumulative = weekData.players[p.id] || 0;
      playerLines[p.id].push(cumulative);
      if (cumulative > maxVal) maxVal = cumulative;
    });
  });

  if (maxVal === 0) maxVal = 1;
  // Round up to nice number
  var niceMax = Math.ceil(maxVal / 1000000) * 1000000;
  if (niceMax === 0) niceMax = maxVal;

  var xStep = weeks.length > 1 ? chartW / (weeks.length - 1) : chartW;

  return (
    <div style={{
      background: 'linear-gradient(135deg, #1a1410, #0d0a07)',
      border: '1px solid #2a1f15', borderRadius: 12, padding: 20,
      overflowX: 'auto',
    }}>
      <svg width={W} height={H} viewBox={'0 0 ' + W + ' ' + H} style={{ display: 'block', margin: '0 auto' }}>
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map(function(pct) {
          var y = PAD.top + chartH * (1 - pct);
          var val = niceMax * pct;
          return (
            <g key={pct}>
              <line x1={PAD.left} y1={y} x2={PAD.left + chartW} y2={y}
                stroke="#2a1f15" strokeWidth="1" strokeDasharray="4,4"
              />
              <text x={PAD.left - 8} y={y + 4}
                fill="#6a5f55" fontSize="10" textAnchor="end"
                fontFamily="'Lato', sans-serif"
              >
                {fmt(val)}
              </text>
            </g>
          );
        })}

        {/* Week labels */}
        {weeks.map(function(label, i) {
          var x = PAD.left + (weeks.length > 1 ? i * xStep : chartW / 2);
          return (
            <text key={i} x={x} y={H - 8}
              fill="#6a5f55" fontSize="9" textAnchor="middle"
              fontFamily="'Lato', sans-serif"
            >
              {label}
            </text>
          );
        })}

        {/* Player lines */}
        {players.map(function(p) {
          var points = playerLines[p.id];
          if (!points || points.length === 0) return null;

          var pathD = points.map(function(val, i) {
            var x = PAD.left + (weeks.length > 1 ? i * xStep : chartW / 2);
            var y = PAD.top + chartH * (1 - val / niceMax);
            return (i === 0 ? 'M' : 'L') + x + ',' + y;
          }).join(' ');

          var lastX = PAD.left + (weeks.length > 1 ? (points.length - 1) * xStep : chartW / 2);
          var lastY = PAD.top + chartH * (1 - points[points.length - 1] / niceMax);

          return (
            <g key={p.id}>
              <path d={pathD} fill="none" stroke={p.color} strokeWidth="2.5"
                strokeLinecap="round" strokeLinejoin="round"
                style={{ filter: 'drop-shadow(0 0 4px ' + p.color + '40)' }}
              />
              {/* Dot on last point */}
              <circle cx={lastX} cy={lastY} r="4" fill={p.color}
                stroke="#0d0a07" strokeWidth="2"
              />
              {/* Label */}
              <text x={lastX + 8} y={lastY + 4}
                fill={p.color} fontSize="10" fontWeight="700"
                fontFamily="'Lato', sans-serif"
              >
                {p.name}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MAIN ROSTER COMPONENT
// ═══════════════════════════════════════════════════════════
export default function Roster({ room, players, results, movies }) {
  var [omdbCache, setOmdbCache] = useState({});
  var [loading, setLoading] = useState(true);
  var [weeklyData, setWeeklyData] = useState([]);
  var fetchedRef = useRef(false);

  // ─── Fetch OMDB data for all auctioned movies ─────────────
  useEffect(function() {
    if (fetchedRef.current || !results || results.length === 0) {
      setLoading(false);
      return;
    }

    fetchedRef.current = true;
    var movieIds = {};

    // Collect unique movies from results
    results.forEach(function(r) {
      if (r.movies && r.movies.mojo_slug) {
        var imdbId = extractImdbId(r.movies.mojo_slug);
        if (imdbId) movieIds[r.movie_id] = imdbId;
      }
    });

    // Also check movies list directly
    movies.forEach(function(m) {
      if (m.mojo_slug && !movieIds[m.id]) {
        var imdbId = extractImdbId(m.mojo_slug);
        if (imdbId) movieIds[m.id] = imdbId;
      }
    });

    var entries = Object.entries(movieIds);
    if (entries.length === 0) {
      setLoading(false);
      return;
    }

    var cache = {};
    var promises = entries.map(function(entry) {
      var movieId = entry[0];
      var imdbId = entry[1];
      return fetch('https://www.omdbapi.com/?i=' + imdbId + '&apikey=' + OMDB_KEY)
        .then(function(res) { return res.json(); })
        .then(function(data) {
          if (data.Response === 'True') {
            cache[movieId] = data;
            // Parse box office and update Supabase
            var boxOffice = data.BoxOffice;
            if (boxOffice && boxOffice !== 'N/A') {
              var gross = parseInt(boxOffice.replace(/[$,]/g, ''), 10);
              if (gross > 0) {
                supabase.from('movies')
                  .update({ domestic_gross: gross, last_scraped_at: new Date().toISOString() })
                  .eq('id', movieId)
                  .select()
                  .then(function() {});
              }
            }
          }
        })
        .catch(function() {});
    });

    Promise.all(promises).then(function() {
      setOmdbCache(cache);
      setLoading(false);
    });
  }, [results, movies]);

  // ─── Auto-snapshot & fetch weekly grosses ───────────────────
  // On every page load, after OMDB data is fetched:
  //   1. Calculate current Monday as the week_start
  //   2. Check if a snapshot exists for this week
  //   3. If not, upsert one for each auctioned movie with current gross
  //   4. Fetch all weekly snapshots for the chart
  var snapshotRef = useRef(false);

  useEffect(function() {
    if (!room || !room.id || loading || snapshotRef.current) return;
    if (!results || results.length === 0) return;

    snapshotRef.current = true;

    // Get Monday of current week as YYYY-MM-DD
    var now = new Date();
    var day = now.getDay();
    var diffToMon = day === 0 ? -6 : 1 - day;
    var monday = new Date(now);
    monday.setDate(now.getDate() + diffToMon);
    var weekStart = monday.toISOString().split('T')[0];

    // Build snapshot rows from current OMDB data
    var snapshotRows = [];
    results.forEach(function(r) {
      var omdb = omdbCache[r.movie_id];
      var gross = 0;
      if (omdb && omdb.BoxOffice && omdb.BoxOffice !== 'N/A') {
        gross = parseInt(omdb.BoxOffice.replace(/[$,]/g, ''), 10) || 0;
      } else if (r.movies && r.movies.domestic_gross) {
        gross = r.movies.domestic_gross;
      }
      snapshotRows.push({
        room_id: room.id,
        movie_id: r.movie_id,
        player_id: r.player_id,
        week_start: weekStart,
        cumulative_gross: gross,
      });
    });

    // Upsert snapshots (unique index on room_id + movie_id + week_start
    // handles dedup — repeated page loads just update the gross)
    var upsertPromise = snapshotRows.length > 0
      ? supabase.from('weekly_grosses')
          .upsert(snapshotRows, { onConflict: 'room_id,movie_id,week_start' })
          .select()
          .then(function(res) {
            if (res.error) console.error('Weekly snapshot error:', res.error.message);
          })
      : Promise.resolve();

    // After upsert, fetch all weekly data for the chart
    upsertPromise.then(function() {
      return supabase
        .from('weekly_grosses')
        .select('*')
        .eq('room_id', room.id)
        .order('week_start');
    }).then(function(res) {
      if (res.data && res.data.length > 0) {
        // Group by week, sum per player
        var weeks = [];
        var weekMap = {};
        res.data.forEach(function(row) {
          if (!weekMap[row.week_start]) {
            weekMap[row.week_start] = {
              week_label: new Date(row.week_start + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
              players: {},
            };
            weeks.push(weekMap[row.week_start]);
          }
          weekMap[row.week_start].players[row.player_id] =
            (weekMap[row.week_start].players[row.player_id] || 0) + row.cumulative_gross;
        });
        setWeeklyData(weeks);
      }
    });
  }, [room ? room.id : null, loading, omdbCache]);

  // ─── Derived data ─────────────────────────────────────────
  var playerRosters = useMemo(function() {
    return players.map(function(p) {
      var playerResults = results.filter(function(r) { return r.player_id === p.id; });
      var movieList = playerResults.map(function(r) {
        var movieData = r.movies || movies.find(function(m) { return m.id === r.movie_id; }) || {};
        var omdb = omdbCache[r.movie_id];
        var gross = 0;
        if (omdb && omdb.BoxOffice && omdb.BoxOffice !== 'N/A') {
          gross = parseInt(omdb.BoxOffice.replace(/[$,]/g, ''), 10) || 0;
        } else if (movieData.domestic_gross) {
          gross = movieData.domestic_gross;
        }
        return {
          id: r.movie_id,
          title: movieData.title || 'Unknown',
          release_date: movieData.release_date,
          bid: r.bid_amount,
          gross: gross,
          roi: r.bid_amount > 0 ? gross / r.bid_amount : 0,
          poster: omdb ? omdb.Poster : null,
          omdb: omdb,
        };
      }).sort(function(a, b) {
        return new Date(a.release_date) - new Date(b.release_date);
      });

      var totalSpent = movieList.reduce(function(s, m) { return s + m.bid; }, 0);
      var totalGross = movieList.reduce(function(s, m) { return s + m.gross; }, 0);

      return {
        player: p,
        movies: movieList,
        totalSpent: totalSpent,
        totalGross: totalGross,
        avgRoi: totalSpent > 0 ? totalGross / totalSpent : 0,
      };
    }).sort(function(a, b) { return b.totalGross - a.totalGross; });
  }, [players, results, movies, omdbCache]);

  // ─── This week's releases ─────────────────────────────────
  var thisWeekMovies = useMemo(function() {
    var window = getCurrentWeekWindow();
    var auctionedMovieIds = results.map(function(r) { return r.movie_id; });

    // Get movies releasing this week that were auctioned
    var thisWeek = movies.filter(function(m) {
      if (!auctionedMovieIds.includes(m.id)) return false;
      var rd = new Date(m.release_date);
      return rd >= window.monday && rd <= window.sunday;
    });

    // If no movies this week, show the most recent released movies
    if (thisWeek.length === 0) {
      var now = new Date();
      var pastMovies = movies
        .filter(function(m) {
          return auctionedMovieIds.includes(m.id) && new Date(m.release_date) <= now;
        })
        .sort(function(a, b) { return new Date(b.release_date) - new Date(a.release_date); });
      thisWeek = pastMovies.slice(0, 4);
    }

    return thisWeek;
  }, [movies, results]);

  // ─── Top earners by ROI ───────────────────────────────────
  var topEarners = useMemo(function() {
    var allMovies = [];
    playerRosters.forEach(function(pr) {
      pr.movies.forEach(function(m) {
        if (m.gross > 0) {
          allMovies.push({
            title: m.title,
            bid: m.bid,
            gross: m.gross,
            roi: m.roi,
            player: pr.player,
            poster: m.poster,
          });
        }
      });
    });
    return allMovies.sort(function(a, b) { return b.roi - a.roi; }).slice(0, 5);
  }, [playerRosters]);

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <div style={{
          fontFamily: 'var(--font-display)', fontSize: 18, color: '#c9a227',
          animation: 'pulse 1.5s ease-in-out infinite',
        }}>
          Loading box office data...
        </div>
      </div>
    );
  }

  // ═════════════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════════════
  return (
    <div style={{ paddingTop: 20, maxWidth: 900, margin: '0 auto' }}>

      {/* ─── NOW PLAYING MARQUEE ─────────────────────────── */}
      {thisWeekMovies.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <div style={{
            textAlign: 'center', marginBottom: 16,
          }}>
            <div style={{
              display: 'inline-block', padding: '6px 24px',
              background: 'linear-gradient(135deg, #c9a227, #f4d03f)',
              borderRadius: 4,
              fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 900,
              color: '#0d0a07', letterSpacing: 4, textTransform: 'uppercase',
            }}>
              {"★ NOW PLAYING ★"}
            </div>
          </div>
          <div style={{
            display: 'flex', gap: 20, justifyContent: 'center',
            flexWrap: 'wrap', padding: '0 10px',
          }}>
            {thisWeekMovies.map(function(m) {
              return <PosterFrame key={m.id} movie={m} omdbData={omdbCache[m.id]} />;
            })}
          </div>
        </div>
      )}

      {/* ─── TOP EARNERS (ROI) ───────────────────────────── */}
      {topEarners.length > 0 && (
        <div style={{
          background: 'linear-gradient(135deg, #1a1410, #0d0a07)',
          border: '1px solid #2a1f15', borderRadius: 12,
          overflow: 'hidden', marginBottom: 24,
        }}>
          <div style={{
            padding: '12px 20px', borderBottom: '2px solid #c9a227',
            fontFamily: 'var(--font-display)', fontSize: 13,
            fontWeight: 700, color: '#c9a227', letterSpacing: 2,
            textAlign: 'center',
          }}>
            TOP EARNERS — BEST VALUE PER AUCTION DOLLAR
          </div>
          {topEarners.map(function(m, i) {
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px',
                borderBottom: '1px solid #1a1410',
                background: i === 0 ? 'rgba(201,162,39,0.05)' : 'transparent',
              }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: i === 0 ? 'linear-gradient(135deg, #c9a227, #f4d03f)' : '#2a1f15',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 13,
                  color: i === 0 ? '#0d0a07' : '#6a5f55', flexShrink: 0,
                }}>
                  {i + 1}
                </div>
                {m.poster && m.poster !== 'N/A' && (
                  <img src={m.poster} alt="" style={{
                    width: 32, height: 48, objectFit: 'cover', borderRadius: 3,
                    border: '1px solid #2a1f15', flexShrink: 0,
                  }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: '#e8d5b7', fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {m.title}
                  </div>
                  <div style={{ fontSize: 11, color: m.player.color, fontWeight: 600 }}>
                    {m.player.name + ' • Bid $' + m.bid}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{
                    fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 16,
                    color: '#c9a227',
                  }}>
                    {fmt(m.gross)}
                  </div>
                  <div style={{
                    fontSize: 10, fontWeight: 700,
                    color: m.roi >= 1000000 ? '#2a9d8f' : '#6a5f55',
                  }}>
                    {(m.roi / 1000000).toFixed(1) + 'M per $1'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── PLAYER STUDIO CARDS ─────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 24 }}>
        {playerRosters.map(function(pr, rank) {
          return (
            <div key={pr.player.id} style={{
              background: 'linear-gradient(135deg, #1a1410, #0d0a07)',
              border: '1px solid ' + (rank === 0 ? '#c9a227' : '#2a1f15'),
              borderRadius: 12, overflow: 'hidden',
              boxShadow: rank === 0 ? '0 0 20px rgba(201,162,39,0.1)' : 'none',
            }}>
              {/* Studio header */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px',
                borderBottom: '2px solid ' + pr.player.color,
                background: 'linear-gradient(135deg, ' + pr.player.color + '10, transparent)',
              }}>
                <div style={{
                  width: 6, height: 32, borderRadius: 3, background: pr.player.color, flexShrink: 0,
                }} />
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 900,
                    color: '#e8d5b7', letterSpacing: 1,
                  }}>
                    {pr.player.studio || pr.player.name + "'s Studio"}
                  </div>
                  <div style={{ fontSize: 11, color: pr.player.color, fontWeight: 600 }}>
                    {pr.player.name + ' • ' + pr.movies.length + ' movie' + (pr.movies.length !== 1 ? 's' : '')}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{
                    fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 22, color: '#c9a227',
                  }}>
                    {fmt(pr.totalGross)}
                  </div>
                  <div style={{ fontSize: 10, color: '#6a5f55' }}>
                    {'$' + pr.totalSpent + ' spent'}
                  </div>
                </div>
              </div>

              {/* Movie list */}
              <div>
                {pr.movies.map(function(m) {
                  var released = new Date(m.release_date) <= new Date();
                  return (
                    <div key={m.id} style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px',
                      borderBottom: '1px solid #1a1410',
                    }}>
                      {/* Mini poster */}
                      {m.poster && m.poster !== 'N/A' ? (
                        <img src={m.poster} alt="" style={{
                          width: 28, height: 42, objectFit: 'cover', borderRadius: 3,
                          border: '1px solid #2a1f15', flexShrink: 0,
                        }} />
                      ) : (
                        <div style={{
                          width: 28, height: 42, borderRadius: 3, flexShrink: 0,
                          background: '#2a1f15', border: '1px solid #3a3025',
                        }} />
                      )}
                      {/* Movie info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontWeight: 600, color: released ? '#e8d5b7' : '#6a5f55',
                          fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                          {m.title}
                        </div>
                        <div style={{ fontSize: 10, color: '#6a5f55' }}>
                          {new Date(m.release_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          {!released && ' • Upcoming'}
                        </div>
                      </div>
                      {/* Bid */}
                      <div style={{
                        fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13,
                        color: '#8a7f75', minWidth: 40, textAlign: 'center',
                      }}>
                        {'$' + m.bid}
                      </div>
                      {/* Gross */}
                      <div style={{
                        fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 14,
                        color: m.gross > 0 ? '#c9a227' : '#3a3025',
                        minWidth: 70, textAlign: 'right',
                      }}>
                        {m.gross > 0 ? fmt(m.gross) : '—'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* ─── EARNINGS CHART ──────────────────────────────── */}
      <div style={{ marginBottom: 32 }}>
        <div style={{
          textAlign: 'center', marginBottom: 12,
          fontFamily: 'var(--font-display)', fontSize: 14,
          fontWeight: 700, color: '#c9a227', letterSpacing: 2,
        }}>
          EARNINGS OVER TIME
        </div>
        <EarningsChart weeklyData={weeklyData} players={players} />
      </div>

      {/* ─── CSS Animations ──────────────────────────────── */}
      <style>{'\
        @keyframes fadeSlideUp {\
          from { opacity: 0; transform: translateY(20px); }\
          to { opacity: 1; transform: translateY(0); }\
        }\
        @keyframes pulse {\
          0%, 100% { opacity: 1; }\
          50% { opacity: 0.5; }\
        }\
      '}</style>
    </div>
  );
}
