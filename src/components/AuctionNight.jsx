import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { STARTING_TIME, BID_EXTENSION, BID_INCREMENTS } from '../lib/constants';
import { formatMoney } from '../lib/utils';

var AuctionTimer = function(props) {
  var timeLeft = props.timeLeft;
  var isActive = props.isActive;
  var isFinished = props.isFinished;
  var pct = STARTING_TIME > 0 ? Math.min(timeLeft / STARTING_TIME, 1) : 0;
  var urgency = timeLeft <= 3;
  var critical = timeLeft <= 2;
  var radius = 90;
  var circumference = 2 * Math.PI * radius;
  var offset = circumference * (1 - pct);
  var timerColor = critical ? '#ff1744' : urgency ? '#ff9100' : '#c9a227';
  var glowColor = critical ? 'rgba(255,23,68,0.6)' : urgency ? 'rgba(255,145,0,0.5)' : 'rgba(201,162,39,0.3)';

  return (
    <div style={{ position: 'relative', width: 200, height: 200, margin: '0 auto', flexShrink: 0 }}>
      <svg width="200" height="200" style={{ filter: 'drop-shadow(0 0 ' + (critical ? 20 : 10) + 'px ' + glowColor + ')' }}>
        <circle cx="100" cy="100" r={radius} fill="none" stroke="#2a1f15" strokeWidth="8" />
        <circle cx="100" cy="100" r={radius} fill="none"
          stroke={timerColor} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.2s linear, stroke 0.3s', transform: 'rotate(-90deg)', transformOrigin: 'center' }}
        />
      </svg>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          fontFamily: 'var(--font-display)', fontSize: isFinished ? 36 : 56, fontWeight: 900,
          color: isFinished ? '#2a9d8f' : timerColor,
          textShadow: '0 0 20px ' + glowColor, lineHeight: 1,
          animation: critical && isActive ? 'pulse 0.5s ease-in-out infinite' : 'none',
        }}>
          {isFinished ? 'SOLD' : timeLeft}
        </div>
        {!isFinished && (
          <div style={{ fontSize: 10, color: '#6a5f55', textTransform: 'uppercase', letterSpacing: 2, marginTop: 4 }}>
            {isActive ? 'seconds' : 'ready'}
          </div>
        )}
      </div>
    </div>
  );
};

