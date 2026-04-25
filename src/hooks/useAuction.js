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
  const expiryRef = useRef(null);
  const hasEndedRef = useRef(false);

  // Keep refs in sync so timer closure always has latest values
  useEffect(() => { isHostRef.current = isHost; }, [isHost]);
  useEffect(() => { bidsRef.current = bids; }, [bids]);
  useEffect(() => { auctionRef.current = auction; }, [auction]);

  // Helper: fetch movie data separately (avoids PostgREST join 406)
  const fetchMovieForAuction = async (auctionRow) => {
    if (!auctionRow || !auctionRow.movie_id) return auctionRow;
    const { data: movie } = await supabase
      .from('movies')
      .select('title, release_date')
      .eq('id', auctionRow.movie_id)
      .single();
    return { ...auctionRow, movies: movie || null };
  };

  // Fetch active auction
  const fetchAuction = useCallback(async () => {
    if (!roomId) return;

    const { data } = await supabase
      .from('auctions')
      .select('*')
      .eq('room_id', roomId)
      .in('status', ['waiting', 'active'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (data) {
      const withMovie = await fetchMovieForAuction(data);
      setAuction(withMovie);

      const { data: bidData } = await supabase
        .from('bids')
        .select('*, players(name, color)')
        .eq('auction_id', data.id)
        .order('created_at', { ascending: false });

      setBids(bidData || []);
    } else {
      setAuction(null);
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
          // If this is a new auction we haven't seen, trigger a full refetch
          if (!prev || prev.id !== updated.id) {
            fetchAuction();
            return prev;
          }
          // For updates to the current auction, merge but preserve movies
          return { ...prev, ...updated, movies: prev?.movies || updated.movies };
        });

        if (updated.status === 'sold') {
          setShowSold(true);
          setTimeout(() => setShowSold(false), 2500);
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
      }, () => {
        // Refetch all bids to get player info
        supabase
          .from('bids')
          .select('*, players(name, color)')
          .eq('auction_id', auction.id)
          .order('created_at', { ascending: false })
          .then(({ data }) => {
            if (data) setBids(data);
          });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [auction?.id]);

  // Polling fallback: refetch auction + bids every 800ms
  // Only polls for waiting/active — finished auctions are handled by AuctionNight
  useEffect(() => {
    if (!roomId) return;

    const poll = async () => {
      const { data: aData } = await supabase
        .from('auctions')
        .select('*')
        .eq('room_id', roomId)
        .in('status', ['waiting', 'active'])
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!aData) return;

      // Only update if it's the current auction or a new one
      const prev = auctionRef.current;
      if (aData.id !== prev?.id) {
        const withMovie = await fetchMovieForAuction(aData);
        setAuction(withMovie);
      } else {
        setAuction(p => ({ ...p, ...aData, movies: p?.movies }));
      }

      if (aData.id) {
        const { data: bData } = await supabase
          .from('bids')
          .select('*, players(name, color)')
          .eq('auction_id', aData.id)
          .order('created_at', { ascending: false });

        if (bData) setBids(bData);
      }
    };

    const iv = setInterval(poll, 800);
    return () => clearInterval(iv);
  }, [roomId]);

  // Timer: expiry-based countdown
  useEffect(() => {
    const a = auctionRef.current;
    if (!a || a.status !== 'active') {
      clearInterval(timerRef.current);
      if (a && (a.status === 'sold' || a.status === 'no_sale')) {
        setTimeLeft(0);
      }
      return;
    }

    hasEndedRef.current = false;
    const lastEvent = a.last_bid_at || a.started_at;
    expiryRef.current = new Date(lastEvent).getTime() + STARTING_TIME * 1000;

    timerRef.current = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((expiryRef.current - Date.now()) / 1000));
      setTimeLeft(Math.min(remaining, STARTING_TIME));

      if (remaining <= -2 && !hasEndedRef.current && isHostRef.current) {
        hasEndedRef.current = true;
        clearInterval(timerRef.current);

        const currentBids = bidsRef.current;
        const currentAuction = auctionRef.current;
        if (!currentAuction) return;

        const finalStatus = currentBids.length > 0 ? 'sold' : 'no_sale';

        supabase
          .from('auctions')
          .update({
            status: finalStatus,
            ended_at: new Date().toISOString(),
          })
          .eq('id', currentAuction.id)
          .then(() => {
            if (finalStatus === 'sold' && currentBids.length > 0) {
              const winningBid = currentBids[0];
              supabase
                .from('results')
                .insert({
                  room_id: roomId,
                  movie_id: currentAuction.movie_id,
                  player_id: winningBid.player_id,
                  bid_amount: winningBid.amount,
                })
                .select()
                .then(({ error }) => {
                  if (error) console.error('Results insert failed:', error.message);
                });
            }
          });

        setShowSold(finalStatus === 'sold');
        if (finalStatus === 'sold') {
          setTimeout(() => setShowSold(false), 2500);
        }
      }
    }, 250);

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
      .select('*')
      .single();

    if (!error && data) {
      const withMovie = await fetchMovieForAuction(data);
      setAuction(withMovie);
      setBids([]);
      setTimeLeft(STARTING_TIME);
      hasEndedRef.current = false;
      expiryRef.current = Date.now() + STARTING_TIME * 1000;
    }
    return data;
  }, [isHost, roomId]);

  // Place a bid — uses refs to avoid stale closure issues
  const placeBid = useCallback(async (playerId, amount) => {
    if (!auctionRef.current || auctionRef.current.status !== 'active') return;

    // Update last_bid_at FIRST to reset timer
    const now = new Date().toISOString();
    await supabase
      .from('auctions')
      .update({ last_bid_at: now })
      .eq('id', auctionRef.current.id);

    // Insert the bid
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

    // Reset local timer immediately
    expiryRef.current = Date.now() + STARTING_TIME * 1000;
    hasEndedRef.current = false;

    // Force refetch to update UI immediately (don't rely on realtime)
    fetchAuction();
  }, [fetchAuction]);

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
    hasEndedRef.current = false;
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