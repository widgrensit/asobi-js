// --- Auth ---

export interface RegisterParams {
  username: string;
  password: string;
  display_name?: string;
}

export interface LoginParams {
  username: string;
  password: string;
}

export interface AuthResponse {
  player_id: string;
  access_token: string;
  refresh_token: string;
  username: string;
  created?: boolean;
  guest?: boolean;
  upgraded?: boolean;
}

export interface RefreshResponse {
  access_token: string;
  refresh_token: string;
}

export interface LogoutParams {
  refresh_token?: string;
}

export interface OAuthParams {
  provider: string;
  token: string;
}

export interface GuestParams {
  device_id: string;
  device_secret: string;
}

export interface GuestUpgradeParams {
  username: string;
  password: string;
}

// A persisted-once guest keypair. Shape-compatible with GuestParams, so it can
// be handed straight to auth.guest(...).
export interface DeviceCredentials {
  device_id: string;
  device_secret: string;
}

// Minimal localStorage-shaped persistence surface. The browser `localStorage`
// satisfies it as-is; tests and non-browser hosts can inject their own.
export interface DeviceStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface DeviceOptions {
  // Storage key for the persisted pair (default "asobi.guest_device").
  key?: string;
  // Where to persist. Defaults to localStorage in a browser, else an in-memory
  // store. Inject your own for a keychain, a file, or a deterministic test store.
  store?: DeviceStore;
  // Byte source for generation. Defaults to Web Crypto getRandomValues. Must
  // return at least the requested number of bytes.
  randomBytes?: (n: number) => Uint8Array;
  // Pin the device_id explicitly instead of deriving it from random bytes.
  deviceId?: string;
}

export interface LinkProviderParams {
  provider: string;
  token: string;
}

export interface UnlinkProviderParams {
  provider: string;
}

// --- IAP ---

export interface IapAppleParams {
  signed_transaction: string;
}

export interface IapGoogleParams {
  product_id: string;
  purchase_token: string;
}

export interface IapAppleResult {
  product_id: string;
  transaction_id: string;
  original_transaction_id: string;
  purchase_date: string;
  expires_date: number;
  quantity: number;
  type: string;
  valid: boolean;
  duplicate: boolean;
}

export interface IapGoogleResult {
  product_id: string;
  order_id: string;
  purchase_time: string;
  consumption_state: number;
  acknowledged: boolean;
  valid: boolean;
  duplicate: boolean;
}

export interface IapTransaction {
  id: string;
  player_id: string;
  provider: string;
  transaction_id: string;
  original_transaction_id: string;
  product_id: string;
  inserted_at: string;
}

// --- Players ---

export interface Player {
  id: string;
  username: string;
  display_name: string;
  [key: string]: unknown;
}

// `password` is required only for an account that has one. Omit it for a guest
// or a provider-only account - there is no credential to echo.
export interface EraseAccountParams {
  password?: string;
}

export interface UpdatePlayerParams {
  display_name?: string;
  [key: string]: unknown;
}

export interface PlayerStats {
  player_id: string;
  games_played: number;
  wins: number;
  losses: number;
  rating: number;
  rating_deviation: number;
  metadata: Record<string, unknown>;
  updated_at: string;
}

export interface PlayerIdentity {
  id: string;
  player_id: string;
  provider: string;
  provider_uid: string;
  provider_email: string;
  provider_display_name: string;
  provider_metadata: Record<string, unknown>;
  inserted_at: string;
  updated_at: string;
}

// --- Matches ---

export interface Match {
  id: string;
  mode: string;
  status: string;
  /**
   * Not returned by the REST match endpoints: `public_record/1` deliberately
   * drops the roster so a finished match cannot be used to harvest player
   * ids. Present on the `match.joined` WebSocket frame, where you are a
   * member of the match.
   */
  players?: string[];
  [key: string]: unknown;
}

export interface MatchListParams {
  limit?: number;
  status?: string;
  mode?: string;
}