export default function AuctionNight({ room, players, currentPlayer, isHost, movies, auction, results }) {
  var [selectedMovieId, setSelectedMovieId] = useState('');
  var [localBids, setLocalBids] = useState([]);
  var [localAuction, setLocalAuction] = useState(null);
  var [timeLeft, setTimeLeft] = useState(STARTING_TIME);
  var [showSold, setShowSold] = useState(false);
  var [dismissedAuctionId, setDismissedAuctionId] = useState(null);
  var [soldMovieIds, setSoldMovieIds] = useState([]);

  var pollRef = useRef(null);
  var timerRef = useRef(null);
  var localAuctionRef = useRef(null);
  var localBidsRef = useRef([]);
  var hasEndedRef = useRef(false);
  var lastBidAtRef = useRef(null);
  var expiryRef = useRef(Date.now() + STARTING_TIME * 1000);
  var bidLogRef = useRef(null);

  useEffect(function() { localAuctionRef.current = localAuction; }, [localAuction]);
  useEffect(function() { localBidsRef.current = localBids; }, [localBids]);

  var { startAuction, resetAuction } = auction;

  // ─── Helper: fetch movie data separately (avoids PostgREST 406) ───
  var fetchMovieForAuction = async function(auctionRow) {
    if (!auctionRow || !auctionRow.movie_id) return auctionRow;
    if (auctionRow.movies) return auctionRow; // already has it
    var { data: movie } = await supabase
      .from('movies')
      .select('title, release_date')
      .eq('id', auctionRow.movie_id)
      .single();
    return { ...auctionRow, movies: movie || null };
  };

  // ─── POLL for auction state and bids ──────────────────
  useEffect(function() {
    if (!room || !room.id) return;

    var poll = async function() {
      var aRes = await supabase
        .from('auctions')
        .select('*')
        .eq('room_id', room.id)
        .in('status', ['active', 'sold', 'no_sale'])
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      var aData = aRes.data;
      if (!aData) return;

      if (aData.id === dismissedAuctionId && aData.status !== 'active') return;
      if (aData.status === 'active' && aData.id !== dismissedAuctionId) {
        setDismissedAuctionId(null);
      }

      var prev = localAuctionRef.current;

      if (aData.status === 'sold' && prev && prev.status === 'active') {
        setShowSold(true);
        setTimeout(function() { setShowSold(false); }, 2500);
        setSoldMovieIds(function(p) { return p.concat([aData.movie_id]); });
      }

      // TIMER RESET: if last_bid_at changed, push expiry forward
      var newLBA = aData.last_bid_at || aData.started_at;
      if (newLBA && newLBA !== lastBidAtRef.current && aData.status === 'active') {
        lastBidAtRef.current = newLBA;
        expiryRef.current = Date.now() + STARTING_TIME * 1000;
      }

      // Fetch movie data separately if needed
      if (!prev || prev.id !== aData.id || !aData.movies) {
        aData = await fetchMovieForAuction(aData);
      } else {
        aData.movies = prev.movies;
      }

      setLocalAuction(aData);

      var bRes = await supabase
        .from('bids')
        .select('*, players(name, color)')
        .eq('auction_id', aData.id)
        .order('created_at', { ascending: false });

      if (bRes.data) setLocalBids(bRes.data);
    };

    poll();
    pollRef.current = setInterval(poll, 800);
    return function() { clearInterval(pollRef.current); };
  }, [room ? room.id : null, dismissedAuctionId]);

  // Sync new auction from host hook
  useEffect(function() {
    var ha = auction.auction;
    if (ha && (!localAuctionRef.current || ha.id !== localAuctionRef.current.id)) {
      setLocalAuction(ha);
      setLocalBids([]);
      setTimeLeft(STARTING_TIME);
      setShowSold(false);
      hasEndedRef.current = false;
      setDismissedAuctionId(null);
      lastBidAtRef.current = ha.last_bid_at || ha.started_at;
      expiryRef.current = Date.now() + STARTING_TIME * 1000;
    }
  }, [auction.auction ? auction.auction.id : null]);

  // ─── TIMER: expiry-based countdown ────────────────────
  useEffect(function() {
    if (!localAuction || localAuction.status !== 'active') {
      clearInterval(timerRef.current);
      if (localAuction && (localAuction.status === 'sold' || localAuction.status === 'no_sale')) {
        setTimeLeft(0);
      }
      return;
    }

    hasEndedRef.current = false;

    timerRef.current = setInterval(function() {
      var remaining = Math.max(0, Math.ceil((expiryRef.current - Date.now()) / 1000));
      remaining = Math.min(remaining, STARTING_TIME);
      setTimeLeft(remaining);

      // Host ends the auction when timer fully expires
      if (remaining <= 0 && !hasEndedRef.current && isHost) {
        // Check with a small buffer to prevent premature end
        var msLeft = expiryRef.current - Date.now();
        if (msLeft > -2000) return; // wait 2 extra seconds

        hasEndedRef.current = true;
        clearInterval(timerRef.current);

        var a = localAuctionRef.current;
        if (!a) return;

        var currentBids = localBidsRef.current || [];
        var finalStatus = currentBids.length > 0 ? 'sold' : 'no_sale';

        supabase
          .from('auctions')
          .update({
            status: finalStatus,
            ended_at: new Date().toISOString(),
          })
          .eq('id', a.id)
          .then(function() {
            if (finalStatus === 'sold' && currentBids.length > 0) {
              var winningBid = currentBids[0];
              supabase.from('results').insert({
                room_id: room.id,
                movie_id: a.movie_id,
                player_id: winningBid.player_id,
                bid_amount: winningBid.amount,
              })
              .select()
              .then(function(res) {
                if (res.error) console.error('Results insert failed:', res.error.message);
              });
            }
          });

        setShowSold(finalStatus === 'sold');
        if (finalStatus === 'sold') {
          setSoldMovieIds(function(p) { return p.concat([a.movie_id]); });
          setTimeout(function() { setShowSold(false); }, 2500);
        }
      }
    }, 250);

    return function() { clearInterval(timerRef.current); };
  }, [localAuction ? localAuction.id : null, localAuction ? localAuction.status : null]);

  // ─── Derived values ───────────────────────────────────
  var getRemaining = function(playerId) {
    var spent = results.filter(function(r) { return r.player_id === playerId && r.status === 'active'; })
      .reduce(function(s, r) { return s + r.bid_amount; }, 0);
    return 100 - spent;
  };

  var auctionedMovieIds = results.map(function(r) { return r.movie_id; }).concat(soldMovieIds);
  var availableMovies = movies.filter(function(m) { return !auctionedMovieIds.includes(m.id); });

  var currentHigh = localBids.length > 0 ? localBids[0] : null;
  var currentHighPlayer = currentHigh ? players.find(function(p) { return p.id === currentHigh.player_id; }) : null;
  var myRemaining = getRemaining(currentPlayer.id);
  var currentHighAmount = currentHigh ? currentHigh.amount : 0;
  var isMyHighBid = currentHigh ? currentHigh.player_id === currentPlayer.id : false;

  var isActive = localAuction ? localAuction.status === 'active' : false;
  var isFinished = localAuction ? (localAuction.status === 'sold' || localAuction.status === 'no_sale') : false;
  var activeAuction = localAuction;

  // ─── Actions ──────────────────────────────────────────
  var handleBid = async function(increment) {
    var amount = currentHighAmount + increment;
    if (amount > myRemaining) return;

    var a = localAuctionRef.current;
    if (!a || !a.id || a.status !== 'active') return;

    var now = new Date().toISOString();

    // Update last_bid_at and insert bid in parallel
    await Promise.all([
      supabase.from('auctions').update({ last_bid_at: now }).eq('id', a.id),
      supabase.from('bids').insert({
        auction_id: a.id,
        player_id: currentPlayer.id,
        amount: amount,
      }),
    ]);

    // Reset local timer immediately
    expiryRef.current = Date.now() + STARTING_TIME * 1000;
    hasEndedRef.current = false;

    // Immediate refetch (no movies join)
    var [aRes, bRes] = await Promise.all([
      supabase.from('auctions').select('*').eq('id', a.id).single(),
      supabase.from('bids').select('*, players(name, color)').eq('auction_id', a.id).order('created_at', { ascending: false }),
    ]);

    if (aRes.data) {
      aRes.data.movies = localAuctionRef.current ? localAuctionRef.current.movies : null;
      setLocalAuction(aRes.data);
    }
    if (bRes.data) setLocalBids(bRes.data);
  };

  var handleStartAuction = function() {
    if (!selectedMovieId) return;
    hasEndedRef.current = false;
    setDismissedAuctionId(null);
    startAuction(selectedMovieId);
    setSelectedMovieId('');
  };

  var handleEndEarly = async function() {
    var a = localAuctionRef.current;
    if (!a) return;
    clearInterval(timerRef.current);
    hasEndedRef.current = true;

    var currentBids = localBidsRef.current || [];
    var finalStatus = currentBids.length > 0 ? 'sold' : 'no_sale';

    await supabase.from('auctions').update({
      status: finalStatus,
      ended_at: new Date().toISOString(),
    }).eq('id', a.id);

    if (finalStatus === 'sold' && currentBids.length > 0) {
      var winningBid = currentBids[0];
      await supabase.from('results').insert({
        room_id: room.id,
        movie_id: a.movie_id,
        player_id: winningBid.player_id,
        bid_amount: winningBid.amount,
      });
    }

    setShowSold(finalStatus === 'sold');
    if (finalStatus === 'sold') {
      setSoldMovieIds(function(p) { return p.concat([a.movie_id]); });
      setTimeout(function() { setShowSold(false); }, 2500);
    }
  };

  var confirmSale = function() {
    setDismissedAuctionId(localAuction ? localAuction.id : null);
    setLocalAuction(null);
    setLocalBids([]);
    setTimeLeft(STARTING_TIME);
    setShowSold(false);
    hasEndedRef.current = false;
    lastBidAtRef.current = null;
    resetAuction();
  };

  var handleReset = function() {
    setDismissedAuctionId(localAuction ? localAuction.id : null);
    setLocalAuction(null);
    setLocalBids([]);
    setTimeLeft(STARTING_TIME);
    setShowSold(false);
    hasEndedRef.current = false;
    lastBidAtRef.current = null;
    resetAuction();
  };

  // ─── Bid history from localBids ───────────────────────
  var bidHistory = localBids.map(function(b) {
    return {
      player: b.players ? b.players.name : 'Unknown',
      color: b.players ? b.players.color : '#666',
      amount: b.amount,
      time: b.created_at,
    };
  });

  // ─── RENDER ───────────────────────────────────────────
  return (
    <div style={{ paddingTop: 20, maxWidth: 800, margin: '0 auto' }}>

      {/* SOLD flash overlay */}
      {showSold && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.75)', zIndex: 100,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          animation: 'fadeIn 0.2s', pointerEvents: 'none',
        }}>
          <div style={{
            fontFamily: 'var(--font-display)', fontSize: 'clamp(60px, 15vw, 120px)',
            fontWeight: 900, color: '#c9a227',
            textShadow: '0 0 60px rgba(201,162,39,0.8)',
            animation: 'soldBounce 0.6s ease-out',
          }}>
            SOLD!
          </div>
          {currentHigh && (
            <div style={{
              fontFamily: 'var(--font-display)', fontSize: 'clamp(16px, 3vw, 24px)',
              color: '#fff', marginTop: 10, textAlign: 'center', padding: '0 20px',
              animation: 'soldBounce 0.6s ease-out 0.2s both',
            }}>
              {(activeAuction && activeAuction.movies ? activeAuction.movies.title : 'Movie') + ' → '}
              <span style={{ color: currentHighPlayer ? currentHighPlayer.color : '#fff' }}>{currentHighPlayer ? currentHighPlayer.name : ''}</span>
              {' for '}
              <span style={{ color: '#c9a227' }}>{'$' + currentHigh.amount}</span>
            </div>
          )}
        </div>
      )}

      {/* Pre-auction: Host selects movie */}
      {!isActive && !isFinished && (
        <div style={{
          background: 'linear-gradient(135deg, #1a1410, #2a1f15)',
          border: '1px solid #3a3025', borderRadius: 12, padding: 24, marginBottom: 20,
        }}>
          {isHost ? (
            <>
              <div style={{
                fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700,
                color: '#c9a227', marginBottom: 16, textAlign: 'center', letterSpacing: 2,
              }}>
                SELECT NEXT MOVIE
              </div>
              {availableMovies.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#6a5f55', fontSize: 14 }}>
                  All movies have been auctioned!
                </div>
              ) : (
                <>
                  <select value={selectedMovieId} onChange={function(e) { setSelectedMovieId(e.target.value); }}
                    style={{
                      width: '100%', padding: '12px 16px', background: '#0d0a07',
                      border: '1px solid #3a3025', borderRadius: 8, color: '#e8d5b7',
                      fontSize: 15, marginBottom: 12, outline: 'none',
                    }}>
                    <option value="">Choose a movie...</option>
                    {availableMovies.map(function(m) {
                      return (
                        <option key={m.id} value={m.id}>
                          {m.title + ' (' + new Date(m.release_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ')'}
                        </option>
                      );
                    })}
                  </select>
                  <button onClick={handleStartAuction} disabled={!selectedMovieId}
                    style={{
                      width: '100%', padding: '14px',
                      background: selectedMovieId ? 'linear-gradient(135deg, #c9a227, #f4d03f)' : '#2a1f15',
                      border: 'none', borderRadius: 8,
                      cursor: selectedMovieId ? 'pointer' : 'not-allowed',
                      fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 900,
                      color: selectedMovieId ? '#0d0a07' : '#6a5f55', letterSpacing: 3,
                    }}>
                    START BIDDING
                  </button>
                </>
              )}
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: 20 }}>
              <div style={{
                fontFamily: 'var(--font-display)', fontSize: 20, color: '#6a5f55',
              }}>
                Waiting for host to start next auction...
              </div>
              <div style={{ fontSize: 12, color: '#3a3025', marginTop: 8 }}>
                {availableMovies.length + ' movies remaining'}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Active auction / finished state */}
      {(isActive || isFinished) && activeAuction && (
        <div style={{
          background: 'linear-gradient(135deg, #1a1410, #0d0a07)',
          border: '2px solid ' + (isFinished ? '#2a9d8f' : timeLeft <= 3 ? '#ff1744' : '#c9a227'),
          borderRadius: 16, padding: 20, marginBottom: 20,
        }}>
          {/* Movie title */}
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <div style={{
              fontFamily: 'var(--font-display)', fontSize: 'clamp(18px, 4vw, 28px)',
              fontWeight: 900, color: '#e8d5b7', letterSpacing: 2,
            }}>
              {activeAuction.movies ? activeAuction.movies.title : 'Loading...'}
            </div>
            {activeAuction.movies && activeAuction.movies.release_date && (
              <div style={{ fontSize: 12, color: '#6a5f55', marginTop: 4 }}>
                {'Release: ' + new Date(activeAuction.movies.release_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </div>
            )}
          </div>

          {/* Timer + Current Bid */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 30, flexWrap: 'wrap' }}>
            <AuctionTimer timeLeft={timeLeft} isActive={isActive} isFinished={isFinished} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#6a5f55', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 4 }}>
                {currentHigh ? 'HIGH BID' : 'NO BIDS YET'}
              </div>
              {currentHigh && (
                <>
                  <div style={{
                    fontFamily: 'var(--font-display)', fontSize: 48, fontWeight: 900, color: '#c9a227',
                  }}>
                    {'$' + currentHigh.amount}
                  </div>
                  <div style={{
                    fontSize: 16, fontWeight: 700,
                    color: currentHighPlayer ? currentHighPlayer.color : '#e8d5b7',
                  }}>
                    {currentHighPlayer ? currentHighPlayer.name : 'Unknown'}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Bid buttons (only during active auction) */}
          {isActive && !isMyHighBid && (
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 16, flexWrap: 'wrap' }}>
              {BID_INCREMENTS.map(function(inc) {
                var bidAmount = currentHighAmount + inc;
                var canAfford = bidAmount <= myRemaining;
                return (
                  <button key={inc}
                    onClick={function() { handleBid(inc); }}
                    disabled={!canAfford}
                    style={{
                      padding: '14px 24px',
                      background: canAfford ? 'linear-gradient(135deg, #c9a227, #f4d03f)' : '#2a1f15',
                      border: 'none', borderRadius: 8,
                      cursor: canAfford ? 'pointer' : 'not-allowed',
                      fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 900,
                      color: canAfford ? '#0d0a07' : '#6a5f55', letterSpacing: 1,
                      opacity: canAfford ? 1 : 0.4,
                      minWidth: 80,
                    }}>
                    {'$' + bidAmount}
                  </button>
                );
              })}
            </div>
          )}
          {isActive && isMyHighBid && (
            <div style={{ textAlign: 'center', marginTop: 16, color: '#c9a227', fontWeight: 700, fontSize: 14 }}>
              YOU ARE THE HIGH BIDDER
            </div>
          )}

          {/* Host: End Early button */}
          {isActive && isHost && (
            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <button onClick={handleEndEarly} style={{
                padding: '8px 20px', background: 'transparent',
                border: '1px solid #3a3025', borderRadius: 6, cursor: 'pointer',
                fontSize: 12, color: '#6a5f55', letterSpacing: 1,
              }}>
                END EARLY
              </button>
            </div>
          )}

          {/* Finished actions (host) */}
          {isFinished && isHost && (
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 16 }}>
              {currentHigh && (
                <button onClick={confirmSale} style={{
                  padding: '12px 32px',
                  background: 'linear-gradient(135deg, #2a9d8f, #3dccbb)',
                  border: 'none', borderRadius: 8, cursor: 'pointer',
                  fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700,
                  color: '#0d0a07', letterSpacing: 2, textTransform: 'uppercase',
                }}>
                  {'✓ CONFIRM SALE'}
                </button>
              )}
              <button onClick={handleReset} style={{
                padding: '12px 32px',
                background: 'transparent', border: '1px solid #3a3025', borderRadius: 8,
                cursor: 'pointer', fontFamily: 'var(--font-display)',
                fontSize: 14, color: '#6a5f55', letterSpacing: 2,
              }}>
                {currentHigh ? 'UNDO / RESTART' : 'NO SALE — NEXT MOVIE'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Bottom panels: Bid History + Player Budgets */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Bid History Log */}
        <div style={{
          background: 'linear-gradient(135deg, #1a1410, #0d0a07)',
          border: '1px solid #2a1f15', borderRadius: 12, overflow: 'hidden',
        }}>
          <div style={{
            padding: '10px 16px', borderBottom: '2px solid #c9a227',
            fontFamily: 'var(--font-display)', fontSize: 13,
            fontWeight: 700, color: '#c9a227', letterSpacing: 2,
          }}>
            BID HISTORY
          </div>
          <div ref={bidLogRef} style={{ maxHeight: 240, overflowY: 'auto' }}>
            {bidHistory.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#3a3025', fontSize: 13 }}>
                Waiting for first bid...
              </div>
            ) : (
              bidHistory.map(function(b, i) {
                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px',
                    borderBottom: '1px solid #1a1410',
                    background: i === 0 ? 'rgba(201,162,39,0.05)' : 'transparent',
                  }}>
                    <div style={{ width: 4, height: 20, borderRadius: 2, background: b.color, flexShrink: 0 }} />
                    <div style={{ flex: 1, fontWeight: i === 0 ? 700 : 400, color: i === 0 ? '#e8d5b7' : '#6a5f55', fontSize: 13 }}>
                      {b.player}
                    </div>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, color: i === 0 ? '#c9a227' : '#6a5f55', fontSize: 14 }}>
                      {'$' + b.amount}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Player Budgets */}
        <div style={{
          background: 'linear-gradient(135deg, #1a1410, #0d0a07)',
          border: '1px solid #2a1f15', borderRadius: 12, overflow: 'hidden',
        }}>
          <div style={{
            padding: '10px 16px', borderBottom: '2px solid #c9a227',
            fontFamily: 'var(--font-display)', fontSize: 13,
            fontWeight: 700, color: '#c9a227', letterSpacing: 2,
          }}>
            PLAYER BUDGETS
          </div>
          <div>
            {players.map(function(p) {
              var remaining = getRemaining(p.id);
              return (
                <div key={p.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px',
                  borderBottom: '1px solid #1a1410',
                }}>
                  <div style={{ width: 4, height: 20, borderRadius: 2, background: p.color, flexShrink: 0 }} />
                  <div style={{ flex: 1, fontWeight: 600, color: '#e8d5b7', fontSize: 13 }}>{p.name}</div>
                  <div style={{
                    fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 14,
                    color: remaining > 50 ? '#e8d5b7' : remaining > 5 ? '#ff9100' : '#e63946',
                    minWidth: 40, textAlign: 'right',
                  }}>{'$' + remaining}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Sold tonight */}
      {results.length > 0 && (
        <div style={{
          marginTop: 20, background: 'linear-gradient(135deg, #1a1410, #0d0a07)',
          border: '1px solid #2a1f15', borderRadius: 12, overflow: 'hidden',
        }}>
          <div style={{
            padding: '10px 16px', borderBottom: '2px solid #c9a227',
            fontFamily: 'var(--font-display)', fontSize: 13,
            fontWeight: 700, color: '#c9a227', letterSpacing: 2,
          }}>
            {'SOLD TONIGHT — ' + results.length + ' MOVIE' + (results.length !== 1 ? 'S' : '')}
          </div>
          <div>
            {results.map(function(r) {
              var p = players.find(function(pl) { return pl.id === r.player_id; });
              return (
                <div key={r.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
                  borderBottom: '1px solid #1a1410',
                }}>
                  <div style={{ width: 4, height: 28, borderRadius: 2, background: p ? p.color : '#555', flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, color: '#e8d5b7', fontSize: 13 }}>{r.movies ? r.movies.title : 'Movie'}</div>
                    <div style={{ fontSize: 11, color: p ? p.color : '#6a5f55', fontWeight: 600 }}>{p ? p.name : ''}</div>
                  </div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, color: '#c9a227', fontSize: 16 }}>
                    {'$' + r.bid_amount}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
