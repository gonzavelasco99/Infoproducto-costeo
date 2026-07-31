import type { Pool, PoolClient } from "pg";
export declare function withTenantTransaction<T>(pool: Pool, empresaId: string, operation: (client: PoolClient) => Promise<T>): Promise<T>;
