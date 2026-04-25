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
  const pollRef = useRef(null);
  const timerRef = useRef(null);

  const {
    auction: hookAuction,
    startAuction, endEarly, resetAuction,
  } = auction;

  // Poll for auction state and bids every 500ms during active auction
  useEffect(() => {
    const activeAuction = localAuction || hookAuction;
    if (!activeAuction || (activeAuction.status !== 'active' && activeAuction.status !== 'sold' && activeAuction.status !== 'no_sale')) {
      // Try to find an active auction
      if (room?.id) {
        const checkForAuction = async () => {
          const { data } = await supabase
            .from('auctions')
            .select('*, movies(title, release_date)')
            .eq('room_id', room.id)
            .in('status', ['active', 'sold', 'no_sale'])
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
          if (data) {
            setLocalAuction(data);
          }
        };
        const iv = setInterval(checkForAuction, 1000);
        checkForAuction();
        return () => clearInterval(iv);
      }
      return;
    }

    const poll = async () => {
      // Fetch latest auction state
      const { data: aData } = await supabase
        .from('auctions')
        .select('*, movies(title, release_date)')
        .eq('id', activeAuction.id)
        .single();

      if (aData) {
        setLocalAuction(aData);

        if (aData.status === 'sold' && activeAuction.status === 'active') {
          setShowSold(true);
          setTimeout(() => setShowSold(false), 2500);
        }
      }

      // Fetch latest bids
      const { data: bData } = await supabase
        .from('bids')
        .select('*, players(name, color)')
        .eq('auction_id', activeAuction.id)
        .order('created_at', { ascending: false });

      if (bData) {
        setLocalBids(bData);
      }
    };

    poll(); // Immediate
    pollRef.current = setInterval(poll, 500); // Every 500ms

    return () => clearInterval(pollRef.current);
  }, [localAuction?.id, localAuction?.status, hookAuction?.id, room?.id]);

  // Sync when hookAuction changes (e.g. host starts a new auction)
  useEffect(() => {
    if (hookAuction && (!localAuction || hookAuction.id !== localAuction.id)) {
      setLocalAuction(hookAuction);
      setLocalBids([]);
      setTimeLeft(STARTING_TIME);
      setShowSold(false);
    }
  }, [hookAuction?.id]);

  // Timer computed from timestamps
  useEffect(() => {
    if (!localAuction || localAuction.status !== 'active') {
      clearInterval(timerRef.current);
      if (localAuction?.status === 'sold' || localAuction?.status === 'no_sale') {
        setTimeLeft(0);
      }
      return;
    }

    let hasEnded = false;

    const tick = () => {
      if (!localAuction || localAuction.status !== 'active') return;
      const lastEvent = localAuction.last_bid_at || localAuction.started_at;
      if (!lastEvent) return;

      const elapsed = (Date.now() - new Date(lastEvent).getTime()) / 1000;
      const remaining = Math.max(0, Math.ceil(STARTING_TIME - elapsed));
      setTimeLeft(remaining);

      if (remaining <= -2 && !hasEnded && isHost) {
        hasEnded = true;
        clearInterval(timerRef.current);

        const finalStatus = localBids.length > 0 ? 'sold' : 'no_sale';

        supabase
          .from('auctions')
          .update({ status: finalStatus, ended_at: new Date().toISOString() })
          .eq('id', localAuction.id)
          .then(() => {
            if (finalStatus === 'sold' && localBids.length > 0) {
              const winningBid = localBids[0];
              supabase.from('results').insert({
                room_id: room.id,
                movie_id: localAuction.movie_id,
                player_id: winningBid.player_id,
                bid_amount: winningBid.amount,
              });
            }
          });

        setShowSold(finalStatus === 'sold');
        if (finalStatus === 'sold') {
          setTimeout(() => setShowSold(false), 2500);
        }
      }
    };

    tick();
    timerRef.current = setInterval(tick, 200);

    return () => clearInterval(timerRef.current);
  }, [localAuction?.id, localAuction?.status, localAuction?.last_bid_at, localAuction?.started_at, isHost, room?.id]);

  // Calculate each player's remaining budget
  const getRemaining = (playerId) => {
    const spent = results.filter(r => r.player_id === playerId && r.status === 'active')
      .reduce((s, r) => s + r.bid_amount, 0);
    return 100 - spent;
  };

  const auctionedMovieIds = results.map(r => r.movie_id);
  const availableMovies = movies.filter(m => !auctionedMovieIds.includes(m.id));

  const currentHigh = localBids.length > 0 ? localBids[0] : null;
  const currentHighPlayer = currentHigh ? players.find(p => p.id === currentHigh.player_id) : null;
  const myRemaining = getRemaining(currentPlayer.id);
  const currentHighAmount = currentHigh?.amount || 0;
  const isMyHighBid = currentHigh?.player_id === currentPlayer.id;

  const isActive = localAuction?.status === 'active';
  const isFinished = localAuction?.status === 'sold' || localAuction?.status === 'no_sale';
  const activeAuction = localAuction;

  const handleBid = async (increment) => {
    const amount = currentHighAmount + increment;
    if (amount > myRemaining) return;

    const a = localAuction;
    if (!a || !a.id || a.status !== 'active') return;

    // Update last_bid_at FIRST to reset timer
    const now = new Date().toISOString();
    await supabase
      .from('auctions')
      .update({ last_bid_at: now })
      .eq('id', a.id);

    // Insert the bid
    await supabase
      .from('bids')
      .insert({
        auction_id: a.id,
        player_id: currentPlayer.id,
        amount,
      });

    // Force immediate poll
    const { data: bData } = await supabase
      .from('bids')
      .select('*, players(name, color)')
      .eq('auction_id', a.id)
      .order('created_at', { ascending: false });
    if (bData) setLocalBids(bData);

    const { data: aData } = await supabase
      .from('auctions')
      .select('*, movies(title, release_date)')
      .eq('id', a.id)
      .single();
    if (aData) setLocalAuction(aData);
  };

  const handleStartAuction = () => {
    if (!selectedMovieId) return;
    startAuction(selectedMovieId);
    setSelectedMovieId('');
  };

  const handleEndEarly = async () => {
    if (!localAuction) return;
    clearInterval(timerRef.current);

    const finalStatus = localBids.length > 0 ? 'sold' : 'no_sale';

    await supabase
      .from('auctions')
      .update({ status: finalStatus, ended_at: new Date().toISOString() })
      .eq('id', localAuction.id);

    if (finalStatus === 'sold' && localBids.length > 0) {
      const winningBid = localBids[0];
      await supabase.from('results').insert({
        room_id: room.id,
        movie_id: localAuction.movie_id,
        player_id: winningBid.player_id,
        bid_amount: winningBid.amount,
      });
    }

    setShowSold(finalStatus === 'sold');
    if (finalStatus === 'sold') {
      setTimeout(() => setShowSold(false), 2500);
    }
  };

  const handleReset = () => {
    setLocalAuction(null);
    setLocalBids([]);
    setTimeLeft(STARTING_TIME);
    setShowSold(false);
    resetAuction();
  };

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
              {(activeAuction?.movies?.title || 'Movie') + ' \u2192 '}
              <span style={{ color: currentHighPlayer?.color }}>{currentHighPlayer?.name}</span>
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
                  <select value={selectedMovieId} onChange={e => setSelectedMovieId(e.target.value)}
                    style={{
                      width: '100%', padding: '12px 16px', background: '#0d0a07',
                      border: '1px solid #3a3025', borderRadius: 8, color: '#e8d5b7',
                      fontSize: 15, marginBottom: 12, outline: 'none',
                    }}>
                    <option value="">Choose a movie...</option>
                    {availableMovies.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.title + ' (' + new Date(m.release_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ')'}
                      </option>
                    ))}
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

      {/* Active auction / finished state */}
      {(isActive || isFinished) && activeAuction && (
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
              {activeAuction.movies?.title}
            </div>
            {activeAuction.movies?.release_date && (
              <div style={{ fontSize: 12, color: '#8a7f75', marginTop: 4 }}>
                {'Releasing ' + new Date(activeAuction.movies.release_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
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
                <>
                  <div style={{
                    fontFamily: 'var(--font-display)', fontSize: 60, fontWeight: 900,
                    color: '#c9a227', lineHeight: 1,
                  }}>
                    {'$' + currentHigh.amount}
                  </div>
                  <div style={{
                    fontSize: 20, fontWeight: 700, marginTop: 8,
                    color: currentHighPlayer?.color || '#fff',
                  }}>
                    {currentHighPlayer?.name}
                  </div>
                </>
              ) : (
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: '#3a3025' }}>
                  No bids yet
                </div>
              )}
            </div>
          </div>

          {/* Bid buttons */}
          {isActive && (
            <div style={{ marginBottom: 12 }}>
              <div style={{
                fontSize: 11, color: '#6a5f55', textTransform: 'uppercase', letterSpacing: 2,
                marginBottom: 10, textAlign: 'center',
              }}>
                {isMyHighBid ? (
                  <span style={{ color: '#c9a227' }}>{'★ YOU ARE THE HIGH BIDDER ★'}</span>
                ) : (
                  <>{'YOUR BUDGET: '}<span style={{ color: '#c9a227', fontWeight: 700 }}>{'$' + myRemaining}</span></>
                )}
              </div>

              {!isMyHighBid && (
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                  {BID_INCREMENTS.map(inc => {
                    const bidAmount = currentHighAmount + inc;
                    const canAfford = bidAmount <= myRemaining;
                    return (
                      <button key={inc}
                        onClick={() => canAfford && handleBid(inc)}
                        onTouchEnd={(e) => { e.preventDefault(); if (canAfford) handleBid(inc); }}
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

          {/* Host controls */}
          {isHost && isActive && (
            <div style={{ textAlign: 'center', marginTop: 8 }}>
              <button onClick={handleEndEarly} style={{
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
                <button onClick={handleReset} style={{
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

      {/* Bid history + Budgets */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Bid History - visible to ALL players */}
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
            ) : localBids.map((bid, i) => (
              <div key={bid.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px',
                borderBottom: '1px solid #1a1410',
                background: i === 0 ? (bid.players?.color || '#555') + '10' : 'transparent',
                animation: i === 0 ? 'bidSlide 0.3s ease-out' : 'none',
              }}>
                <div style={{ width: 4, height: 24, borderRadius: 2, background: bid.players?.color || '#555', flexShrink: 0 }} />
                <div style={{ flex: 1, fontWeight: 700, color: bid.players?.color || '#fff', fontSize: 14 }}>
                  {bid.players?.name}
                </div>
                <div style={{
                  fontFamily: 'var(--font-display)', fontWeight: 900,
                  fontSize: i === 0 ? 20 : 14, color: i === 0 ? '#c9a227' : '#8a7f75',
                }}>
                  {'$' + bid.amount}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Budgets */}
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
            {players.map(p => {
              const remaining = getRemaining(p.id);
              const pct = remaining / 100;
              const isMe = p.id === currentPlayer.id;
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
            {results.map(r => {
              const p = players.find(pl => pl.id === r.player_id);
              return (
                <div key={r.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
                  borderBottom: '1px solid #1a1410',
                }}>
                  <div style={{ width: 4, height: 28, borderRadius: 2, background: p?.color || '#555', flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, color: '#e8d5b7', fontSize: 13 }}>{r.movies?.title}</div>
                    <div style={{ fontSize: 11, color: p?.color || '#6a5f55', fontWeight: 600 }}>{p?.name}</div>
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
