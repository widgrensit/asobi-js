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
  players: string[];
  [key: string]: unknown;
}

export interface MatchListParams {
  limit?: number;
  status?: string;
}

// --- Matchmaker ---

export interface MatchmakerAddParams {
  mode?: string;
  properties?: Record<string, unknown>;
  party?: string[];
}

export interface MatchmakerTicket {
  ticket_id: string;
  status: string;
  [key: string]: unknown;
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
  offset?: number;
}

export interface SubmitScoreParams {
  score: number;
  metadata?: Record<string, unknown>;
}

// --- Economy ---

export interface Wallet {
  currency: string;
  balance: number;
  [key: string]: unknown;
}

export interface WalletHistoryParams {
  limit?: number;
  offset?: number;
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
  item_id: string;
  quantity?: number;
}

export interface PurchaseResult {
  success: boolean;
  [key: string]: unknown;
}

// --- Inventory ---

export interface InventoryItem {
  id: string;
  item_id: string;
  quantity: number;
  [key: string]: unknown;
}

export interface ConsumeParams {
  item_id: string;
  quantity?: number;
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
  player_id: string;
  content: string;
  [key: string]: unknown;
}

export interface ChatHistoryParams {
  limit?: number;
  before?: string;
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
  offset?: number;
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
  offset?: number;
}

// --- Storage ---

export interface SaveData {
  slot: string;
  data: Record<string, unknown>;
  [key: string]: unknown;
}

export interface StorageItem {
  key: string;
  value: Record<string, unknown>;
  [key: string]: unknown;
}

export interface StorageListParams {
  limit?: number;
  offset?: number;
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

export interface EntityDelta {
  op: "add" | "update" | "remove";
  entity_id: string;
  fields?: Record<string, unknown>;
}

export interface WorldTerrainChunk {
  coords: [number, number];
  data: string;
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
}

export type WsEventType =
  | "chat.joined"
  | "chat.left"
  | "chat.message"
  | "dm.message"
  | "dm.sent"
  | "error"
  | "match.finished"
  | "match.joined"
  | "match.left"
  | "match.matchmaker_expired"
  | "match.state"
  | `match.${string}`
  | "matchmaker.queued"
  | "matchmaker.removed"
  | "notification.new"
  | "presence.updated"
  | "session.connected"
  | "session.heartbeat"
  | "vote.cast_ok"
  | "vote.veto_ok"
  | "world.finished"
  | "world.joined"
  | "world.left"
  | "world.list"
  | "world.phase_changed"
  | "world.terrain"
  | "world.tick"
  | `world.${string}`;

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

export interface ApiError {
  status: number;
  error?: string;
  errors?: Record<string, string[]>;
}
