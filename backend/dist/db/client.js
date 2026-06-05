"use strict";
/**
 * Aurora DSQL database pool.
 *
 * Uses the official AWS Aurora DSQL connector for node-postgres which
 * automatically generates and refreshes IAM auth tokens on every connection.
 * No static password or manual token rotation needed.
 *
 * Required Lambda environment variables:
 *   DSQL_ENDPOINT   — e.g. abc123.dsql.us-east-1.on.aws
 *   DSQL_REGION     — e.g. us-east-1   (optional — auto-detected from endpoint)
 *
 * For local development, set DATABASE_URL instead and the code falls back
 * to a plain pg Pool (no IAM auth, no SSL).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.pool = void 0;
const pg_1 = require("pg");
const aurora_dsql_node_postgres_connector_1 = require("@aws/aurora-dsql-node-postgres-connector");
// ─── Determine environment ────────────────────────────────────────────────────
const dsqlEndpoint = process.env.DSQL_ENDPOINT ?? '';
const dsqlRegion = process.env.DSQL_REGION ?? 'us-east-1';
const databaseUrl = process.env.DATABASE_URL ?? '';
// Use Aurora DSQL connector when DSQL_ENDPOINT is set (Lambda/production).
// Fall back to plain pg Pool for local development.
const isAuroraDsql = dsqlEndpoint.length > 0;
// ─── Pool factory ─────────────────────────────────────────────────────────────
function createPool() {
    if (isAuroraDsql) {
        // ── Aurora DSQL (Lambda / Production) ───────────────────────────────────
        // AuroraDSQLPool extends pg.Pool and auto-generates IAM tokens per connection.
        // SSL is always required and enforced by the connector.
        console.log(`[DB] Connecting to Aurora DSQL: ${dsqlEndpoint}`);
        return new aurora_dsql_node_postgres_connector_1.AuroraDSQLPool({
            host: dsqlEndpoint,
            user: 'admin', // admin = IAM admin token; any other = regular token
            database: 'postgres',
            port: 5432,
            max: 5, // small pool — Lambda concurrency limit
            idleTimeoutMillis: 10000, // release idle connections quickly between invocations
            connectionTimeoutMillis: 5000, // fail fast on cold starts
            region: dsqlRegion,
        });
    }
    // ── Local development (plain pg Pool) ─────────────────────────────────────
    console.log('[DB] Connecting to local PostgreSQL');
    return new pg_1.Pool({
        connectionString: databaseUrl,
        max: 10,
        ssl: false,
    });
}
exports.pool = createPool();
exports.pool.on('error', (err) => {
    console.error('[DB] Unexpected pool error:', err.message);
});
//# sourceMappingURL=client.js.map