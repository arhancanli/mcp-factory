// The calls the golden tests make and scripts/perf.mjs times. Offline: the engines run in memory.
export const SCHEMA = `CREATE TABLE users (
  id serial PRIMARY KEY,
  email text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now()
);
CREATE TABLE orders (
  id serial PRIMARY KEY,
  user_id int NOT NULL REFERENCES users(id),
  total numeric(10,2) NOT NULL,
  status text NOT NULL CHECK (status IN ('open', 'paid'))
);
INSERT INTO users (email) VALUES ('ana@example.com'), ('ben@example.com');
INSERT INTO orders (user_id, total, status) VALUES (1, 10.50, 'open'), (1, 3.00, 'paid');
`;

export const QUERIES = `-- spend per user
SELECT u.email, sum(o.total) AS spent
FROM users u LEFT JOIN orders o ON o.user_id = u.id
GROUP BY u.email
ORDER BY u.email;
SELECT u.email, o.total FROM users u JOIN orders o ON o.user_id = u.id GROUP BY u.email;
SELECT emial FROM users;
SELECT * FROM orders WHERE placed_at > DATE_SUB(NOW(), INTERVAL 7 DAY);
INSERT INTO orders (user_id, total, status) VALUES (1, 5.00, 'shipped');
INSERT INTO orders (user_id, total, status) VALUES (9, 5.00, 'open');
UPDATE orders SET status = 'paid' WHERE status = 'open' RETURNING id, status;
`;

export const PORTABLE = `CREATE TABLE events (id INTEGER PRIMARY KEY, name TEXT NOT NULL, at TEXT NOT NULL);
INSERT INTO events (name, at) VALUES ('deploy', '2026-09-01'), ('rollback', '2026-09-02');
SELECT name FROM events WHERE name ILIKE 'DEP%';
SELECT name, at FROM events ORDER BY at DESC LIMIT 1;
`;

export const SCENARIOS = [
  { label: "check_sql: seven statements against a schema with sample rows, on PostgreSQL", tool: "check_sql", args: { schema: SCHEMA, sql: QUERIES }, example: true },
  { label: "check_sql: the same SQL on PostgreSQL and SQLite, compared", tool: "check_sql", args: { sql: PORTABLE, dialect: "both" } },
  { label: "check_sql: a migration step that cannot run inside a transaction", tool: "check_sql", args: { schema: "CREATE TABLE t (email text);", sql: "BEGIN;\nCREATE INDEX CONCURRENTLY t_email ON t (email);\nCOMMIT;" } },
];
