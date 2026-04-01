import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { STARTING_TIME, BID_EXTENSION } from '../lib/constants';

export function useAuction(roomId, isHost) {
  const [auction, setAuction] = useState(null);
  const [bids, setBids] = useState([]);
  const [timeLeft, setTimeLeft] = useState(STARTING_TIME);
  const [showSold, setShowSold] = useState(false);
  const timerRef = useRef(null);

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
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'auctions',
          filter: 'room_id=eq.' + roomId,
        },
        (payload) => {
          const updated = payload.new;

          setAuction((prev) => {
            // If this is a new auction we haven't seen, trigger a full refetch
            if (!prev || prev.id !== updated.id) {
              fetchAuction();
              return prev;
            }
            // For updates to the current auction, merge but preserve movies
            return {
              ...prev,
              ...updated,
              movies: prev?.movies || updated.movies,
            };
          });

          if (updated.status === 'sold') {
            setShowSold(true);
            setTimeout(() => setShowSold(false), 2500);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, fetchAuction]);

  // Real-time: new bids
  useEffect(() => {
    if (!auction) return;

    const channel = supabase
      .channel('bids-' + auction.id)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'bids',
          filter: 'auction_id=eq.' + auction.id,
        },
        async (payload) => {
          // Fetch the full bid with player info
          const { data } = await supabase
            .from('bids')
            .select('*, players(name, color)')
            .eq('id', payload.new.id)
            .single();

          if (data) {
            setBids((prev) => [data, ...prev]);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [auction?.id]);

  // Timer logic — computed from timestamps
  useEffect(() => {
    if (!auction || auction.status !== 'active') {
      clearInterval(timerRef.current);
      if (auction?.status === 'sold' || auction?.status === 'no_sale') {
        setTimeLeft(0);
      }
      return;
    }

    const tick = () => {
      const lastEvent = auction.last_bid_at || auction.started_at;
      if (!lastEvent) return;

      const elapsed = (Date.now() - new Date(lastEvent).getTime()) / 1000;
      const remaining = Math.max(0, Math.ceil(STARTING_TIME - elapsed));
      setTimeLeft(remaining);

      if (remaining <= 0 && isHost) {
        // Host is responsible for ending the auction
        endAuction('sold');
      }
    };

    tick(); // Immediate tick
    timerRef.current = setInterval(tick, 200); // Update 5x/sec for smooth countdown

    return () => clearInterval(timerRef.current);
  }, [
    auction?.id,
    auction?.status,
    auction?.last_bid_at,
    auction?.started_at,
    isHost,
  ]);

  // Start a new auction (host only)
  const startAuction = useCallback(
    async (movieId) => {
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
    },
    [isHost, roomId]
  );

  // Place a bid
  const placeBid = useCallback(
    async (playerId, amount) => {
      if (!auction || auction.status !== 'active') return;

      // Check minimum bid
      const currentHigh = bids.length > 0 ? bids[0].amount : 0;
      if (amount <= currentHigh) return;

      // Insert bid
      const { error: bidErr } = await supabase.from('bids').insert({
        auction_id: auction.id,
        player_id: playerId,
        amount,
      });

      if (bidErr) {
        console.error('Bid failed:', bidErr.message);
        return;
      }

      // Update last_bid_at — this resets the timer for everyone
      // Cap at STARTING_TIME by setting last_bid_at to now
      const now = new Date().toISOString();
      await supabase
        .from('auctions')
        .update({ last_bid_at: now })
        .eq('id', auction.id);
    },
    [auction, bids]
  );

  // End auction (host only)
  const endAuction = useCallback(
    async (status = 'sold') => {
      if (!auction) return;

      clearInterval(timerRef.current);

      const finalStatus = bids.length > 0 ? status : 'no_sale';

      await supabase
        .from('auctions')
        .update({
          status: finalStatus,
          ended_at: new Date().toISOString(),
        })
        .eq('id', auction.id);

      // If sold, create a result
      if (finalStatus === 'sold' && bids.length > 0) {
        const winningBid = bids[0]; // Bids are sorted desc by created_at
        await supabase.from('results').insert({
          room_id: roomId,
          movie_id: auction.movie_id,
          player_id: winningBid.player_id,
          bid_amount: winningBid.amount,
        });
      }

      setShowSold(finalStatus === 'sold');
      if (finalStatus === 'sold') {
        setTimeout(() => setShowSold(false), 2500);
      }
    },
    [auction, bids, roomId]
  );

  // End early (host only)
  const endEarly = useCallback(async () => {
    await endAuction(bids.length > 0 ? 'sold' : 'no_sale');
  }, [endAuction, bids]);

  // Reset for next movie
  const resetAuction = useCallback(() => {
    setAuction(null);
    setBids([]);
    setTimeLeft(STARTING_TIME);
    setShowSold(false);
  }, []);

  const currentHigh = bids.length > 0 ? bids[0] : null;
  const isActive = auction?.status === 'active';
  const isFinished =
    auction?.status === 'sold' || auction?.status === 'no_sale';

  return {
    auction,
    bids,
    timeLeft,
    currentHigh,
    isActive,
    isFinished,
    showSold,
    startAuction,
    placeBid,
    endEarly,
    endAuction,
    resetAuction,
    refetch: fetchAuction,
  };
}
