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

export default function AuctionNight(props) {
  var room = props.room;
  var players = props.players;
  var currentPlayer = props.currentPlayer;
  var isHost = props.isHost;
  var movies = props.movies;
  var auction = props.auction;
  var results = props.results;

  var startAuctionHook = auction.startAuction;
  var resetAuctionHook = auction.resetAuction;

  var _sm = useState(''); var selectedMovieId = _sm[0]; var setSelectedMovieId = _sm[1];
  var _lb = useState([]); var localBids = _lb[0]; var setLocalBids = _lb[1];
  var _la = useState(null); var localAuction = _la[0]; var setLocalAuction = _la[1];
  var _tl = useState(STARTING_TIME); var timeLeft = _tl[0]; var setTimeLeft = _tl[1];
  var _ss = useState(false); var showSold = _ss[0]; var setShowSold = _ss[1];
  var _da = useState(null); var dismissedAuctionId = _da[0]; var setDismissedAuctionId = _da[1];
  var _smi = useState([]); var soldMovieIds = _smi[0]; var setSoldMovieIds = _smi[1];

  var pollRef = useRef(null);
  var timerRef = useRef(null);
  var hasEndedRef = useRef(false);
  var lastBidAtRef = useRef(null);
  var expiryRef = useRef(Date.now() + STARTING_TIME * 1000);
  var localBidsRef = useRef([]);
  var localAuctionRef = useRef(null);

  useEffect(function() { localBidsRef.current = localBids; }, [localBids]);
  useEffect(function() { localAuctionRef.current = localAuction; }, [localAuction]);

  // ─── POLL ──────────────────────────────────────────────
  useEffect(function() {
    if (!room || !room.id) return;

    var poll = async function() {
      var aRes = await supabase
        .from('auctions')
        .select('*, movies(title, release_date)')
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

  // ─── TIMER: reads from expiryRef ──────────────────────
  useEffect(function() {
    if (!localAuction || localAuction.status !== 'active') {
      clearInterval(timerRef.current);
      if (localAuction && (localAuction.status === 'sold' || localAuction.status === 'no_sale')) {
        setTimeLeft(0);
      }
      return;
    }

    hasEndedRef.current = false;
    expiryRef.current = Date.now() + STARTING_TIME * 1000;

    timerRef.current = setInterval(function() {
      var msLeft = expiryRef.current - Date.now();
      var secs = Math.max(0, Math.ceil(msLeft / 1000));
      secs = Math.min(secs, STARTING_TIME);
      setTimeLeft(secs);
    }, 250);

    return function() { clearInterval(timerRef.current); };
  }, [localAuction ? localAuction.id : null, localAuction ? localAuction.status : null]);

  // ─── END AUCTION when timer hits 0 ────────────────────
  useEffect(function() {
    if (!isHost) return;
    if (!localAuction || localAuction.status !== 'active') return;
    if (timeLeft > 0) return;
    if (hasEndedRef.current) return;

    var aid = localAuction.id;
    var mid = localAuction.movie_id;

    var timeout = setTimeout(async function() {
      if (hasEndedRef.current) return;

      // Fresh read to make sure no last-second bid
      var fresh = await supabase
        .from('auctions')
        .select('last_bid_at, started_at, status')
        .eq('id', aid)
        .single();

      if (!fresh.data || fresh.data.status !== 'active' || hasEndedRef.current) return;

      var freshLBA = fresh.data.last_bid_at || fresh.data.started_at;
      var freshElapsed = (Date.now() - new Date(freshLBA).getTime()) / 1000;

      if (freshElapsed < STARTING_TIME) {
        // A bid came in! Reset timer
        lastBidAtRef.current = freshLBA;
        expiryRef.current = Date.now() + Math.max(1000, (STARTING_TIME - freshElapsed) * 1000);
        return;
      }

      hasEndedRef.current = true;
      clearInterval(timerRef.current);

      var bids = localBidsRef.current || [];
      var status = bids.length > 0 ? 'sold' : 'no_sale';

      await supabase
        .from('auctions')
        .update({ status: status, ended_at: new Date().toISOString() })
        .eq('id', aid)
        .eq('status', 'active');

      if (status === 'sold' && bids.length > 0) {
        var wb = bids[0];
        await supabase.from('results').insert({
          room_id: room.id,
          movie_id: mid,
          player_id: wb.player_id,
          bid_amount: wb.amount,
        });
        setSoldMovieIds(function(p) { return p.concat([mid]); });
      }

      setShowSold(status === 'sold');
      if (status === 'sold') {
        setTimeout(function() { setShowSold(false); }, 2500);
      }
    }, 1500);

    return function() { clearTimeout(timeout); };
  }, [timeLeft, isHost, localAuction ? localAuction.id : null, localAuction ? localAuction.status : null]);

  // ─── Helpers ───────────────────────────────────────────
  var getRemaining = function(pid) {
    var spent = 0;
    for (var i = 0; i < results.length; i++) {
      if (results[i].player_id === pid && results[i].status === 'active') {
        spent += results[i].bid_amount;
      }
    }
    var pending = 0;
    if (localAuction && localAuction.status === 'sold' && localBids.length > 0) {
      if (localBids[0].player_id === pid) {
        var already = false;
        for (var j = 0; j < results.length; j++) {
          if (results[j].movie_id === localAuction.movie_id) { already = true; break; }
        }
        if (!already) pending = localBids[0].amount;
      }
    }
    return 100 - spent - pending;
  };

  var soldIds = {};
  for (var i = 0; i < results.length; i++) soldIds[results[i].movie_id] = true;
  for (var i = 0; i < soldMovieIds.length; i++) soldIds[soldMovieIds[i]] = true;
  var availableMovies = movies.filter(function(m) { return !soldIds[m.id]; });

  var currentHigh = localBids.length > 0 ? localBids[0] : null;
  var currentHighPlayer = currentHigh ? players.find(function(p) { return p.id === currentHigh.player_id; }) : null;
  var myRemaining = getRemaining(currentPlayer.id);
  var currentHighAmount = currentHigh ? currentHigh.amount : 0;
  var isMyHighBid = currentHigh ? currentHigh.player_id === currentPlayer.id : false;
  var isActive = localAuction ? localAuction.status === 'active' : false;
  var isFinished = localAuction ? (localAuction.status === 'sold' || localAuction.status === 'no_sale') : false;

  var handleBid = async function(inc) {
    var amount = currentHighAmount + inc;
    if (amount > myRemaining) return;
    var a = localAuctionRef.current;
    if (!a || !a.id || a.status !== 'active') return;

    // Reset expiry IMMEDIATELY on this device
    expiryRef.current = Date.now() + STARTING_TIME * 1000;

    var now = new Date().toISOString();
    await Promise.all([
      supabase.from('auctions').update({ last_bid_at: now }).eq('id', a.id),
      supabase.from('bids').insert({ auction_id: a.id, player_id: currentPlayer.id, amount: amount }),
    ]);

    var r = await Promise.all([
      supabase.from('auctions').select('*, movies(title, release_date)').eq('id', a.id).single(),
      supabase.from('bids').select('*, players(name, color)').eq('auction_id', a.id).order('created_at', { ascending: false }),
    ]);
    if (r[0].data) { setLocalAuction(r[0].data); lastBidAtRef.current = r[0].data.last_bid_at; }
    if (r[1].data) setLocalBids(r[1].data);
  };

  var handleStart = function() {
    if (!selectedMovieId) return;
    hasEndedRef.current = false;
    setDismissedAuctionId(null);
    lastBidAtRef.current = null;
    expiryRef.current = Date.now() + STARTING_TIME * 1000;
    startAuctionHook(selectedMovieId);
    setSelectedMovieId('');
  };

  var handleEndEarly = async function() {
    if (!localAuction) return;
    clearInterval(timerRef.current);
    hasEndedRef.current = true;
    var bids = localBidsRef.current || [];
    var status = bids.length > 0 ? 'sold' : 'no_sale';
    await supabase.from('auctions').update({ status: status, ended_at: new Date().toISOString() }).eq('id', localAuction.id);
    if (status === 'sold' && bids.length > 0) {
      var wb = bids[0];
      await supabase.from('results').insert({ room_id: room.id, movie_id: localAuction.movie_id, player_id: wb.player_id, bid_amount: wb.amount });
      setSoldMovieIds(function(p) { return p.concat([localAuction.movie_id]); });
    }
    setShowSold(status === 'sold');
    if (status === 'sold') setTimeout(function() { setShowSold(false); }, 2500);
  };

  var handleReset = function() {
    if (localAuction) setDismissedAuctionId(localAuction.id);
    setLocalAuction(null);
    setLocalBids([]);
    setTimeLeft(STARTING_TIME);
    setShowSold(false);
    hasEndedRef.current = false;
    lastBidAtRef.current = null;
    resetAuctionHook();
  };

  // ─── RENDER ────────────────────────────────────────────
  return (
    <div style={{ paddingTop: 20, maxWidth: 800, margin: '0 auto' }}>

      {showSold && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.75)', zIndex: 100, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', animation: 'fadeIn 0.2s', pointerEvents: 'none' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(60px, 15vw, 120px)', fontWeight: 900, color: '#c9a227', textShadow: '0 0 60px rgba(201,162,39,0.8)', animation: 'soldBounce 0.6s ease-out' }}>SOLD!</div>
          {currentHigh && (
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(16px, 3vw, 24px)', color: '#fff', marginTop: 10, textAlign: 'center', padding: '0 20px', animation: 'soldBounce 0.6s ease-out 0.2s both' }}>
              {(localAuction && localAuction.movies ? localAuction.movies.title : 'Movie') + ' \u2192 '}
              <span style={{ color: currentHighPlayer ? currentHighPlayer.color : '#fff' }}>{currentHighPlayer ? currentHighPlayer.name : ''}</span>
              {' for '}<span style={{ color: '#c9a227' }}>{'$' + currentHigh.amount}</span>
            </div>
          )}
        </div>
      )}

      {!isActive && !isFinished && (
        <div style={{ background: 'linear-gradient(135deg, #1a1410, #2a1f15)', border: '1px solid #3a3025', borderRadius: 12, padding: 24, marginBottom: 20 }}>
          {isHost ? (
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: '#c9a227', marginBottom: 16, textAlign: 'center', letterSpacing: 2 }}>SELECT NEXT MOVIE</div>
              {availableMovies.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#6a5f55', fontSize: 14 }}>All movies have been auctioned!</div>
              ) : (
                <div>
                  <select value={selectedMovieId} onChange={function(e) { setSelectedMovieId(e.target.value); }} style={{ width: '100%', padding: '12px 16px', background: '#0d0a07', border: '1px solid #3a3025', borderRadius: 8, color: '#e8d5b7', fontSize: 15, marginBottom: 12, outline: 'none' }}>
                    <option value="">Choose a movie...</option>
                    {availableMovies.map(function(m) { return <option key={m.id} value={m.id}>{m.title + ' (' + new Date(m.release_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ')'}</option>; })}
                  </select>
                  <button onClick={handleStart} onTouchEnd={function(e) { e.preventDefault(); handleStart(); }} disabled={!selectedMovieId} style={{ touchAction: 'manipulation', width: '100%', padding: '14px', background: selectedMovieId ? 'linear-gradient(135deg, #c9a227, #f4d03f)' : '#2a1f15', border: 'none', borderRadius: 8, cursor: selectedMovieId ? 'pointer' : 'not-allowed', fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 900, color: selectedMovieId ? '#0d0a07' : '#6a5f55', letterSpacing: 3 }}>START BIDDING</button>
                </div>
              )}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: 20 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, color: '#6a5f55' }}>Waiting for host to start next auction...</div>
              <div style={{ fontSize: 12, color: '#3a3025', marginTop: 8 }}>{availableMovies.length + ' movies remaining'}</div>
            </div>
          )}
        </div>
      )}

      {(isActive || isFinished) && localAuction && (
        <div style={{ background: 'linear-gradient(135deg, #1a1410, #0d0a07)', border: '2px solid ' + (isFinished ? '#2a9d8f' : timeLeft <= 3 ? '#ff1744' : '#c9a227'), borderRadius: 12, padding: 24, marginBottom: 20, transition: 'border-color 0.3s' }}>
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: '#6a5f55', textTransform: 'uppercase', letterSpacing: 4 }}>{isFinished ? 'BIDDING CLOSED' : 'NOW BIDDING'}</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(24px, 5vw, 40px)', fontWeight: 900, color: '#fff', marginTop: 6 }}>{localAuction.movies ? localAuction.movies.title : ''}</div>
            {localAuction.movies && localAuction.movies.release_date && (
              <div style={{ fontSize: 12, color: '#8a7f75', marginTop: 4 }}>{'Releasing ' + new Date(localAuction.movies.release_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 30, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap', marginBottom: 24 }}>
            <AuctionTimer timeLeft={timeLeft} isActive={isActive} isFinished={isFinished} />
            <div style={{ textAlign: 'center', minWidth: 160 }}>
              <div style={{ fontSize: 11, color: '#6a5f55', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 6 }}>{isFinished ? 'WINNING BID' : 'CURRENT HIGH BID'}</div>
              {currentHigh ? (
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 60, fontWeight: 900, color: '#c9a227', lineHeight: 1 }}>{'$' + currentHigh.amount}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, marginTop: 8, color: currentHighPlayer ? currentHighPlayer.color : '#fff' }}>{currentHighPlayer ? currentHighPlayer.name : ''}</div>
                </div>
              ) : (
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: '#3a3025' }}>No bids yet</div>
              )}
            </div>
          </div>

          {isActive && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: '#6a5f55', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 10, textAlign: 'center' }}>
                {isMyHighBid ? <span style={{ color: '#c9a227' }}>{'\u2605 YOU ARE THE HIGH BIDDER \u2605'}</span> : <span>{'YOUR BUDGET: '}<span style={{ color: '#c9a227', fontWeight: 700 }}>{'$' + myRemaining}</span></span>}
              </div>
              {!isMyHighBid && (
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                  {BID_INCREMENTS.map(function(inc) {
                    var bidAmount = currentHighAmount + inc;
                    var canAfford = bidAmount <= myRemaining;
                    return (
                      <button key={inc} onClick={function() { if (canAfford) handleBid(inc); }} onTouchEnd={function(e) { e.preventDefault(); if (canAfford) handleBid(inc); }} disabled={!canAfford} style={{ touchAction: 'manipulation', padding: '14px 20px', minWidth: 90, background: canAfford ? (inc === 10 ? 'linear-gradient(135deg, #c9a227, #f4d03f)' : inc === 5 ? 'linear-gradient(135deg, #c9a22780, #c9a22740)' : '#2a1f15') : '#0d0a07', border: '1px solid ' + (canAfford ? (inc >= 5 ? '#c9a227' : '#3a3025') : '#1a1410'), borderRadius: 8, cursor: canAfford ? 'pointer' : 'not-allowed', opacity: canAfford ? 1 : 0.3, transition: 'all 0.15s', color: canAfford ? (inc === 10 ? '#0d0a07' : '#e8d5b7') : '#3a3025', fontWeight: 700, fontFamily: 'var(--font-display)', fontSize: 16 }}>
                        <div style={{ fontSize: 10, color: canAfford ? (inc === 10 ? '#0d0a0780' : '#6a5f55') : '#2a1f15', marginBottom: 2 }}>{'+' + inc}</div>
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
              <button onClick={handleEndEarly} onTouchEnd={function(e) { e.preventDefault(); handleEndEarly(); }} style={{ touchAction: 'manipulation', padding: '8px 24px', background: 'transparent', border: '1px solid #3a3025', borderRadius: 6, cursor: 'pointer', fontSize: 12, color: '#6a5f55', letterSpacing: 2 }}>END BIDDING EARLY</button>
            </div>
          )}

          {isFinished && (
            <div style={{ textAlign: 'center', marginTop: 12 }}>
              {isHost ? (
                <button onClick={handleReset} onTouchEnd={function(e) { e.preventDefault(); handleReset(); }} style={{ touchAction: 'manipulation', padding: '12px 28px', background: 'linear-gradient(135deg, #2a9d8f, #3dccbb)', border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: '#0d0a07', letterSpacing: 2 }}>NEXT MOVIE</button>
              ) : (
                <div style={{ fontSize: 13, color: '#6a5f55' }}>Waiting for host to start next auction...</div>
              )}
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ background: 'linear-gradient(135deg, #1a1410, #0d0a07)', border: '1px solid #2a1f15', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '10px 16px', borderBottom: '2px solid #c9a227', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, color: '#c9a227', letterSpacing: 2 }}>BID HISTORY</div>
          <div style={{ maxHeight: 260, overflowY: 'auto' }}>
            {localBids.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: '#3a3025', fontSize: 13 }}>{isActive ? 'Waiting for first bid...' : 'No bids'}</div>
            ) : localBids.map(function(bid, i) {
              return (
                <div key={bid.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderBottom: '1px solid #1a1410', background: i === 0 ? (bid.players ? bid.players.color : '#555') + '10' : 'transparent' }}>
                  <div style={{ width: 4, height: 24, borderRadius: 2, background: bid.players ? bid.players.color : '#555', flexShrink: 0 }} />
                  <div style={{ flex: 1, fontWeight: 700, color: bid.players ? bid.players.color : '#fff', fontSize: 14 }}>{bid.players ? bid.players.name : ''}</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: i === 0 ? 20 : 14, color: i === 0 ? '#c9a227' : '#8a7f75' }}>{'$' + bid.amount}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ background: 'linear-gradient(135deg, #1a1410, #0d0a07)', border: '1px solid #2a1f15', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '10px 16px', borderBottom: '2px solid #c9a227', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, color: '#c9a227', letterSpacing: 2 }}>BUDGETS</div>
          <div>
            {players.map(function(p) {
              var rem = getRemaining(p.id);
              var pct = rem / 100;
              var isMe = p.id === currentPlayer.id;
              return (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: '1px solid #1a1410', background: isMe ? '#c9a22708' : 'transparent' }}>
                  <div style={{ width: 4, height: 24, borderRadius: 2, background: p.color, flexShrink: 0 }} />
                  <div style={{ fontWeight: 600, color: '#e8d5b7', fontSize: 13, minWidth: 70 }}>{p.name}{isMe && <span style={{ color: '#c9a227', fontSize: 9, marginLeft: 4 }}>YOU</span>}</div>
                  <div style={{ flex: 1, height: 8, background: '#0d0a07', borderRadius: 4, overflow: 'hidden' }}><div style={{ height: '100%', width: (pct * 100) + '%', borderRadius: 4, background: 'linear-gradient(90deg, ' + p.color + ', ' + p.color + 'aa)', transition: 'width 0.5s ease' }} /></div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color: rem > 20 ? '#e8d5b7' : rem > 5 ? '#ff9100' : '#e63946', minWidth: 40, textAlign: 'right' }}>{'$' + rem}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {results.length > 0 && (
        <div style={{ marginTop: 20, background: 'linear-gradient(135deg, #1a1410, #0d0a07)', border: '1px solid #2a1f15', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '10px 16px', borderBottom: '2px solid #c9a227', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, color: '#c9a227', letterSpacing: 2 }}>{'SOLD TONIGHT \u2014 ' + results.length + ' MOVIE' + (results.length !== 1 ? 'S' : '')}</div>
          <div>
            {results.map(function(r) {
              var p = players.find(function(pl) { return pl.id === r.player_id; });
              return (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: '1px solid #1a1410' }}>
                  <div style={{ width: 4, height: 28, borderRadius: 2, background: p ? p.color : '#555', flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, color: '#e8d5b7', fontSize: 13 }}>{r.movies ? r.movies.title : ''}</div>
                    <div style={{ fontSize: 11, color: p ? p.color : '#6a5f55', fontWeight: 600 }}>{p ? p.name : ''}</div>
                  </div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, color: '#c9a227', fontSize: 16 }}>{'$' + r.bid_amount}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
