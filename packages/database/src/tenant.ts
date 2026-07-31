import type { Pool, PoolClient } from "pg";

export async function withTenantTransaction<T>(
  pool: Pool,
  empresaId: string,
  operation: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select set_config('app.empresa_id', $1, true)", [empresaId]);
    const result = await operation(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
