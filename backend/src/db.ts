import pg, { type PoolClient } from "pg";
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
});
export type Db = Pick<PoolClient, "query">;
export async function transaction<T>(
  fn: (db: PoolClient) => Promise<T>,
): Promise<T> {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const result = await fn(db);
    await db.query("COMMIT");
    return result;
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally {
    db.release();
  }
}
export async function audit(
  db: Db,
  org: string,
  actor: string,
  action: string,
  id: string | null,
  before: unknown,
  after: unknown,
) {
  await db.query(
    "INSERT INTO audit_events(organization_id,actor,action,resource_id,before_value,after_value) VALUES($1,$2,$3,$4,$5,$6)",
    [
      org,
      actor,
      action,
      id,
      JSON.stringify(before ?? null),
      JSON.stringify(after ?? null),
    ],
  );
}
export class DomainError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}
export function ensure(
  condition: unknown,
  message: string,
  status = 409,
): asserts condition {
  if (!condition) throw new DomainError(status, message);
}
