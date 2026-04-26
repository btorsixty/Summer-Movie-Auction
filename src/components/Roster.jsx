import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { taxedDomestic } from '../lib/utils';

var OMDB_KEY = 'f26360dc';
var SEASON_START = '2026-05-01';

function extractImdbId(slug) {
  if (!slug) return null;
  var match = slug.match(/(tt\d{7,})/);
  return match ? match[1] : null;
}

function getImdbUrl(slug) {
  var id = extractImdbId(slug);
  return id ? 'https://www.imdb.com/title/' + id + '/' : null;
}

function fmt(n) {
  if (!n || n === 0) return '$0';
  if (n >= 1000000) return '$' + (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1000) return '$' + (n / 1000).toFixed(0) + 'K';
  return '$' + n.toLocaleString();
}

function getCurrentWeekWindow() {
  var now = new Date();
  var day = now.getDay();
  var diffToMon = day === 0 ? -6 : 1 - day;
  var monday = new Date(now);
  monday.setDate(now.getDate() + diffToMon);
  monday.setHours(0, 0, 0, 0);
  var sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { monday: monday, sunday: sunday };
}

// ─── Poster Frame (Now Playing marquee) ─────────────────────
function PosterFrame({ movie, omdbData }) {
  var poster = omdbData ? omdbData.Poster : null;
  var hasPoster = poster && poster !== 'N/A';
  var releaseStr = new Date(movie.release_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  var imdbUrl = getImdbUrl(movie.mojo_slug);

  var frame = (
    <div style={{ flex: '0 0 auto', width: 160, textAlign: 'center', animation: 'fadeSlideUp 0.6s ease-out both' }}>
      <div style={{
        background: '#0d0a07', border: '3px solid #c9a227', borderRadius: 4, padding: 6,
        boxShadow: '0 0 20px rgba(201,162,39,0.15), inset 0 0 30px rgba(0,0,0,0.5)', position: 'relative',
      }}>
        <div style={{ border: '1px solid rgba(201,162,39,0.3)', borderRadius: 2, overflow: 'hidden', background: '#1a1410' }}>
          {hasPoster ? (
            <img src={poster} alt={movie.title} style={{ width: '100%', height: 220, objectFit: 'cover', display: 'block' }} />
          ) : (
            <div style={{ width: '100%', height: 220, background: 'linear-gradient(180deg, #2a1f15, #0d0a07)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, color: '#6a5f55', textAlign: 'center', lineHeight: 1.3 }}>{movie.title}</div>
            </div>
          )}
        </div>
      </div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700, color: '#e8d5b7', marginTop: 8, lineHeight: 1.3 }}>{movie.title}</div>
      <div style={{ fontSize: 10, color: '#6a5f55', marginTop: 2 }}>{releaseStr}</div>
    </div>
  );

  return imdbUrl
    ? <a href={imdbUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>{frame}</a>
    : frame;
}

// ─── Earnings Chart ─────────────────────────────────────────
function EarningsChart({ weeklyData, players }) {
  var W = 700, H = 300;
  var PAD = { top: 30, right: 20, bottom: 40, left: 60 };
  var chartW = W - PAD.left - PAD.right;
  var chartH = H - PAD.top - PAD.bottom;

  // Build week axis from May 1 through now
  var seasonStart = new Date(SEASON_START + 'T00:00:00');
  var now = new Date();
  var allWeeks = [];
  var cursor = new Date(seasonStart);
  while (cursor <= now) {
    allWeeks.push({
      label: cursor.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      key: cursor.toISOString().split('T')[0],
    });
    cursor.setDate(cursor.getDate() + 7);
  }
  if (allWeeks.length === 0) {
    allWeeks.push({ label: seasonStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), key: SEASON_START });
  }

  var weeklyMap = {};
  if (weeklyData) {
    weeklyData.forEach(function(wd) { weeklyMap[wd.week_label] = wd.players; });
  }

  var maxVal = 0;
  allWeeks.forEach(function(w) {
    var wp = weeklyMap[w.label] || {};
    players.forEach(function(p) { var v = wp[p.id] || 0; if (v > maxVal) maxVal = v; });
  });

  if (maxVal === 0) maxVal = 1000000;
  var niceMax = Math.ceil(maxVal / 1000000) * 1000000 || 1000000;
  var xStep = allWeeks.length > 1 ? chartW / (allWeeks.length - 1) : chartW;

  var playerLines = {};
  players.forEach(function(p) {
    playerLines[p.id] = allWeeks.map(function(w) { return (weeklyMap[w.label] || {})[p.id] || 0; });
  });

  return (
    <div style={{ background: 'linear-gradient(135deg, #1a1410, #0d0a07)', border: '1px solid #2a1f15', borderRadius: 12, padding: 20, overflowX: 'auto' }}>
      <svg width={W} height={H} viewBox={'0 0 ' + W + ' ' + H} style={{ display: 'block', margin: '0 auto' }}>
        {[0, 0.25, 0.5, 0.75, 1].map(function(pct) {
          var y = PAD.top + chartH * (1 - pct);
          return (
            <g key={pct}>
              <line x1={PAD.left} y1={y} x2={PAD.left + chartW} y2={y} stroke="#2a1f15" strokeWidth="1" strokeDasharray="4,4" />
              <text x={PAD.left - 8} y={y + 4} fill="#6a5f55" fontSize="10" textAnchor="end" fontFamily="'Lato', sans-serif">{fmt(niceMax * pct)}</text>
            </g>
          );
        })}
        {allWeeks.map(function(w, i) {
          var x = PAD.left + (allWeeks.length > 1 ? i * xStep : 0);
          var show = allWeeks.length <= 12 || i % Math.ceil(allWeeks.length / 12) === 0;
          return show ? <text key={i} x={x} y={H - 8} fill="#6a5f55" fontSize="9" textAnchor="middle" fontFamily="'Lato', sans-serif">{w.label}</text> : null;
        })}
        <line x1={PAD.left} y1={PAD.top + chartH} x2={PAD.left + chartW} y2={PAD.top + chartH} stroke="#3a3025" strokeWidth="1" />
        <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + chartH} stroke="#3a3025" strokeWidth="1" />
        {players.map(function(p) {
          var pts = playerLines[p.id];
          if (!pts || pts.length === 0) return null;
          var lastNZ = 0;
          pts.forEach(function(v, i) { if (v > 0) lastNZ = i; });
          var pathD = pts.slice(0, lastNZ + 1).map(function(val, i) {
            var x = PAD.left + (allWeeks.length > 1 ? i * xStep : 0);
            var y = PAD.top + chartH * (1 - val / niceMax);
            return (i === 0 ? 'M' : 'L') + x + ',' + y;
          }).join(' ');
          if (pathD.length < 3) return null;
          var li = Math.min(lastNZ, pts.length - 1);
          var lx = PAD.left + (allWeeks.length > 1 ? li * xStep : 0);
          var ly = PAD.top + chartH * (1 - pts[li] / niceMax);
          return (
            <g key={p.id}>
              <path d={pathD} fill="none" stroke={p.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 0 4px ' + p.color + '40)' }} />
              <circle cx={lx} cy={ly} r="4" fill={p.color} stroke="#0d0a07" strokeWidth="2" />
            </g>
          );
        })}
      </svg>
      {/* Legend below chart */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 16, flexWrap: 'wrap', marginTop: 12 }}>
        {players.map(function(p) {
          return (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 12, height: 3, borderRadius: 2, background: p.color }} />
              <span style={{ fontSize: 11, color: p.color, fontWeight: 600 }}>{p.name}</span>
            </div>
          );
        })}
      </div>
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
  var [expandedStudios, setExpandedStudios] = useState({});
  var fetchedRef = useRef(false);

  var toggleStudio = function(playerId) {
    setExpandedStudios(function(prev) {
      var next = {};
      Object.keys(prev).forEach(function(k) { next[k] = prev[k]; });
      next[playerId] = !prev[playerId];
      return next;
    });
  };

  // ─── Fetch OMDB data ──────────────────────────────────────
  useEffect(function() {
    if (fetchedRef.current) return;
    if (!movies || movies.length === 0) { setLoading(false); return; }
    fetchedRef.current = true;

    var movieIds = {};
    movies.forEach(function(m) {
      if (m.mojo_slug) { var id = extractImdbId(m.mojo_slug); if (id) movieIds[m.id] = id; }
    });
    if (results) {
      results.forEach(function(r) {
        if (r.movies && r.movies.mojo_slug && !movieIds[r.movie_id]) {
          var id = extractImdbId(r.movies.mojo_slug); if (id) movieIds[r.movie_id] = id;
        }
      });
    }

    var entries = Object.entries(movieIds);
    if (entries.length === 0) { setLoading(false); return; }

    console.log('Fetching OMDB for', entries.length, 'movies');
    var cache = {};
    Promise.all(entries.map(function(entry) {
      var movieId = entry[0], imdbId = entry[1];
      return fetch('https://www.omdbapi.com/?i=' + imdbId + '&apikey=' + OMDB_KEY)
        .then(function(r) { return r.json(); })
        .then(function(data) {
          console.log('OMDB:', imdbId, data.Title, 'Box:', data.BoxOffice, 'Poster:', data.Poster);
          if (data.Response === 'True') {
            cache[movieId] = data;
            var bo = data.BoxOffice;
            if (bo && bo !== 'N/A') {
              var gross = parseInt(bo.replace(/[$,]/g, ''), 10);
              if (gross > 0) {
                supabase.from('movies').update({ domestic_gross: gross, last_scraped_at: new Date().toISOString() }).eq('id', movieId).select().then(function() {});
              }
            }
          } else { console.warn('OMDB error:', imdbId, data.Error); }
        }).catch(function(e) { console.error('OMDB fail:', imdbId, e); });
    })).then(function() { setOmdbCache(cache); setLoading(false); });
  }, [results, movies]);

  // ─── Auto-snapshot weekly grosses ─────────────────────────
  var snapshotRef = useRef(false);
  useEffect(function() {
    if (!room || !room.id || loading || snapshotRef.current) return;
    if (!results || results.length === 0) return;
    snapshotRef.current = true;

    var now = new Date(), day = now.getDay(), diff = day === 0 ? -6 : 1 - day;
    var mon = new Date(now); mon.setDate(now.getDate() + diff);
    var weekStart = mon.toISOString().split('T')[0];

    var rows = results.map(function(r) {
      var omdb = omdbCache[r.movie_id]; var gross = 0;
      if (omdb && omdb.BoxOffice && omdb.BoxOffice !== 'N/A') gross = parseInt(omdb.BoxOffice.replace(/[$,]/g, ''), 10) || 0;
      else if (r.movies && r.movies.domestic_gross) gross = r.movies.domestic_gross;
      return { room_id: room.id, movie_id: r.movie_id, player_id: r.player_id, week_start: weekStart, cumulative_gross: gross };
    });

    var p = rows.length > 0
      ? supabase.from('weekly_grosses').upsert(rows, { onConflict: 'room_id,movie_id,week_start' }).select().then(function(r) { if (r.error) console.error('Snapshot err:', r.error.message); })
      : Promise.resolve();

    p.then(function() {
      return supabase.from('weekly_grosses').select('*').eq('room_id', room.id).order('week_start');
    }).then(function(res) {
      if (res.data && res.data.length > 0) {
        var weeks = [], wm = {};
        res.data.forEach(function(row) {
          if (!wm[row.week_start]) {
            wm[row.week_start] = { week_label: new Date(row.week_start + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), players: {} };
            weeks.push(wm[row.week_start]);
          }
          wm[row.week_start].players[row.player_id] = (wm[row.week_start].players[row.player_id] || 0) + row.cumulative_gross;
        });
        setWeeklyData(weeks);
      }
    });
  }, [room ? room.id : null, loading, omdbCache]);

  // ─── Derived data ─────────────────────────────────────────
  var playerRosters = useMemo(function() {
    return players.map(function(p) {
      var pr = results.filter(function(r) { return r.player_id === p.id; });
      var ml = pr.map(function(r) {
        var md = r.movies || movies.find(function(m) { return m.id === r.movie_id; }) || {};
        var omdb = omdbCache[r.movie_id]; var gross = 0;
        if (omdb && omdb.BoxOffice && omdb.BoxOffice !== 'N/A') gross = parseInt(omdb.BoxOffice.replace(/[$,]/g, ''), 10) || 0;
        else if (md.domestic_gross) gross = md.domestic_gross;
        return { id: r.movie_id, title: md.title || 'Unknown', release_date: md.release_date, mojo_slug: md.mojo_slug || null, bid: r.bid_amount, gross: gross, taxedGross: taxedDomestic(gross), roi: r.bid_amount > 0 ? gross / r.bid_amount : 0, poster: omdb ? omdb.Poster : null, omdb: omdb };
      }).sort(function(a, b) { return new Date(a.release_date) - new Date(b.release_date); });
      var ts = ml.reduce(function(s, m) { return s + m.bid; }, 0);
      var tg = ml.reduce(function(s, m) { return s + m.gross; }, 0);
      var ttg = ml.reduce(function(s, m) { return s + m.taxedGross; }, 0);
      return { player: p, movies: ml, totalSpent: ts, totalGross: tg, totalTaxedGross: ttg };
    }).sort(function(a, b) { return b.totalTaxedGross - a.totalTaxedGross; });
  }, [players, results, movies, omdbCache]);

  var nowPlayingMovies = useMemo(function() {
    var win = getCurrentWeekWindow();
    var aids = results.map(function(r) { return r.movie_id; });
    var tw = movies.filter(function(m) { if (!aids.includes(m.id)) return false; var rd = new Date(m.release_date); return rd >= win.monday && rd <= win.sunday; });
    if (tw.length === 0) {
      var now = new Date();
      var up = movies.filter(function(m) { return aids.includes(m.id) && new Date(m.release_date) > now; }).sort(function(a, b) { return new Date(a.release_date) - new Date(b.release_date); });
      if (up.length > 0) { var nd = up[0].release_date; tw = up.filter(function(m) { return m.release_date === nd; }); }
      else { tw = movies.filter(function(m) { return aids.includes(m.id) && new Date(m.release_date) <= now; }).sort(function(a, b) { return new Date(b.release_date) - new Date(a.release_date); }).slice(0, 4); }
    }
    return tw;
  }, [movies, results]);

  var nowPlayingLabel = useMemo(function() {
    if (nowPlayingMovies.length === 0) return 'NOW PLAYING';
    return new Date(nowPlayingMovies[0].release_date) > new Date() ? 'COMING SOON' : 'NOW PLAYING';
  }, [nowPlayingMovies]);

  var topEarners = useMemo(function() {
    var all = [];
    playerRosters.forEach(function(pr) { pr.movies.forEach(function(m) { if (m.gross > 0) all.push({ title: m.title, bid: m.bid, gross: m.gross, roi: m.roi, player: pr.player, poster: m.poster, mojo_slug: m.mojo_slug }); }); });
    return all.sort(function(a, b) { return b.roi - a.roi; }).slice(0, 5);
  }, [playerRosters]);

  if (loading) {
    return (<div style={{ padding: 40, textAlign: 'center' }}><div style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: '#c9a227', animation: 'pulse 1.5s ease-in-out infinite' }}>Loading box office data...</div></div>);
  }

  return (
    <div style={{ paddingTop: 20, maxWidth: 900, margin: '0 auto' }}>

      {/* ─── NOW PLAYING / COMING SOON ───────────────────── */}
      {nowPlayingMovies.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <div style={{ display: 'inline-block', padding: '6px 24px', background: 'linear-gradient(135deg, #c9a227, #f4d03f)', borderRadius: 4, fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 900, color: '#0d0a07', letterSpacing: 4 }}>
              {'★ ' + nowPlayingLabel + ' ★'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 20, justifyContent: 'center', flexWrap: 'wrap', padding: '0 10px' }}>
            {nowPlayingMovies.map(function(m) { return <PosterFrame key={m.id} movie={m} omdbData={omdbCache[m.id]} />; })}
          </div>
        </div>
      )}

      {/* ─── TOP EARNERS ─────────────────────────────────── */}
      {topEarners.length > 0 && (
        <div style={{ background: 'linear-gradient(135deg, #1a1410, #0d0a07)', border: '1px solid #2a1f15', borderRadius: 12, overflow: 'hidden', marginBottom: 24 }}>
          <div style={{ padding: '12px 20px', borderBottom: '2px solid #c9a227', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, color: '#c9a227', letterSpacing: 2, textAlign: 'center' }}>
            TOP EARNERS — BEST VALUE PER AUCTION DOLLAR
          </div>
          {topEarners.map(function(m, i) {
            var url = getImdbUrl(m.mojo_slug);
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', borderBottom: '1px solid #1a1410', background: i === 0 ? 'rgba(201,162,39,0.05)' : 'transparent' }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: i === 0 ? 'linear-gradient(135deg, #c9a227, #f4d03f)' : '#2a1f15', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 13, color: i === 0 ? '#0d0a07' : '#6a5f55', flexShrink: 0 }}>{i + 1}</div>
                {m.poster && m.poster !== 'N/A' && <img src={m.poster} alt="" style={{ width: 32, height: 48, objectFit: 'cover', borderRadius: 3, border: '1px solid #2a1f15', flexShrink: 0 }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {url ? <a href={url} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 700, color: '#e8d5b7', fontSize: 14, textDecoration: 'none', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.title}</a>
                    : <div style={{ fontWeight: 700, color: '#e8d5b7', fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.title}</div>}
                  <div style={{ fontSize: 11, color: m.player.color, fontWeight: 600 }}>{m.player.name + ' • Bid $' + m.bid}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 16, color: '#c9a227' }}>{fmt(m.gross)}</div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: m.roi >= 1000000 ? '#2a9d8f' : '#6a5f55' }}>{(m.roi / 1000000).toFixed(1) + 'M per $1'}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── PLAYER STUDIO CARDS (collapsible) ───────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 24 }}>
        {playerRosters.map(function(pr, rank) {
          var isExp = expandedStudios[pr.player.id] !== false;
          return (
            <div key={pr.player.id} style={{ background: 'linear-gradient(135deg, #1a1410, #0d0a07)', border: '1px solid ' + (rank === 0 ? '#c9a227' : '#2a1f15'), borderRadius: 12, overflow: 'hidden', boxShadow: rank === 0 ? '0 0 20px rgba(201,162,39,0.1)' : 'none' }}>
              <div onClick={function() { toggleStudio(pr.player.id); }}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', borderBottom: isExp ? '2px solid ' + pr.player.color : 'none', background: 'linear-gradient(135deg, ' + pr.player.color + '10, transparent)', cursor: 'pointer', userSelect: 'none' }}>
                <div style={{ width: 6, height: 32, borderRadius: 3, background: pr.player.color, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 900, color: '#e8d5b7', letterSpacing: 1 }}>{pr.player.studio || pr.player.name + "'s Studio"}</div>
                  <div style={{ fontSize: 11, color: pr.player.color, fontWeight: 600 }}>{pr.player.name + ' • ' + pr.movies.length + ' movie' + (pr.movies.length !== 1 ? 's' : '')}</div>
                </div>
                <div style={{ textAlign: 'right', marginRight: 8 }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 22, color: '#c9a227' }}>{fmt(pr.totalTaxedGross)}</div>
                  <div style={{ fontSize: 10, color: '#6a5f55' }}>{'$' + pr.totalSpent + ' spent' + (pr.totalGross !== pr.totalTaxedGross ? ' • Raw: ' + fmt(pr.totalGross) : '')}</div>
                </div>
                <div style={{ color: '#6a5f55', fontSize: 18, flexShrink: 0, transform: isExp ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▼</div>
              </div>
              {isExp && (
                <div>
                  {pr.movies.map(function(m) {
                    var released = new Date(m.release_date) <= new Date();
                    var url = getImdbUrl(m.mojo_slug);
                    var hp = m.poster && m.poster !== 'N/A';
                    return (
                      <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px', borderBottom: '1px solid #1a1410' }}>
                        {hp ? <img src={m.poster} alt="" style={{ width: 28, height: 42, objectFit: 'cover', borderRadius: 3, border: '1px solid #2a1f15', flexShrink: 0 }} />
                          : <div style={{ width: 28, height: 42, borderRadius: 3, flexShrink: 0, background: '#2a1f15', border: '1px solid #3a3025' }} />}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {url ? <a href={url} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 600, color: released ? '#e8d5b7' : '#6a5f55', fontSize: 13, textDecoration: 'none', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.title}</a>
                            : <div style={{ fontWeight: 600, color: released ? '#e8d5b7' : '#6a5f55', fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.title}</div>}
                          <div style={{ fontSize: 10, color: '#6a5f55' }}>{new Date(m.release_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}{!released && ' • Upcoming'}</div>
                        </div>
                        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13, color: '#8a7f75', minWidth: 40, textAlign: 'center' }}>{'$' + m.bid}</div>
                        <div style={{ textAlign: 'right', minWidth: 70 }}>
                          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 14, color: m.gross > 0 ? '#c9a227' : '#3a3025' }}>{m.taxedGross > 0 ? fmt(m.taxedGross) : (m.gross > 0 ? fmt(m.gross) : '—')}</div>
                          {m.gross > 0 && m.taxedGross < m.gross && <div style={{ fontSize: 9, color: '#6a5f55' }}>{'Raw: ' + fmt(m.gross)}</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ─── EARNINGS CHART ──────────────────────────────── */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ textAlign: 'center', marginBottom: 12, fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, color: '#c9a227', letterSpacing: 2 }}>EARNINGS OVER TIME</div>
        <EarningsChart weeklyData={weeklyData} players={players} />
      </div>

      <style>{'\
        @keyframes fadeSlideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }\
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }\
      '}</style>
    </div>
  );
}
