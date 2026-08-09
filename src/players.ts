import { AsobiClient } from "./client.js";
import type { EraseAccountParams, Player, UpdatePlayerParams } from "./types.js";

const PREFIX = "/api/v1/players";

export class PlayersApi {
  constructor(private client: AsobiClient) {}

  get(id: string): Promise<Player> {
    return this.client.get<Player>(`${PREFIX}/${id}`);
  }

  update(id: string, params: UpdatePlayerParams): Promise<Player> {
    return this.client.put<Player>(`${PREFIX}/${id}`, params);
  }

  // Erase the signed-in account. Irreversible: the player row and everything
  // the server holds for it - saves, storage, inventory, wallets, leaderboard
  // entries, identities - go with it.
  //
  // Pass `password` when the account has one. A guest or a provider-only
  // account has no credential the client can re-present, so its session is the
  // whole confirmation and `{}` is correct.
  //
  // Tokens are cleared on success only, NOT in a `finally` the way logout does
  // it: a wrong password answers 401 and a mid-flight credential change answers
  // 409, and both of those leave a live account whose session must survive. The
  // server deleted the token pair inside the erase transaction, so on success
  // holding on to it would only buy a doomed refresh on the next call.
  async eraseSelf(params: EraseAccountParams = {}): Promise<void> {
    await this.client.post<{ deleted: true }>(`${PREFIX}/me/erase`, params);
    this.client.clearTokens();
  }
}
