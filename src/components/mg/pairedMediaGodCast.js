/**
 * Media God-to-Media God handoff. The receiving device resolves video with its
 * own Media God player. Never put temporary signed URLs, torrent magnets,
 * authentication headers or Real-Debrid tokens in a publicly readable
 * PlayerRemoteSession command.
 */
export const PAIRING_STORAGE_KEY = "mg:paired-media-god-receiver-v1";

export const pairingCodeFromInput = (input, origin = "") => {
  const value = String(input || "").trim();
  if (!value) return "";
  let token = value;
  if (/^https?:\/\//i.test(value)) {
    try {
      const parsed = new URL(value);
      if (origin && parsed.origin !== origin) return "";
      const match = /^\/remote\/([a-z0-9]{25,100})\/?$/i.exec(parsed.pathname);
      token = match?.[1] || "";
    } catch {
      return "";
    }
  }
  return /^[a-z0-9]{25,100}$/i.test(token) ? token : "";
};

export const receiverOnline = (session, now = Date.now()) => {
  if (!session?.id || !pairingCodeFromInput(session.session_code)) return false;
  const expiry = Date.parse(String(session.expires_at || ""));
  const heartbeat = Date.parse(String(session.last_seen_at || ""));
  return Number.isFinite(expiry) && expiry > now &&
    Number.isFinite(heartbeat) && heartbeat <= now + 5000 &&
    now - heartbeat < 35000;
};

const positiveInteger = (value) => {
  const num = Number(value);
  return Number.isInteger(num) && num > 0 ? num : 0;
};

export const mediaGodHandoffCommand = (media = {}) => {
  if (media.live === true) {
    const name = String(media.title || "").trim();
    if (!name) throw new Error("Select a Live TV channel on the sending device.");
    return { command: "play_live", value: JSON.stringify({
      name: name.slice(0, 180),
      id: String(media.channelId || "").slice(0, 160),
    }) };
  }
  const tmdbId = positiveInteger(media.tmdbId);
  const title = String(media.title || "").trim();
  const mediaType = media.mediaType === "tv" ? "tv" : "movie";
  if (!tmdbId || !title) {
    throw new Error("This player has no matching catalogue title. Open the movie or episode details first.");
  }
  const season = positiveInteger(media.season);
  const episode = positiveInteger(media.episode);
  if (mediaType === "tv" && (!season || !episode)) {
    throw new Error("Choose the TV season and episode before sending to another device.");
  }
  const time = Number(media.startTime || 0);
  // Identity and optional resume time are safe to share within a short-lived
  // paired session; the actual stream is always resolved by the receiver.
  return { command: "play_media", value: JSON.stringify({
    tmdbId, title: title.slice(0, 180),
    year: String(media.year || "").slice(0, 8),
    poster: String(media.poster || "").slice(0, 500),
    mediaType, ...(mediaType === "tv" ? { season, episode } : {}),
    startTime: Number.isFinite(time) && time > 0 ? Math.floor(time) : 0,
  }) };
};
