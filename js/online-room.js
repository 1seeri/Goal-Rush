import { joinRoom, selfId } from './vendor/trystero.js';

const APP_ID = 'com.github.1seeri.goal-rush.v1';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const RELAYS = ['wss://nos.lol', 'wss://relay.primal.net', 'wss://cdn.satellite.earth', 'wss://relay.nostrmap.net', 'wss://testr.nymble.world'];
// Public experimental relay: https://gist.github.com/mondain/b0ec1cf5f60ae726202e?permalink_comment_id=3250340
const TURN = [{
  urls: [
    'turn:turn.evan-brass.net:3478',
    'turn:turn.evan-brass.net:3478?transport=tcp',
    'turns:turn.evan-brass.net:443?transport=tcp',
  ],
  username: 'user',
  credential: 'password',
}];

export function newRoomCode() {
  return Array.from(crypto.getRandomValues(new Uint8Array(6)), byte => CODE_CHARS[byte % CODE_CHARS.length]).join('');
}

export function openRoom(code, host, profile, { onChange, onClose, onLive }) {
  let failedWebRTC = false;
  const room = joinRoom({
    appId: APP_ID,
    maxReceiveBytes: 8192,
    relayConfig: { urls: RELAYS },
    turnConfig: TURN,
  }, code, {
    onJoinError: () => { failedWebRTC = true; },
  });
  const channel = room.makeAction('goal-rush');
  const local = { peer: selfId, presence: { ...profile, host } };
  let remote = null;
  let closed = false;
  let timeout;

  const send = (peer, type, data) => {
    channel.send({ type, data }, { target: peer }).catch(() => {});
  };

  const leave = () => {
    if (closed) return;
    closed = true;
    clearTimeout(timeout);
    room.onPeerJoin = room.onPeerLeave = channel.onMessage = null;
    room.leave().catch(() => {});
  };

  const fail = reason => {
    leave();
    onClose(reason);
  };

  room.onPeerJoin = peer => {
    if (!host && !remote) send(peer, 'join', local.presence);
  };

  channel.onMessage = (message, { peerId }) => {
    if (closed || !message || typeof message !== 'object') return;
    const { type, data } = message;
    if (host && type === 'join') {
      if (remote && remote.peer !== peerId) return send(peerId, 'full', null);
      if (remote) return;
      if (!data || typeof data.n !== 'string' || typeof data.t !== 'string') return;
      remote = { peer: peerId, presence: { n: data.n, t: data.t, host: false } };
      send(peerId, 'accepted', { n: local.presence.n, t: local.presence.t });
      onChange();
    } else if (!host && !remote && type === 'accepted') {
      if (!data || typeof data.n !== 'string' || typeof data.t !== 'string') return;
      clearTimeout(timeout);
      remote = { peer: peerId, presence: { ...data, host: true } };
      onChange();
    } else if (!host && !remote && type === 'full') {
      fail('full');
    } else if (remote?.peer === peerId && type === 'state' && data && typeof data === 'object') {
      const { game, rs } = data;
      remote.presence = { ...remote.presence, game: host ? null : game, rs };
      onChange();
    } else if (remote?.peer === peerId && type === 'live') {
      onLive(data);
    }
  };

  room.onPeerLeave = peer => {
    if (remote?.peer !== peer) return;
    remote = null;
    if (host) {
      Object.assign(local.presence, { game: null, rs: null });
      onClose('left');
    } else fail('left');
  };

  if (!host) timeout = setTimeout(() => fail(failedWebRTC ? 'network' : 'timeout'), 35000);

  return {
    self: selfId,
    peers: () => remote ? [local, remote] : [local],
    update(patch) {
      Object.assign(local.presence, patch);
      const { game = null, rs = null } = local.presence;
      if (remote) send(remote.peer, 'state', { game, rs });
    },
    live(data) { if (remote) send(remote.peer, 'live', data); },
    leave,
  };
}
