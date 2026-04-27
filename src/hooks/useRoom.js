import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import {
  getPlayerToken, getHostToken, setHostToken,
  setStoredRoom, setStoredPlayerId, getStoredPlayerId,
  generateRoomCode, hashPin, getNextColor,
} from '../lib/utils';

export function useRoom(roomCode) {
  const [room, setRoom] = useState(null);
  const [players, setPlayers] = useState([]);
  const [currentPlayer, setCurrentPlayer] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const pollRef = useRef(null);

  // Fetch room and players
  const fetchRoom = useCallback(async () => {
    if (!roomCode) { setLoading(false); return; }

    const { data: roomData, error: roomErr } = await supabase
      .from('rooms')
      .select('*')
      .eq('code', roomCode.toUpperCase())
      .single();

    if (roomErr || !roomData) {
      setError('Room not found');
      setLoading(false);
      return;
    }

    setRoom(roomData);

    const { data: playerData } = await supabase
      .from('players')
      .select('*')
      .eq('room_id', roomData.id)
      .eq('is_removed', false)
      .order('created_at');

    setPlayers(playerData || []);

    // Check if current browser has a player in this room
    const token = getPlayerToken();
    const existing = (playerData || []).find(p => p.browser_token === token);
    if (existing) {
      setCurrentPlayer(existing);
      setStoredPlayerId(existing.id);

      // Restore host privileges if this player is the host
      if (existing.is_host) {
        setHostToken(roomData.host_token);
        setIsHost(true);
      } else {
        setIsHost(roomData.host_token === getHostToken());
      }
    } else {
      setIsHost(roomData.host_token === getHostToken());
    }

    setLoading(false);
  }, [roomCode]);

  useEffect(() => {
    fetchRoom();
  }, [fetchRoom]);

  // Poll every 2 seconds for player updates
  useEffect(() => {
    if (!roomCode) return;
    pollRef.current = setInterval(fetchRoom, 2000);
    return () => clearInterval(pollRef.current);
  }, [roomCode, fetchRoom]);

  // Real-time subscription for players
  useEffect(() => {
    if (!room) return;

    const channel = supabase
      .channel('players-' + room.id)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'players',
        filter: 'room_id=eq.' + room.id,
      }, () => {
        fetchRoom();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [room?.id, fetchRoom]);

  // Create a new room
  const createRoom = useCallback(async (pin) => {
    const hostToken = crypto.randomUUID();
    const code = generateRoomCode();
    const pinHash = await hashPin(pin);

    const { data, error: err } = await supabase
      .from('rooms')
      .insert({
        code,
        host_token: hostToken,
        host_pin_hash: pinHash,
      })
      .select()
      .single();

    if (err) {
      setError(err.message);
      return null;
    }

    setHostToken(hostToken);
    setStoredRoom(code);
    setRoom(data);
    setIsHost(true);
    return data;
  }, []);

  // Join a room as a player
  const joinRoom = useCallback(async (name, studio, pin) => {
    if (!room) return null;

    if (room.is_locked) {
      setError('This room is locked');
      return null;
    }

    const token = getPlayerToken();
    const usedColors = players.map(p => p.color);
    const color = getNextColor(usedColors);

    let pinHash = null;
    if (pin) {
      pinHash = await hashPin(pin);
    }

    const { data, error: err } = await supabase
      .from('players')
      .insert({
        room_id: room.id,
        name: name.trim(),
        studio: studio.trim() || null,
        color,
        browser_token: token,
        is_connected: true,
        pin_hash: pinHash,
      })
      .select()
      .single();

    if (err) {
      if (err.message.includes('duplicate')) {
        setError('That name is already taken in this room');
      } else {
        setError(err.message);
      }
      return null;
    }

    setCurrentPlayer(data);
    setStoredPlayerId(data.id);
    setStoredRoom(room.code);
    return data;
  }, [room, players]);

  // Update player connection status
  const setConnected = useCallback(async (connected) => {
    if (!currentPlayer) return;
    await supabase
      .from('players')
      .update({ is_connected: connected })
      .eq('id', currentPlayer.id);
  }, [currentPlayer]);

  // Lock/unlock room (host only)
  const toggleLock = useCallback(async () => {
    if (!room || !isHost) return;
    await supabase
      .from('rooms')
      .update({ is_locked: !room.is_locked })
      .eq('id', room.id);
    setRoom(prev => ({ ...prev, is_locked: !prev.is_locked }));
  }, [room, isHost]);

  // Remove a player (host only)
  const removePlayer = useCallback(async (playerId) => {
    if (!isHost) return;
    await supabase
      .from('players')
      .update({ is_removed: true, is_connected: false })
      .eq('id', playerId);
  }, [isHost]);

  return {
    room, players, currentPlayer, isHost,
    loading, error, setError,
    createRoom, joinRoom, setConnected, toggleLock, removePlayer,
    refetch: fetchRoom,
  };
}
