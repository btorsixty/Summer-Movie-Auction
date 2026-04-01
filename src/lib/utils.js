const TOKEN_KEY = 'sma_player_token';
const ROOM_KEY = 'sma_room_code';
const PLAYER_KEY = 'sma_player_id';
const HOST_KEY = 'sma_host_token';

export function getPlayerToken() {
  let token = localStorage.getItem(TOKEN_KEY);
  if (!token) {
    token = crypto.randomUUID();
    localStorage.setItem(TOKEN_KEY, token);
  }
  return token;
}

export function getStoredRoom() {
  return localStorage.getItem(ROOM_KEY);
}

export function setStoredRoom(code) {
  localStorage.setItem(ROOM_KEY, code);
}

export function clearStoredRoom() {
  localStorage.removeItem(ROOM_KEY);
  localStorage.removeItem(PLAYER_KEY);
  localStorage.removeItem(HOST_KEY);
}

export function getStoredPlayerId() {
  return localStorage.getItem(PLAYER_KEY);
}

export function setStoredPlayerId(id) {
  localStorage.setItem(PLAYER_KEY, id);
}

export function getHostToken() {
  return localStorage.getItem(HOST_KEY);
}

export function setHostToken(token) {
  localStorage.setItem(HOST_KEY, token);
}

export async function hashPin(pin) {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin + '_sma_salt_2026');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'SMA-';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export function formatMoney(n) {
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
  if (n === 0) return '—';
  return '$' + n.toLocaleString();
}

export function formatFullMoney(n) {
  return '$' + n.toLocaleString();
}

export function taxedDomestic(rawGross) {
  const t1 = 200000000;
  const t2 = 400000000;
  if (rawGross <= t1) return rawGross;
  if (rawGross <= t2) return t1 + (rawGross - t1) * 0.5;
  return t1 + (t2 - t1) * 0.5 + (rawGross - t2) * 0.25;
}

export const PLAYER_COLORS = [
  '#e63946',
  '#f4a261',
  '#2a9d8f',
  '#e9c46a',
  '#264653',
  '#9b2226',
  '#7b68ee',
  '#ff6b6b',
  '#48cae4',
  '#ff9f1c',
];

export function getNextColor(usedColors) {
  return PLAYER_COLORS.find((c) => !usedColors.includes(c)) || PLAYER_COLORS[0];
}