export interface MatchLiveParams {
  mode?: string;
  has_capacity?: boolean;
  /** Filters on the match's own joinable flag. Sent as "true"/"false". */
  joinable?: boolean;
}

/**
 * An entry of `GET /api/v1/matches/live` (and of the `match.list` WebSocket
 * reply). The live lobby serves `listing_info/1`, a whitelist projection that
 * keys the match on `match_id` and drops the roster - `id` is never present.
 */
export interface MatchListing {
  match_id: string;
  status: string;
  player_count: number;
  max_players: number;
  mode?: string;
  joinable?: boolean;
  phase?: PhaseInfo;
  [key: string]: unknown;
}

// --- Matchmaker ---

export interface MatchmakerAddParams {
  mode?: string;
  properties?: Record<string, unknown>;
}

/** The `POST /api/v1/matchmaker` reply, and the `matchmaker.queued` frame. */
export interface MatchmakerTicket {
  ticket_id: string;
  status: string;
  [key: string]: unknown;
}

/**
 * The `GET /api/v1/matchmaker/:ticket_id` reply. The status handler projects an
 * explicit five-key shape and names the ticket `id`, not `ticket_id`.
 */
export interface MatchmakerTicketStatus {
  id: string;
  mode: string;
  status: string;
  properties: Record<string, unknown>;
  submitted_at: number;
}

// --- Leaderboards ---

export interface LeaderboardEntry {
  player_id: string;
  score: number;
  rank: number;
  [key: string]: unknown;
}

export interface LeaderboardTopParams {
  limit?: number;
}

export interface SubmitScoreParams {
  score: number;
  /** Tie-breaker carried alongside the score. Defaults to 0 server-side. */
  sub_score?: number;
}

// --- Economy ---

export interface Wallet {
  currency: string;
  balance: number;
  [key: string]: unknown;
}

export interface WalletHistoryParams {
  limit?: number;
}

export interface Transaction {
  id: string;
  wallet_id: string;
  amount: number;
  balance_after: number;
  reason: string;
  reference_type: string;
  reference_id: string;
  metadata: Record<string, unknown>;
  inserted_at: string;
}

export interface StoreListing {
  id: string;
  item_def_id: string;
  currency: string;
  price: number;
  active: boolean;
  valid_from: string;
  valid_until: string;
  metadata: Record<string, unknown>;
}

export interface ItemDef {
  id: string;
  slug: string;
  name: string;
  category: string;
  rarity: "common" | "uncommon" | "rare" | "epic" | "legendary";
  stackable: boolean;
  metadata: Record<string, unknown>;
  inserted_at: string;
  updated_at: string;
}

export interface PurchaseParams {
  /** The store listing's UUID - the `id` from the browse response. */
  listing_id: string;
  quantity?: number;
}

export interface PurchaseResult {
  success: boolean;
  [key: string]: unknown;
}

// --- Inventory ---

export interface InventoryItem {
  id: string;
  /** References the item definition. The column is `item_def_id`. */
  item_def_id: string;
  quantity: number;
  [key: string]: unknown;
}

export interface ConsumeParams {
  item_id: string;
  /** Required. Omitting it is answered with `inventory.invalid_quantity`. */
  quantity: number;
}

// --- Social ---

export interface Friendship {
  id: string;
  player_id: string;
  friend_id: string;
  status: string;
  inserted_at: string;
  updated_at: string;
}

export interface AddFriendParams {
  friend_id: string;
}

export interface UpdateFriendParams {
  status: string;
}

export interface Group {
  id: string;
  name: string;
  description?: string;
  max_members?: number;
  open?: boolean;
  creator_id?: string;
  metadata?: Record<string, unknown>;
  inserted_at?: string;
  updated_at?: string;
}

export interface GroupMember {
  id: string;
  group_id: string;
  player_id: string;
  role: "owner" | "admin" | "moderator" | "member";
  joined_at: string;
}

export interface GroupMembersResponse {
  members: GroupMember[];
}

