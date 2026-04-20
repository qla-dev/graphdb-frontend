import type { AiProviderResponse, SchemaCodeFormat } from "@/types/schema";
import type {
  AiSchemaProvider,
  GenerateSchemaRequest
} from "@/lib/ai/provider";

type EntityKey =
  | "users"
  | "orders"
  | "products"
  | "categories"
  | "payments"
  | "subscriptions"
  | "posts"
  | "comments"
  | "teams"
  | "members"
  | "audit";

const entityOrder: EntityKey[] = [
  "users",
  "teams",
  "members",
  "categories",
  "products",
  "orders",
  "payments",
  "subscriptions",
  "posts",
  "comments",
  "audit"
];

const dbmlBlocks: Record<EntityKey, string> = {
  users: `Table users {
  id uuid [primary key]
  email varchar [not null, unique]
  full_name varchar
  created_at timestamp
}`,
  teams: `Table teams {
  id uuid [primary key]
  name varchar [not null]
  owner_id uuid [ref: > users.id]
  created_at timestamp
}`,
  members: `Table members {
  id uuid [primary key]
  team_id uuid [ref: > teams.id]
  user_id uuid [ref: > users.id]
  role varchar
  joined_at timestamp
}`,
  categories: `Table categories {
  id uuid [primary key]
  name varchar [not null]
  slug varchar [not null, unique]
}`,
  products: `Table products {
  id uuid [primary key]
  category_id uuid [ref: > categories.id]
  sku varchar [not null, unique]
  name varchar
  price decimal
  stock integer
}`,
  orders: `Table orders {
  id uuid [primary key]
  user_id uuid [ref: > users.id]
  status varchar
  total decimal
  created_at timestamp
}`,
  payments: `Table payments {
  id uuid [primary key]
  order_id uuid [ref: > orders.id]
  provider varchar
  amount decimal
  status varchar
  paid_at timestamp
}`,
  subscriptions: `Table subscriptions {
  id uuid [primary key]
  user_id uuid [ref: > users.id]
  plan varchar
  status varchar
  renews_at timestamp
}`,
  posts: `Table posts {
  id uuid [primary key]
  author_id uuid [ref: > users.id]
  title varchar
  body text
  published_at timestamp
}`,
  comments: `Table comments {
  id uuid [primary key]
  post_id uuid [ref: > posts.id]
  author_id uuid [ref: > users.id]
  body text
  created_at timestamp
}`,
  audit: `Table audit_events {
  id uuid [primary key]
  actor_id uuid [ref: > users.id]
  action varchar
  entity varchar
  created_at timestamp
}`
};

const sqlBlocks: Record<EntityKey, string> = {
  users: `CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  full_name VARCHAR(160),
  created_at TIMESTAMP
);`,
  teams: `CREATE TABLE teams (
  id UUID PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  owner_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP
);`,
  members: `CREATE TABLE members (
  id UUID PRIMARY KEY,
  team_id UUID NOT NULL,
  user_id UUID NOT NULL,
  role VARCHAR(40),
  joined_at TIMESTAMP,
  FOREIGN KEY (team_id) REFERENCES teams(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);`,
  categories: `CREATE TABLE categories (
  id UUID PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  slug VARCHAR(180) NOT NULL UNIQUE
);`,
  products: `CREATE TABLE products (
  id UUID PRIMARY KEY,
  category_id UUID REFERENCES categories(id),
  sku VARCHAR(80) NOT NULL UNIQUE,
  name VARCHAR(160),
  price DECIMAL(12, 2),
  stock INTEGER
);`,
  orders: `CREATE TABLE orders (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  status VARCHAR(40),
  total DECIMAL(12, 2),
  created_at TIMESTAMP
);`,
  payments: `CREATE TABLE payments (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id),
  provider VARCHAR(60),
  amount DECIMAL(12, 2),
  status VARCHAR(40),
  paid_at TIMESTAMP
);`,
  subscriptions: `CREATE TABLE subscriptions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  plan VARCHAR(80),
  status VARCHAR(40),
  renews_at TIMESTAMP
);`,
  posts: `CREATE TABLE posts (
  id UUID PRIMARY KEY,
  author_id UUID NOT NULL REFERENCES users(id),
  title VARCHAR(220),
  body TEXT,
  published_at TIMESTAMP
);`,
  comments: `CREATE TABLE comments (
  id UUID PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES posts(id),
  author_id UUID NOT NULL REFERENCES users(id),
  body TEXT,
  created_at TIMESTAMP
);`,
  audit: `CREATE TABLE audit_events (
  id UUID PRIMARY KEY,
  actor_id UUID REFERENCES users(id),
  action VARCHAR(80),
  entity VARCHAR(120),
  created_at TIMESTAMP
);`
};

function toPostgres(block: string) {
  return block
    .replaceAll(
      "UUID PRIMARY KEY",
      "UUID PRIMARY KEY DEFAULT gen_random_uuid()"
    )
    .replaceAll("TIMESTAMP", "TIMESTAMPTZ")
    .replace(/VARCHAR\(\d+\)/g, "TEXT")
    .replaceAll("VARCHAR", "TEXT");
}

function pickEntities(prompt: string) {
  const lower = prompt.toLowerCase();
  const picked = new Set<EntityKey>();

  for (const key of entityOrder) {
    if (lower.includes(key) || lower.includes(key.replace(/s$/, ""))) {
      picked.add(key);
    }
  }

  if (
    lower.includes("commerce") ||
    lower.includes("shop") ||
    lower.includes("store")
  ) {
    picked.add("users");
    picked.add("categories");
    picked.add("products");
    picked.add("orders");
    picked.add("payments");
  }

  if (lower.includes("blog") || lower.includes("social")) {
    picked.add("users");
    picked.add("posts");
    picked.add("comments");
  }

  if (
    lower.includes("saas") ||
    lower.includes("team") ||
    lower.includes("organization")
  ) {
    picked.add("users");
    picked.add("teams");
    picked.add("members");
    picked.add("audit");
  }

  if (picked.size === 0) {
    picked.add("users");
    picked.add("orders");
  }

  if (picked.has("orders")) {
    picked.add("users");
  }
  if (picked.has("products")) {
    picked.add("categories");
  }
  if (picked.has("payments")) {
    picked.add("orders");
    picked.add("users");
  }
  if (picked.has("comments")) {
    picked.add("posts");
    picked.add("users");
  }
  if (picked.has("members")) {
    picked.add("teams");
    picked.add("users");
  }

  return entityOrder.filter((key) => picked.has(key));
}

function render(format: SchemaCodeFormat, entities: EntityKey[]) {
  const blocks = format === "dbml" ? dbmlBlocks : sqlBlocks;
  const body = entities.map((entity) => blocks[entity]).join("\n\n");

  if (format === "postgresql") {
    return `CREATE EXTENSION IF NOT EXISTS pgcrypto;\n\n${body
      .split("\n\n")
      .map(toPostgres)
      .join("\n\n")}`;
  }

  return body;
}

export const mockAiProvider: AiSchemaProvider = {
  id: "mock-local",
  label: "Local Mock",
  async generateSchema(
    request: GenerateSchemaRequest
  ): Promise<AiProviderResponse> {
    await new Promise((resolve) => window.setTimeout(resolve, 500));

    const entities = pickEntities(request.prompt);
    const code = render(request.format, entities);

    return {
      code,
      format: request.format,
      summary: `Generated ${entities.length} table${entities.length === 1 ? "" : "s"} from the local mock provider.`
    };
  }
};
