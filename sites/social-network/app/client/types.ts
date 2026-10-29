export type Profile = {
  id: string;
  username: string;
  displayName: string;
  bio: string;
  avatarUrl: string | null;
  coverUrl: string | null;
  isPrivate: boolean;
  followerCount: number;
  followingCount: number;
  followState: string | null;
  email?: string;
  role?: string;
  chatgptLinked?: boolean;
};
export type Person = Pick<Profile, 'id' | 'username' | 'displayName'> & {
  avatarUrl?: string | null;
};
export type Post = {
  id: string;
  body: string;
  audience: string;
  author: Person;
  media: { id: string; url: string }[];
  reactions: Record<string, number>;
  reactionCount: number;
  commentCount: number;
  myReaction: string | null;
  createdAt: string;
  updatedAt: string;
};
export type Comment = { id: string; body: string; createdAt: string; author: Person };
export type Conversation = {
  id: string;
  lastMessage: string | null;
  lastAt: string | null;
  unread: number;
  peers: Person[];
};
export type Message = {
  id: string;
  body: string;
  clientId: string;
  createdAt: string;
  author: Person | null;
};
export type Page<T> = {
  data: T[];
  nextCursor: string | null;
  afterCursor?: string | null;
  hasMore?: boolean;
};
export type ReportTarget = {
  targetType: 'post' | 'comment' | 'user' | 'message';
  targetId: string;
};
