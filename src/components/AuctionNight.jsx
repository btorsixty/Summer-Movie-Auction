import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { STARTING_TIME, BID_EXTENSION, BID_INCREMENTS } from '../lib/constants';
import { formatMoney } from '../lib/utils';

const AuctionTimer = ({ timeLeft, isActive, isFinished }) => {
  const pct = STARTING_TIME > 0 ? Math.min(timeLeft / STARTING_TIME, 1) : 0;
  const urgency = timeLeft <= 3;
  const critical = timeLeft <= 2;
  const radius = 90;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct);
  const timerColor = critical ? '#ff1744' : urgency ? '#ff9100' : '#c9a227';
  const glowColor = critical ? 'rgba(255,23,68,0.6)' : urgency ? 'rgba(255,145,0,0.5)' : 'rgba(201,162,39,0.3)';

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
  const [selectedMovieId, setSelectedMovieId] = useState('');
  const [localBids, setLocalBids] = useState([]);
  const [localAuction, setLocalAuction] = useState(null);
  const [timeLeft, setTimeLeft] = useState(STARTING_TIME);
  const [showSold, setShowSold] = useState(false);
  const [dismissedAuctionId, setDismissedAuctionId] = useState(null);
  const [soldMovieIds, setSoldMovieIds] = useState([]);

  const pollRef = useRef(null);
  const timerRef = useRef(null);
  const hasEndedRef = useRef(false);
  const lastBidAtRef = useRef(null);
  const timeLeftRef = useRef(STARTING_TIME);

  // Keep timeLeft ref in sync
  useEffect(() => { timeLeftRef.current = timeLeft; }, [timeLeft]);

  const { startAuction, resetAuction } = auction;

  // ─── POLL for auction state and bids ───────────────────
  useEffect(() => {
    if (!room?.id) return;

    const poll = async () => {
      const { data: aData } = await supabase
        .from('auctions')
        .select('*, movies(title, release_date)')
        .eq('room_id', room.id)
        .in('status', ['active', 'sold', 'no_sale'])
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (aData) {
        if (aData.id === dismissedAuctionId && aData.status !== 'active') {
          return;
        }
        if (aData.status === 'active' && aData.id !== dismissedAuctionId) {
          setDismissedAuctionId(null);
        }

        const prevStatus = localAuction?.status;

        if (aData.status === 'sold' && prevStatus === 'active') {
          setShowSold(true);
          setTimeout(() => setShowSold(false), 2500);
          setSoldMovieIds(function(prev) { return prev.concat([aData.movie_id]); });
        }

        // TIMER RESET: if last_bid_at changed, reset the countdown
        const newLastBidAt = aData.last_bid_at || aData.started_at;
        if (newLastBidAt !== lastBidAtRef.current && aData.status === 'active') {
          lastBidAtRef.current = newLastBidAt;
          setTimeLeft(STARTING_TIME);
        }

        setLocalAuction(aData);

        const { data: bData } = await supabase
          .from('bids')
          .select('*, players(name, color)')
          .eq('auction_id', aData.id)
          .order('created_at', { ascending: false });

        if (bData) {
          setLocalBids(bData);
        }
      }
    };

    poll();
    pollRef.current = setInterval(poll, 800);

    return () => clearInterval(pollRef.current);
  }, [room?.id, dismissedAuctionId]);

  // Sync when host starts a new auction
  useEffect(() => {
    const hookAuction = auction.auction;
    if (hookAuction && (!localAuction || hookAuction.id !== localAuction.id)) {
      setLocalAuction(hookAuction);
      setLocalBids([]);
      setTimeLeft(STARTING_TIME);
      setShowSold(false);
      hasEndedRef.current = false;
      setDismissedAuctionId(null);
      lastBidAtRef.current = hookAuction.last_bid_at || hookAuction.started_at;
    }
  }, [auction.auction?.id]);

  // ─── TIMER: simple 1-second countdown ──────────────────
  // This just counts down from whatever timeLeft is.
  // The poll resets timeLeft to STARTING_TIME when it detects a new bid.
  // When it hits 0, the host ends the auction.
  useEffect(() => {
    if (!localAuction || localAuction.status !== 'active') {
      clearInterval(timerRef.current);
      if (localAuction?.status === 'sold' || localAuction?.status === 'no_sale') {
        setTimeLeft(0);
      }
      return;
    }

    hasEndedRef.current = false;

    timerRef.current = setInterval(() => {
      setTimeLeft(function(prev) {
        var next = prev - 1;
        if (next < 0) next = 0;
        return next;
      });
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [localAuction?.id, localAuction?.status]);

  // ─── END AUCTION when timer hits 0 (host only) ────────
  useEffect(() => {
    if (!isHost) return;
    if (!localAuction || localAuction.status !== 'active') return;
    if (timeLeft > 0) return;
    if (hasEndedRef.current) return;

    // Timer just hit 0 — verify with a fresh DB read before ending
    var auctionId = localAuction.id;
    var movieId = localAuction.movie_id;

    // Small delay to let any in-flight bid updates land
    var endTimeout = setTimeout(async function() {
      if (hasEndedRef.current) return;

      // Fresh read from DB
      var freshRes = await supabase
        .from('auctions')
        .select('last_bid_at, started_at, status')
        .eq('id', auctionId)
        .single();

      if (!freshRes.data || freshRes.data.status !== 'active') return;
      if (hasEndedRef.current) return;

      var freshLastEvent = freshRes.data.last_bid_at || freshRes.data.started_at;
      var freshElapsed = (Date.now() - new Date(freshLastEvent).getTime()) / 1000;

      // If fresh data shows less than STARTING_TIME elapsed, a bid came in — don't end
      if (freshElapsed < STARTING_TIME) {
        lastBidAtRef.current = freshLastEvent;
        setTimeLeft(Math.max(1, Math.ceil(STARTING_TIME - freshElapsed)));
        return;
      }

      hasEndedRef.current = true;
      clearInterval(timerRef.current);

      var currentBids = localBids;
      var finalStatus = currentBids.length > 0 ? 'sold' : 'no_sale';

      await supabase
        .from('auctions')
        .update({ status: finalStatus, ended_at: new Date().toISOString() })
        .eq('id', auctionId)
        .eq('status', 'active');

      if (finalStatus === 'sold' && currentBids.length > 0) {
        var winningBid = currentBids[0];
        await supabase.from('results').insert({
          room_id: room.id,
          movie_id: movieId,
          player_id: winningBid.player_id,
          bid_amount: winningBid.amount,
        });
        setSoldMovieIds(function(prev) { return prev.concat([movieId]); });
      }

      setShowSold(finalStatus === 'sold');
      if (finalStatus === 'sold') {
        setTimeout(function() { setShowSold(false); }, 2500);
      }
    }, 1500);

    return () => clearTimeout(endTimeout);
  }, [timeLeft, isHost, localAuction?.id, localAuction?.status, localBids, room?.id]);

  // Budget calculation
  var getRemaining = function(playerId) {
    var spent = results.filter(function(r) { return r.player_id === playerId && r.status === 'active'; })
      .reduce(function(s, r) { return s + r.bid_amount; }, 0);

    var pendingSale = 0;
    if (localAuction && localAuction.status === 'sold' && localBids.length > 0) {
      var winningBid = localBids[0];
      if (winningBid.player_id === playerId) {
        var alreadyCounted = results.some(function(r) { return r.movie_id === localAuction.movie_id; });
        if (!alreadyCounted) {
          pendingSale = winningBid.amount;
        }
      }
    }

    return 100 - spent - pendingSale;
  };

  var auctionedMovieIds = results.map(function(r) { return r.movie_id; }).concat(soldMovieIds);
  var uniqueAuctionedIds = auctionedMovieIds.filter(function(id, i, arr) { return arr.indexOf(id) === i; });
  var availableMovies = movies.filter(function(m) { return uniqueAuctionedIds.indexOf(m.id) === -1; });

  var currentHigh = localBids.length > 0 ? localBids[0] : null;
  var currentHighPlayer = currentHigh ? players.find(function(p) { return p.id === currentHigh.player_id; }) : null;
  var myRemaining = getRemaining(currentPlayer.id);
  var currentHighAmount = currentHigh ? currentHigh.amount : 0;
  var isMyHighBid = currentHigh ? currentHigh.player_id === currentPlayer.id : false;

  var isActive = localAuction ? localAuction.status === 'active' : false;
  var isFinished = localAuction ? (localAuction.status === 'sold' || localAuction.status === 'no_sale') : false;

  // Place a bid
  var handleBid = async function(increment) {
    var amount = currentHighAmount + increment;
    if (amount > myRemaining) return;
    if (!localAuction || !localAuction.id || localAuction.status !== 'active') return;

    var aid = localAuction.id;
    var now = new Date().toISOString();

    // Reset local timer immediately for responsive feel
    setTimeLeft(STARTING_TIME);

    await Promise.all([
      supabase.from('auctions').update({ last_bid_at: now }).eq('id', aid),
      supabase.from('bids').insert({
        auction_id: aid,
        player_id: currentPlayer.id,
        amount: amount,
      }),
    ]);

    // Immediate refetch
    var results2 = await Promise.all([
      supabase.from('auctions').select('*, movies(title, release_date)').eq('id', aid).single(),
      supabase.from('bids').select('*, players(name, color)').eq('auction_id', aid).order('created_at', { ascending: false }),
    ]);

    if (results2[0].data) {
      setLocalAuction(results2[0].data);
      lastBidAtRef.current = results2[0].data.last_bid_at;
    }
    if (results2[1].data) setLocalBids(results2[1].data);
  };

  var handleStartAuction = function() {
    if (!selectedMovieId) return;
    hasEndedRef.current = false;
    setDismissedAuctionId(null);
    lastBidAtRef.current = null;
    startAuction(selectedMovieId);
    setSelectedMovieId('');
  };

  var handleEndEarly = async function() {
    if (!localAuction) return;
    clearInterval(timerRef.current);
    hasEndedRef.current = true;

    var finalStatus = localBids.length > 0 ? 'sold' : 'no_sale';

    await supabase
      .from('auctions')
      .update({ status: finalStatus, ended_at: new Date().toISOString() })
      .eq('id', localAuction.id);

    if (finalStatus === 'sold' && localBids.length > 0) {
      var winningBid = localBids[0];
      await supabase.from('results').insert({
        room_id: room.id,
        movie_id: localAuction.movie_id,
        player_id: winningBid.player_id,
        bid_amount: winningBid.amount,
      });
      setSoldMovieIds(function(prev) { return prev.concat([localAuction.movie_id]); });
    }

    setShowSold(finalStatus === 'sold');
    if (finalStatus === 'sold') {
      setTimeout(function() { setShowSold(false); }, 2500);
    }
  };

  var handleReset = function() {
    if (localAuction) {
      setDismissedAuctionId(localAuction.id);
    }
    setLocalAuction(null);
    setLocalBids([]);
    setTimeLeft(STARTING_TIME);
    setShowSold(false);
    hasEndedRef.current = false;
    lastBidAtRef.current = null;
    resetAuction();
  };

  return (
    <div style={{ paddingTop: 20, maxWidth: 800, margin: '0 auto' }}>

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
              {(localAuction && localAuction.movies ? localAuction.movies.title : 'Movie') + ' \u2192 '}
              <span style={{ color: currentHighPlayer ? currentHighPlayer.color : '#fff' }}>{currentHighPlayer ? currentHighPlayer.name : ''}</span>
              {' for '}
              <span style={{ color: '#c9a227' }}>{'$' + currentHigh.amount}</span>
            </div>
          )}
        </div>
      )}

      {!isActive && !isFinished && (
        <div style={{
          background: 'linear-gradient(135deg, #1a1410, #2a1f15)',
          border: '1px solid #3a3025', borderRadius: 12, padding: 24, marginBottom: 20,
        }}>
          {isHost ? (
            <div>
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
                <div>
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
                    onTouchEnd={function(e) { e.preventDefault(); if (selectedMovieId) handleStartAuction(); }}
                    style={{
                      touchAction: 'manipulation',
                      width: '100%', padding: '14px',
                      background: selectedMovieId ? 'linear-gradient(135deg, #c9a227, #f4d03f)' : '#2a1f15',
                      border: 'none', borderRadius: 8,
                      cursor: selectedMovieId ? 'pointer' : 'not-allowed',
                      fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 900,
                      color: selectedMovieId ? '#0d0a07' : '#6a5f55', letterSpacing: 3,
                    }}>
                    START BIDDING
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: 20 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, color: '#6a5f55' }}>
                Waiting for host to start next auction...
              </div>
              <div style={{ fontSize: 12, color: '#3a3025', marginTop: 8 }}>
                {availableMovies.length + ' movies remaining'}
              </div>
            </div>
          )}
        </div>
      )}

      {(isActive || isFinished) && localAuction && (
        <div style={{
          background: 'linear-gradient(135deg, #1a1410, #0d0a07)',
          border: '2px solid ' + (isFinished ? '#2a9d8f' : timeLeft <= 3 ? '#ff1744' : '#c9a227'),
          borderRadius: 12, padding: 24, marginBottom: 20,
          transition: 'border-color 0.3s',
        }}>
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: '#6a5f55', textTransform: 'uppercase', letterSpacing: 4 }}>
              {isFinished ? 'BIDDING CLOSED' : 'NOW BIDDING'}
            </div>
            <div style={{
              fontFamily: 'var(--font-display)', fontSize: 'clamp(24px, 5vw, 40px)',
              fontWeight: 900, color: '#fff', marginTop: 6,
            }}>
              {localAuction.movies ? localAuction.movies.title : ''}
            </div>
            {localAuction.movies && localAuction.movies.release_date && (
              <div style={{ fontSize: 12, color: '#8a7f75', marginTop: 4 }}>
                {'Releasing ' + new Date(localAuction.movies.release_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 30, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap', marginBottom: 24 }}>
            <AuctionTimer timeLeft={timeLeft} isActive={isActive} isFinished={isFinished} />
            <div style={{ textAlign: 'center', minWidth: 160 }}>
              <div style={{ fontSize: 11, color: '#6a5f55', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 6 }}>
                {isFinished ? 'WINNING BID' : 'CURRENT HIGH BID'}
              </div>
              {currentHigh ? (
                <div>
                  <div style={{
                    fontFamily: 'var(--font-display)', fontSize: 60, fontWeight: 900,
                    color: '#c9a227', lineHeight: 1,
                  }}>
                    {'$' + currentHigh.amount}
                  </div>
                  <div style={{
                    fontSize: 20, fontWeight: 700, marginTop: 8,
                    color: currentHighPlayer ? currentHighPlayer.color : '#fff',
                  }}>
                    {currentHighPlayer ? currentHighPlayer.name : ''}
                  </div>
                </div>
              ) : (
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: '#3a3025' }}>
                  No bids yet
                </div>
              )}
            </div>
          </div>

          {isActive && (
            <div style={{ marginBottom: 12 }}>
              <div style={{
                fontSize: 11, color: '#6a5f55', textTransform: 'uppercase', letterSpacing: 2,
                marginBottom: 10, textAlign: 'center',
              }}>
                {isMyHighBid ? (
                  <span style={{ color: '#c9a227' }}>{'★ YOU ARE THE HIGH BIDDER ★'}</span>
                ) : (
                  <span>{'YOUR BUDGET: '}<span style={{ color: '#c9a227', fontWeight: 700 }}>{'$' + myRemaining}</span></span>
                )}
              </div>

              {!isMyHighBid && (
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                  {BID_INCREMENTS.map(function(inc) {
                    var bidAmount = currentHighAmount + inc;
                    var canAfford = bidAmount <= myRemaining;
                    return (
                      <button key={inc}
                        onClick={function() { if (canAfford) handleBid(inc); }}
                        onTouchEnd={function(e) { e.preventDefault(); if (canAfford) handleBid(inc); }}
                        disabled={!canAfford}
                        style={{
                          touchAction: 'manipulation',
                          padding: '14px 20px', minWidth: 90,
                          background: canAfford
                            ? (inc === 10 ? 'linear-gradient(135deg, #c9a227, #f4d03f)' : inc === 5 ? 'linear-gradient(135deg, #c9a22780, #c9a22740)' : '#2a1f15')
                            : '#0d0a07',
                          border: '1px solid ' + (canAfford ? (inc >= 5 ? '#c9a227' : '#3a3025') : '#1a1410'),
                          borderRadius: 8, cursor: canAfford ? 'pointer' : 'not-allowed',
                          opacity: canAfford ? 1 : 0.3, transition: 'all 0.15s',
                          color: canAfford ? (inc === 10 ? '#0d0a07' : '#e8d5b7') : '#3a3025',
                          fontWeight: 700, fontFamily: 'var(--font-display)', fontSize: 16,
                        }}>
                        <div style={{ fontSize: 10, color: canAfford ? (inc === 10 ? '#0d0a0780' : '#6a5f55') : '#2a1f15', marginBottom: 2 }}>
                          {'+' + inc}
                        </div>
                        <div>{'$' + bidAmount}</div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {isHost && isActive && (
            <div style={{ textAlign: 'center', marginTop: 8 }}>
              <button onClick={handleEndEarly}
                onTouchEnd={function(e) { e.preventDefault(); handleEndEarly(); }}
                style={{
                  touchAction: 'manipulation',
                  padding: '8px 24px', background: 'transparent',
                  border: '1px solid #3a3025', borderRadius: 6, cursor: 'pointer',
                  fontSize: 12, color: '#6a5f55', letterSpacing: 2,
                }}>
                END BIDDING EARLY
              </button>
            </div>
          )}

          {isFinished && (
            <div style={{ textAlign: 'center', marginTop: 12 }}>
              {isHost ? (
                <button onClick={handleReset}
                  onTouchEnd={function(e) { e.preventDefault(); handleReset(); }}
                  style={{
                    touchAction: 'manipulation',
                    padding: '12px 28px', background: 'linear-gradient(135deg, #2a9d8f, #3dccbb)',
                    border: 'none', borderRadius: 8, cursor: 'pointer',
                    fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700,
                    color: '#0d0a07', letterSpacing: 2,
                  }}>
                  NEXT MOVIE
                </button>
              ) : (
                <div style={{ fontSize: 13, color: '#6a5f55' }}>
                  Waiting for host to start next auction...
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{
          background: 'linear-gradient(135deg, #1a1410, #0d0a07)',
          border: '1px solid #2a1f15', borderRadius: 12, overflow: 'hidden',
        }}>
          <div style={{
            padding: '10px 16px', borderBottom: '2px solid #c9a227',
            fontFamily: 'var(--font-display)', fontSize: 13,
            fontWeight: 700, color: '#c9a227', letterSpacing: 2,
          }}>BID HISTORY</div>
          <div style={{ maxHeight: 260, overflowY: 'auto' }}>
            {localBids.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: '#3a3025', fontSize: 13 }}>
                {isActive ? 'Waiting for first bid...' : 'No bids'}
              </div>
            ) : localBids.map(function(bid, i) {
              return (
                <div key={bid.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px',
                  borderBottom: '1px solid #1a1410',
                  background: i === 0 ? (bid.players ? bid.players.color : '#555') + '10' : 'transparent',
                }}>
                  <div style={{ width: 4, height: 24, borderRadius: 2, background: bid.players ? bid.players.color : '#555', flexShrink: 0 }} />
                  <div style={{ flex: 1, fontWeight: 700, color: bid.players ? bid.players.color : '#fff', fontSize: 14 }}>
                    {bid.players ? bid.players.name : ''}
                  </div>
                  <div style={{
                    fontFamily: 'var(--font-display)', fontWeight: 900,
                    fontSize: i === 0 ? 20 : 14, color: i === 0 ? '#c9a227' : '#8a7f75',
                  }}>
                    {'$' + bid.amount}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{
          background: 'linear-gradient(135deg, #1a1410, #0d0a07)',
          border: '1px solid #2a1f15', borderRadius: 12, overflow: 'hidden',
        }}>
          <div style={{
            padding: '10px 16px', borderBottom: '2px solid #c9a227',
            fontFamily: 'var(--font-display)', fontSize: 13,
            fontWeight: 700, color: '#c9a227', letterSpacing: 2,
          }}>BUDGETS</div>
          <div>
            {players.map(function(p) {
              var remaining = getRemaining(p.id);
              var pct = remaining / 100;
              var isMe = p.id === currentPlayer.id;
              return (
                <div key={p.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
                  borderBottom: '1px solid #1a1410',
                  background: isMe ? '#c9a22708' : 'transparent',
                }}>
                  <div style={{ width: 4, height: 24, borderRadius: 2, background: p.color, flexShrink: 0 }} />
                  <div style={{ fontWeight: 600, color: '#e8d5b7', fontSize: 13, minWidth: 70 }}>
                    {p.name}
                    {isMe && <span style={{ color: '#c9a227', fontSize: 9, marginLeft: 4 }}>YOU</span>}
                  </div>
                  <div style={{ flex: 1, height: 8, background: '#0d0a07', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', width: (pct * 100) + '%', borderRadius: 4,
                      background: 'linear-gradient(90deg, ' + p.color + ', ' + p.color + 'aa)',
                      transition: 'width 0.5s ease',
                    }} />
                  </div>
                  <div style={{
                    fontFamily: 'var(--font-display)', fontWeight: 700,
                    fontSize: 15, color: remaining > 20 ? '#e8d5b7' : remaining > 5 ? '#ff9100' : '#e63946',
                    minWidth: 40, textAlign: 'right',
                  }}>{'$' + remaining}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

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
                    <div style={{ fontWeight: 600, color: '#e8d5b7', fontSize: 13 }}>{r.movies ? r.movies.title : ''}</div>
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
