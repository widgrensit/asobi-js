import { AsobiClient } from "./client.js";
import type {
  Friendship,
  AddFriendParams,
  UpdateFriendParams,
  Group,
  GroupMember,
  GroupMembersResponse,
  CreateGroupParams,
  UpdateGroupParams,
  UpdateGroupMemberRoleParams,
} from "./types.js";

const PREFIX = "/api/v1";

export class SocialApi {
  constructor(private client: AsobiClient) {}

  // Friends
  friends(): Promise<Friendship[]> {
    return this.client.get<Friendship[]>(`${PREFIX}/friends`);
  }

  addFriend(params: AddFriendParams): Promise<Friendship> {
    return this.client.post<Friendship>(`${PREFIX}/friends`, params);
  }

  updateFriend(friendId: string, params: UpdateFriendParams): Promise<Friendship> {
    return this.client.put<Friendship>(`${PREFIX}/friends/${friendId}`, params);
  }

  removeFriend(friendId: string): Promise<void> {
    return this.client.delete(`${PREFIX}/friends/${friendId}`);
  }

  // Groups
  createGroup(params: CreateGroupParams): Promise<Group> {
    return this.client.post<Group>(`${PREFIX}/groups`, params);
  }

  getGroup(id: string): Promise<Group> {
    return this.client.get<Group>(`${PREFIX}/groups/${id}`);
  }

  updateGroup(id: string, params: UpdateGroupParams): Promise<Group> {
    return this.client.put<Group>(`${PREFIX}/groups/${id}`, params);
  }

  joinGroup(id: string): Promise<Record<string, unknown>> {
    return this.client.post(`${PREFIX}/groups/${id}/join`);
  }

  leaveGroup(id: string): Promise<Record<string, unknown>> {
    return this.client.post(`${PREFIX}/groups/${id}/leave`);
  }

  groupMembers(id: string): Promise<GroupMembersResponse> {
    return this.client.get<GroupMembersResponse>(`${PREFIX}/groups/${id}/members`);
  }

  updateGroupMemberRole(
    id: string,
    playerId: string,
    params: UpdateGroupMemberRoleParams,
  ): Promise<GroupMember> {
    return this.client.put<GroupMember>(
      `${PREFIX}/groups/${id}/members/${playerId}/role`,
      params,
    );
  }

  removeGroupMember(id: string, playerId: string): Promise<Record<string, unknown>> {
    return this.client.delete(`${PREFIX}/groups/${id}/members/${playerId}`);
  }
}
