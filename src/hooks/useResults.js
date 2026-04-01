import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { taxedDomestic } from '../lib/utils';

export function useResults(roomId) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchResults = useCallback(async () => {
    if (!roomId) return;

    const { data } = await supabase
      .from('results')
      .select(
        '*, movies(title, release_date, domestic_gross, mojo_slug), players(name, color, studio)'
      )
      .eq('room_id', roomId)
      .eq('status', 'active')
      .order('created_at');

    setResults(data || []);
    setLoading(false);
  }, [roomId]);

  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  // Real-time subscription
  useEffect(() => {
    if (!roomId) return;

    const channel = supabase
      .channel('results-' + roomId)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'results',
          filter: 'room_id=eq.' + roomId,
        },
        () => {
          fetchResults();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, fetchResults]);

  // Compute standings from results
  const getStandings = useCallback(
    (players) => {
      return players
        .map((player) => {
          const playerResults = results.filter(
            (r) => r.player_id === player.id
          );
          const totalSpent = playerResults.reduce(
            (s, r) => s + r.bid_amount,
            0
          );
          const rawDomestic = playerResults.reduce(
            (s, r) => s + (r.movies?.domestic_gross || 0),
            0
          );
          const totalTaxed = playerResults.reduce(
            (s, r) => s + taxedDomestic(r.movies?.domestic_gross || 0),
            0
          );
          const moviesLeft = playerResults.filter(
            (r) => (r.movies?.domestic_gross || 0) === 0
          ).length;

          const topMovie =
            playerResults.length > 0
              ? [...playerResults].sort(
                  (a, b) =>
                    (b.movies?.domestic_gross || 0) -
                    (a.movies?.domestic_gross || 0)
                )[0]
              : null;

          return {
            ...player,
            totalSpent,
            rawDomestic,
            taxedDomestic: totalTaxed,
            totalMovies: playerResults.length,
            moviesLeft,
            roi: totalSpent > 0 ? totalTaxed / totalSpent : 0,
            topMovie: topMovie?.movies || null,
            results: playerResults,
          };
        })
        .sort((a, b) => b.taxedDomestic - a.taxedDomestic);
    },
    [results]
  );

  return { results, loading, getStandings, refetch: fetchResults };
}
