import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  username: text('username').notNull().unique(),
  displayName: text('display_name').notNull(),
  bio: text('bio').notNull().default(''),
  avatarKey: text('avatar_key'),
  coverKey: text('cover_key'),
  chatgptId: text('chatgpt_id').unique(),
  private: integer('private').notNull().default(0),
  role: text('role').notNull().default('user'),
  suspended: integer('suspended').notNull().default(0),
  termsAcceptedAt: integer('terms_accepted_at').notNull(),
  createdAt: integer('created_at').notNull(),
});
export const credentials = sqliteTable('credentials', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  passwordHash: text('password_hash').notNull(),
});
export const sessions = sqliteTable(
  'sessions',
  {
    hash: text('hash').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    authMethod: text('auth_method').notNull().default('password'),
    createdAt: integer('created_at').notNull(),
    expiresAt: integer('expires_at').notNull(),
  },
  (t) => [index('sessions_user').on(t.userId), index('sessions_expiry').on(t.expiresAt)],
);
export const loginFlows = sqliteTable('login_flows', {
  id: text('id').primaryKey(),
  challenge: text('challenge').notNull(),
  state: text('state').notNull(),
  native: integer('native').notNull().default(0),
  termsAccepted: integer('terms_accepted').notNull().default(0),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: integer('expires_at').notNull(),
});
export const authCodes = sqliteTable('auth_codes', {
  hash: text('hash').primaryKey(),
  flowId: text('flow_id')
    .notNull()
    .unique()
    .references(() => loginFlows.id, { onDelete: 'cascade' }),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: integer('expires_at').notNull(),
});
export const follows = sqliteTable(
  'follows',
  {
    followerId: text('follower_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    followeeId: text('followee_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: text('status').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.followerId, t.followeeId] }),
    index('follows_target').on(t.followeeId, t.status),
  ],
);
export const blocks = sqliteTable(
  'blocks',
  {
    blockerId: text('blocker_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    blockedId: text('blocked_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.blockerId, t.blockedId] })],
);
export const media = sqliteTable(
  'media',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    key: text('key').notNull().unique(),
    bytes: integer('bytes').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('media_owner').on(t.ownerId)],
);
export const posts = sqliteTable(
  'posts',
  {
    id: text('id').primaryKey(),
    authorId: text('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    audience: text('audience').notNull().default('public'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('posts_feed').on(t.createdAt), index('posts_author').on(t.authorId, t.createdAt)],
);
export const postMedia = sqliteTable(
  'post_media',
  {
    postId: text('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    mediaId: text('media_id')
      .notNull()
      .references(() => media.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.postId, t.mediaId] }),
    uniqueIndex('media_one_post').on(t.mediaId),
  ],
);
export const comments = sqliteTable(
  'comments',
  {
    id: text('id').primaryKey(),
    postId: text('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    authorId: text('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('comments_post').on(t.postId, t.createdAt)],
);
export const reactions = sqliteTable(
  'reactions',
  {
    postId: text('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    reaction: text('reaction').notNull(),
  },
  (t) => [primaryKey({ columns: [t.postId, t.userId] })],
);
export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(),
  directKey: text('direct_key').notNull().unique(),
  createdAt: integer('created_at').notNull(),
});
export const members = sqliteTable(
  'members',
  {
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    lastReadAt: integer('last_read_at').notNull().default(0),
    lastReadId: text('last_read_id').notNull().default(''),
  },
  (t) => [
    primaryKey({ columns: [t.conversationId, t.userId] }),
    index('members_user').on(t.userId),
  ],
);
export const messages = sqliteTable(
  'messages',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    authorId: text('author_id').references(() => users.id, { onDelete: 'set null' }),
    clientId: text('client_id').notNull(),
    body: text('body').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('message_idempotency').on(t.conversationId, t.authorId, t.clientId),
    index('messages_conversation').on(t.conversationId, t.createdAt, t.id),
  ],
);
export const reports = sqliteTable(
  'reports',
  {
    id: text('id').primaryKey(),
    reporterId: text('reporter_id').references(() => users.id, { onDelete: 'set null' }),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    reason: text('reason').notNull(),
    status: text('status').notNull().default('open'),
    createdAt: integer('created_at').notNull(),
    resolvedBy: text('resolved_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (t) => [index('reports_status').on(t.status, t.createdAt)],
);
export const deletionRequests = sqliteTable('deletion_requests', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  note: text('note').notNull().default(''),
  status: text('status').notNull().default('open'),
  createdAt: integer('created_at').notNull(),
});
export const pendingMediaDeletes = sqliteTable('pending_media_deletes', {
  key: text('key').primaryKey(),
  createdAt: integer('created_at').notNull(),
});
export const rateLimits = sqliteTable('rate_limits', {
  key: text('key').primaryKey(),
  count: integer('count').notNull(),
  expiresAt: integer('expires_at').notNull(),
});
export const realtimeOutbox = sqliteTable('realtime_outbox', {
  id: text('id').primaryKey(),
  channels: text('channels').notNull(),
  createdAt: integer('created_at').notNull(),
  attempts: integer('attempts').notNull().default(0),
  nextAttemptAt: integer('next_attempt_at').notNull().default(0),
  leaseUntil: integer('lease_until').notNull().default(0),
});
