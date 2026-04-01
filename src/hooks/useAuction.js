import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { STARTING_TIME, BID_EXTENSION } from '../lib/constants';

export function useAuction(roomId, isHost) {
  const [auction, setAuction] = useState(null);
  const [bids, setBids] = useState([]);
  const [timeLeft, setTimeLeft] = useState(STARTING_TIME);
  const [showSold, setShowSold] = useState(false);
  const timerRef = useRef(null);
  const isHostRef = useRef(isHost);
  const bidsRef = useRef(bids);
  const auctionRef = useRef(auction);

  // Keep refs in sync so timer closure always has latest values
  useEffect(() => { isHostRef.current = isHost; }, [isHost]);
  useEffect(() => { bidsRef.current = bids; }, [bids]);
  useEffect(() => { auctionRef.current = auction; }, [auction]);

  // Fetch active auction
  const fetchAuction = useCallback(async () => {
    if (!roomId) return;

    const { data } = await supabase
      .from('auctions')
      .select('*, movies(title, release_date)')
      .eq('room_id', roomId)
      .in('status', ['waiting', 'active'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    setAuction(data || null);

    if (data) {
      const { data: bidData } = await supabase
        .from('bids')
        .select('*, players(name, color)')
        .eq('auction_id', data.id)
        .order('created_at', { ascending: false });

      setBids(bidData || []);
    } else {
      setBids([]);
    }
  }, [roomId]);

  useEffect(() => {
    fetchAuction();
  }, [fetchAuction]);

  // Real-time: auction state changes
  useEffect(() => {
    if (!roomId) return;

    const channel = supabase
      .channel('auction-' + roomId)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'auctions',
        filter: 'room_id=eq.' + roomId,
      }, (payload) => {
        const updated = payload.new;

        setAuction(prev => {
          if (!prev || prev.id !== updated.id) {
            fetchAuction();
            return prev;
          }
          return { ...prev, ...updated, movies: prev?.movies || updated.movies };
        });

        if (updated.status === 'sold') {
          setShowSold(true);
          setTimeout(() => setShowSold(false), 2500);
        }
        if (updated.status === 'no_sale') {
          setShowSold(false);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [roomId, fetchAuction]);

  // Real-time: new bids
  useEffect(() => {
    if (!auction) return;

    const channel = supabase
      .channel('bids-' + auction.id)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'bids',
        filter: 'auction_id=eq.' + auction.id,
      }, async (payload) => {
        const { data } = await supabase
          .from('bids')
          .select('*, players(name, color)')
          .eq('id', payload.new.id)
          .single();

        if (data) {
          setBids(prev => [data, ...prev]);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [auction?.id]);

  // Timer logic — computed from timestamps, uses refs for stable closure
  useEffect(() => {
    if (!auction || auction.status !== 'active') {
      clearInterval(timerRef.current);
      if (auction?.status === 'sold' || auction?.status === 'no_sale') {
        setTimeLeft(0);
      }
      return;
    }

    let hasEnded = false;

    const tick = () => {
      const a = auctionRef.current;
      if (!a || a.status !== 'active') return;

      const lastEvent = a.last_bid_at || a.started_at;
      if (!lastEvent) return;

      const elapsed = (Date.now() - new Date(lastEvent).getTime()) / 1000;
      const remaining = Math.max(0, Math.ceil(STARTING_TIME - elapsed));
      setTimeLeft(remaining);

      // Only host ends the auction when timer expires
      if (remaining <= 0 && !hasEnded && isHostRef.current) {
        hasEnded = true;
        clearInterval(timerRef.current);

        const currentBids = bidsRef.current;
        const finalStatus = currentBids.length > 0 ? 'sold' : 'no_sale';

        supabase
          .from('auctions')
          .update({
            status: finalStatus,
            ended_at: new Date().toISOString(),
          })
          .eq('id', a.id)
          .then(() => {
            if (finalStatus === 'sold' && currentBids.length > 0) {
              const winningBid = currentBids[0];
              supabase
                .from('results')
                .insert({
                  room_id: roomId,
                  movie_id: a.movie_id,
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
  }, [auction?.id, auction?.status, auction?.last_bid_at, auction?.started_at, roomId]);

  // Start a new auction (host only)
  const startAuction = useCallback(async (movieId) => {
    if (!isHost || !roomId) return;

    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('auctions')
      .insert({
        room_id: roomId,
        movie_id: movieId,
        status: 'active',
        started_at: now,
        last_bid_at: now,
      })
      .select('*, movies(title, release_date)')
      .single();

    if (!error && data) {
      setAuction(data);
      setBids([]);
      setTimeLeft(STARTING_TIME);
    }
    return data;
  }, [isHost, roomId]);

  // Place a bid — uses refs to avoid stale closure issues
  const placeBid = useCallback(async (playerId, amount) => {
    if (!auctionRef.current || auctionRef.current.status !== 'active') return;

    const { error: bidErr } = await supabase
      .from('bids')
      .insert({
        auction_id: auctionRef.current.id,
        player_id: playerId,
        amount,
      });

    if (bidErr) {
      console.error('Bid failed:', bidErr.message);
      return;
    }

    // Update last_bid_at — resets timer for everyone
    const now = new Date().toISOString();
    await supabase
      .from('auctions')
      .update({ last_bid_at: now })
      .eq('id', auctionRef.current.id);

  }, []);

  // End early (host only)
  const endEarly = useCallback(async () => {
    if (!auctionRef.current) return;
    clearInterval(timerRef.current);

    const currentBids = bidsRef.current;
    const finalStatus = currentBids.length > 0 ? 'sold' : 'no_sale';

    await supabase
      .from('auctions')
      .update({
        status: finalStatus,
        ended_at: new Date().toISOString(),
      })
      .eq('id', auctionRef.current.id);

    if (finalStatus === 'sold' && currentBids.length > 0) {
      const winningBid = currentBids[0];
      await supabase
        .from('results')
        .insert({
          room_id: roomId,
          movie_id: auctionRef.current.movie_id,
          player_id: winningBid.player_id,
          bid_amount: winningBid.amount,
        });
    }

    setShowSold(finalStatus === 'sold');
    if (finalStatus === 'sold') {
      setTimeout(() => setShowSold(false), 2500);
    }
  }, [roomId]);

  // Reset for next movie
  const resetAuction = useCallback(() => {
    setAuction(null);
    setBids([]);
    setTimeLeft(STARTING_TIME);
    setShowSold(false);
  }, []);

  const currentHigh = bids.length > 0 ? bids[0] : null;
  const isActive = auction?.status === 'active';
  const isFinished = auction?.status === 'sold' || auction?.status === 'no_sale';

  return {
    auction, bids, timeLeft, currentHigh,
    isActive, isFinished, showSold,
    startAuction, placeBid, endEarly, resetAuction,
    refetch: fetchAuction,
  };
}
