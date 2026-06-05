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
import { Pool } from 'pg';
export declare const pool: Pool;
