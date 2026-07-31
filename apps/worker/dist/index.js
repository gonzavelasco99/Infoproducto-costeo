import { run } from "graphile-worker";
import { calculateRun } from "./tasks/calculate-run.js";
const connectionString = process.env.DATABASE_URL;
if (!connectionString)
    throw new Error("DATABASE_URL es obligatoria para iniciar el worker.");
const taskList = { calculate_run: calculateRun };
const runner = await run({
    connectionString,
    concurrency: Number(process.env.WORKER_CONCURRENCY ?? 2),
    pollInterval: 1000,
    noHandleSignals: false,
    taskList
});
await runner.promise;
//# sourceMappingURL=index.js.map