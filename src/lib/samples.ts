import type { SchemaPreset } from "@/types/schema";

export const starterDbml = `Table users {
  id uuid [primary key]
  email varchar [not null, unique]
  full_name varchar
  created_at timestamp
}

Table orders {
  id uuid [primary key]
  user_id uuid [ref: > users.id]
  status varchar
  total decimal
  created_at timestamp
}

Table products {
  id uuid [primary key]
  sku varchar [not null, unique]
  name varchar
  price decimal
  stock integer
}

Table order_items {
  id uuid [primary key]
  order_id uuid [ref: > orders.id]
  product_id uuid [ref: > products.id]
  quantity integer
  unit_price decimal
}`;

export const ecommerceSql = `CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  full_name VARCHAR(160),
  created_at TIMESTAMP
);

CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  status VARCHAR(40),
  total DECIMAL(12, 2),
  created_at TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE products (
  id INTEGER PRIMARY KEY,
  sku VARCHAR(80) NOT NULL UNIQUE,
  name VARCHAR(160),
  price DECIMAL(12, 2),
  stock INTEGER
);

CREATE TABLE order_items (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  quantity INTEGER,
  unit_price DECIMAL(12, 2),
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);`;

export const marketplacePostgres = `CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE public.accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'starter',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES public.accounts(id),
  email CITEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL,
  owner_id UUID NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT projects_account_fk FOREIGN KEY (account_id) REFERENCES public.accounts(id),
  CONSTRAINT projects_owner_fk FOREIGN KEY (owner_id) REFERENCES public.members(id)
);

CREATE TABLE public.deployments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES public.projects(id),
  status TEXT NOT NULL DEFAULT 'queued',
  commit_sha TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);`;

export const samplePresets: SchemaPreset[] = [
  {
    id: "dbml-commerce",
    name: "Commerce DBML",
    description: "Users, orders, products, and line items.",
    format: "dbml",
    code: starterDbml
  },
  {
    id: "sql-commerce",
    name: "Commerce SQL",
    description: "Generic SQL DDL with table-level foreign keys.",
    format: "sql",
    code: ecommerceSql
  },
  {
    id: "postgres-saas",
    name: "SaaS PostgreSQL",
    description: "Public schema, UUIDs, constraints, and defaults.",
    format: "postgresql",
    code: marketplacePostgres
  }
];

export const formatLabels = {
  ui: "UI",
  dbml: "DBML",
  sql: "SQL",
  postgresql: "PostgreSQL"
} as const;
