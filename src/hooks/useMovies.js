import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

export function useMovies(roomId) {
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef(null);

  const fetchMovies = useCallback(async () => {
    if (!roomId) return;

    const { data } = await supabase
      .from('movies')
      .select('*')
      .eq('room_id', roomId)
      .order('release_date')
      .order('title');

    setMovies(data || []);
    setLoading(false);
  }, [roomId]);

  useEffect(() => {
    fetchMovies();
  }, [fetchMovies]);

  // Poll every 2 seconds for movie updates
  useEffect(() => {
    if (!roomId) return;
    pollRef.current = setInterval(fetchMovies, 2000);
    return () => clearInterval(pollRef.current);
  }, [roomId, fetchMovies]);

  const addMovie = useCallback(async (title, releaseDate, mojoSlug) => {
    if (!roomId) return;

    const { data, error } = await supabase
      .from('movies')
      .insert({
        room_id: roomId,
        title: title.trim(),
        release_date: releaseDate,
        mojo_slug: mojoSlug || null,
      })
      .select()
      .single();

    if (!error && data) {
      // Immediately add to local state
      setMovies(prev => [...prev, data].sort((a, b) => {
        const d = new Date(a.release_date) - new Date(b.release_date);
        return d !== 0 ? d : a.title.localeCompare(b.title);
      }));
    }
    return { data, error };
  }, [roomId]);

  const removeMovie = useCallback(async (movieId) => {
    await supabase.from('movies').delete().eq('id', movieId);
    setMovies(prev => prev.filter(m => m.id !== movieId));
  }, []);

  return { movies, loading, addMovie, removeMovie, refetch: fetchMovies };
}