export interface CreateGroupParams {
  name: string;
  description?: string;
  max_members?: number;
  open?: boolean;
}

export interface UpdateGroupParams {
  name?: string;
  description?: string;
  max_members?: number;
  open?: boolean;
}

export interface UpdateGroupMemberRoleParams {
  role: "owner" | "admin" | "moderator" | "member";
}

// --- Chat ---

export interface ChatMessage {
  id: string;
  channel_id: string;
  /** The sender's player id. The column is `sender_id`, not `player_id`. */
  sender_id: string;
  content: string;
  [key: string]: unknown;
}

export interface ChatHistoryParams {
  limit?: number;
}

// --- Tournaments ---

export interface Tournament {
  id: string;
  name: string;
  status: string;
  [key: string]: unknown;
}

export interface TournamentListParams {
  limit?: number;
  status?: string;
}

// --- Notifications ---

export interface Notification {
  id: string;
  type: string;
  read: boolean;
  [key: string]: unknown;
}

export interface NotificationListParams {
  limit?: number;
}

// --- Storage ---

export interface SaveData {
  slot: string;
  data: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * An entry of `GET /api/v1/saves`. The list endpoint projects only
 * [slot, version, updated_at] - the `data` blob is served by `getSave` alone.
 */
export interface SaveSummary {
  slot: string;
  version: number;
  updated_at: string;
  [key: string]: unknown;
}

export interface StorageItem {
  key: string;
  value: Record<string, unknown>;
  [key: string]: unknown;
}

export type StoragePerm = "owner" | "public";

/** Per-object permissions on `PUT /api/v1/storage/:collection/:key`. */
export interface PutStorageParams {
  read_perm?: StoragePerm;
  write_perm?: StoragePerm;
}

export interface StorageListParams {
  limit?: number;
}

// --- Votes ---

export interface Vote {
  id: string;
  match_id: string;
  options: VoteOption[];
  [key: string]: unknown;
}

export interface VoteOption {
  id: string;
  label: string;
  [key: string]: unknown;
}

// --- Worlds ---

export interface PhaseInfo {
  status: "complete" | "waiting" | "active";
  phase: string | null;
  start_condition?: unknown;
  remaining_ms?: number;
  config?: Record<string, unknown>;
  timers?: Record<string, unknown>;
}

export interface WorldInfo {
  world_id: string;
  status: string;
  mode?: string;
  player_count: number;
  max_players: number;
  grid_size?: number;
  players?: string[];
  started_at?: number | null;
  phase?: PhaseInfo;
  [key: string]: unknown;
}

export interface WorldListResponse {
  worlds: WorldInfo[];
}

export interface WorldListParams {
  mode?: string;
  has_capacity?: boolean;
}

export interface CreateWorldParams {
  mode: string;
}

export interface WorldTick {
  tick: number;
  updates: EntityDelta[];
}

/**
 * One entry of a `world.tick` `updates` array. The zone serializer emits short
 * op codes - "a" added, "u" updated, "r" removed - keys the entity on `id`, and
 * merges the changed fields flat into the same object rather than nesting them.
 */
export interface EntityDelta {
  op: "a" | "u" | "r";
  id: string;
  [key: string]: unknown;
}

export interface WorldTerrainChunk {
  coords: [number, number];
  data: string;
}

// --- Match state (typed convenience over `match.state`) ---

// A single tracked thing in a match's shared state: a player, an NPC, a
// projectile, whatever the game's state callback keys by id. The
// `match.state` wire payload is entirely game-defined (asobi's game module
// `get_state/1` or `get_state/2` callback returns an arbitrary map), so
// beyond `id` every field is a passthrough from the game.
export interface Entity {
  id: string;
  [key: string]: unknown;
}

// Typed convenience view over a `match.state` frame, built by
// `AsobiWebSocket.onMatchState()`. `entities` is derived on a best-effort
// basis from a `players`- or `entities`-keyed map/array on the payload (see
// `toMatchState` in websocket.ts) since the wire shape has no fixed schema;
// `raw` is the untouched payload, so a game with its own state shape
// (score, phase, custom round data, ...) is never blocked on this helper.
// Mirrors the `MatchState.raw` escape hatch already shipped in asobi-dart.
export interface MatchState<T = unknown> {
  tick: number;
  entities: Entity[];
  raw: T;
}

// --- Direct messages ---

export interface DirectMessage {
  id?: string;
  channel_id?: string;
  sender_id?: string;
  recipient_id?: string;
  content: string;
  sent_at?: string;
  [key: string]: unknown;
}

export interface DMMessage {
  sender_id: string;
  content: string;
  sent_at: number;
  channel_id?: string;
}

export interface SendDmParams {
  recipient_id: string;
  content: string;
}

export interface DmSendResult {
  success: boolean;
  channel_id: string;
}

export interface DmHistoryResponse {
  messages: DirectMessage[];
  channel_id: string;
}

export interface DmHistoryParams {
  limit?: number;
}

// --- WebSocket ---

export interface WsMessage {
  type: string;
  payload: Record<string, unknown>;
  cid?: string;
  /**
   * Client input sequence number, threaded as a top-level sibling of
   * `payload` on a `world.input` send so the server can echo it back in a
   * `world.ack`. Stamped only when the caller supplies one; never nested.
   */
  seq?: number;
}

export type WsEventType =
  | "chat.joined"
  | "chat.left"
  | "chat.message"
  | "dm.message"
  | "dm.sent"
  | "error"
  | "game.error"
  | "game.message"
  | "module.error"
  | "module.event"
  | "module.message"
  | "match.finished"
  | "match.joined"
  | "match.left"
  | "match.list"
  | "match.matched"
  | "match.matchmaker_expired"
  | "match.matchmaker_failed"
  | "match.state"
  | "match.vote_result"
  | "match.vote_start"
  | "match.vote_tally"
  | "match.vote_vetoed"
  | `match.${string}`
  | "matchmaker.queued"
  | "matchmaker.removed"
  | "notification.new"
  | "presence.updated"
  | "rpc.error"
  | "rpc.ok"
  | "session.connected"
  | "session.heartbeat"
  | "vote.cast_ok"
  | "vote.veto_ok"
  | "world.ack"
  | "world.finished"
  | "world.joined"
  | "world.left"
  | "world.list"
  | "world.phase_changed"
  | "world.terrain"
  | "world.tick"
  | `world.${string}`;

// A Lua callback error surfaced to the player whose input triggered it.
// Dev-mode only (server gated behind ASOBI_DEV_ERRORS=true, or the
// {asobi_lua, [{dev_errors, true}]} app env); production keeps script
// errors server-side. Rate-limited to one notification per 1000ms per
// bridge process, so a broken handler under a tick-rate input loop
// yields a trickle, not a flood.
export interface GameErrorPayload {
  // Which module raised it. The server renamed these frames
  // game.* -> module.* so a second scripting runtime could use them, and
  // carries this field on both names.
  module: string;
  callback: string;
  script: string;
  message: string;
}

// Server-push event for game.send(player_id, message) calls from Lua.
// Unlike game.error, this fires unconditionally in production. `message`
// is whatever value the script passed: a string, a number, or a
// JSON object/array, so it is typed `unknown` rather than `string`.
export interface GameMessagePayload {
  module: string;
  message: unknown;
}

// A named server-push event from an extension: `module.event`. Distinct from
// module.message (an unnamed dev message): the producing extension is in
// `module`, its `<domain>.<name>` event in `event`, and `data` is always a
// JSON object. The app routes on `payload.event` - the name is data, not a
// dispatch gate, so an unfamiliar event still surfaces. Unlike module.message
// this frame has no `game.*` alias; it is a single frame.
export interface ModuleEventPayload {
  module: string;
  event: string;
  data: Record<string, unknown>;
}

/**
 * core's input-prediction ack primitive (core v0.84.0): the server confirms
 * it has consumed inputs up to `seq` as of world tick `tick`. `seq` is the
 * same counter the client stamps on its `world.input` sends (see
 * `WsMessage.seq` / `SendFireOptions.seq`).
 *
 * Addressed to one connection, sent only to a connection that stamped a
 * `seq`, and a high-water mark rather than a receipt per input: a rejected
 * input still advances it.
 *
 * Emitted per subscribed zone, not per connection, so the `seq` a client
 * receives can be lower than one it has already seen
 * (widgrensit/asobi#477). Reconcile against a running maximum: ignore any
 * ack that does not beat it, then drop every buffered input at or below the
 * new maximum. See the README's client-side prediction section.
 */
export interface WorldAckPayload {
  tick: number;
  seq: number;
}

// Maps a WsEventType to its typed payload shape, so `on()` can return a
// typed callback for events that have one instead of the generic
// Record<string, unknown>. Only events with a real payload interface
// need an entry here.
export interface WsPayloadMap {
  "game.error": GameErrorPayload;
  "game.message": GameMessagePayload;
  // The same two frames under their current names. `game.*` is the
  // deprecated alias the server still emits; both carry `module`.
  "module.error": GameErrorPayload;
  "module.message": GameMessagePayload;
  // A single frame with no `game.*` alias: a named extension push, routed by
  // the app on `payload.event`.
  "module.event": ModuleEventPayload;
  // Input-prediction ack: {tick, seq}. See WorldAckPayload.
  "world.ack": WorldAckPayload;
}

export interface TokenPair {
  accessToken?: string;
  refreshToken?: string;
}

export interface AsobiClientOptions {
  baseUrl: string;
  accessToken?: string;
  refreshToken?: string;
  onTokens?: (tokens: TokenPair) => void;
}

export interface AsobiWebSocketOptions {
  url: string;
  token: string;
  reconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  heartbeatInterval?: number;
}

export interface SendFireOptions {
  // Skip this send if its payload is structurally equal to the last payload
  // sent for the same `type`. Guards a per-frame send loop (e.g. driving
  // match input at 60fps) against flooding the socket with duplicates when
  // nothing changed. Only sends that actually reach an open socket count as
  // "last sent" — a send dropped because the socket wasn't open (see
  // `sendFire`) never counts, so the first payload after a (re)connect
  // always goes out.
  dedupe?: boolean;
  /**
   * Client input sequence number to stamp as a top-level sibling of the
   * payload frame (e.g. on a `world.input` send), so the server can echo it
   * back in a `world.ack` for prediction reconciliation. Stamped only when
   * provided; kept numeric and never nested inside `payload`.
   */
  seq?: number;
}

export interface ApiError {
  status: number;
  error?: string;
  errors?: Record<string, string[]>;
}

// --- List envelopes ---
// Every list endpoint returns an object keyed by a plural name, not a bare
// array. These methods were typed as arrays while the client returns the
// parsed body unmodified, so `.map()` on the result threw at runtime.

export interface MatchListResponse {
  matches: Match[];
}

export interface MatchLiveResponse {
  matches: MatchListing[];
}

export interface WalletsResponse {
  wallets: Wallet[];
}

export interface WalletHistoryResponse {
  transactions: Transaction[];
}

export interface StoreResponse {
  listings: StoreListing[];
}

export interface InventoryListResponse {
  items: InventoryItem[];
}

export interface FriendsResponse {
  friends: Friendship[];
}

export interface LeaderboardEntriesResponse {
  entries: LeaderboardEntry[];
}

export interface ChatHistoryResponse {
  messages: ChatMessage[];
}

export interface NotificationsResponse {
  notifications: Notification[];
}

export interface TournamentsResponse {
  tournaments: Tournament[];
}

export interface SavesResponse {
  saves: SaveSummary[];
}

export interface StorageListResponse {
  objects: StorageItem[];
}

export interface VotesResponse {
  votes: Vote[];
}
