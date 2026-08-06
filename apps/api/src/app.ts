import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Fastify from "fastify";
import { ZodError } from "zod";
import { parseCalculationInput } from "@costeo/contracts";
import { calculate, sha256Canonical } from "@costeo/domain";

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
      redact: ["req.headers.authorization", "req.headers.cookie"]
    },
    requestIdHeader: "x-request-id"
  });

  await app.register(cors, {
    origin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
    methods: ["GET", "POST"]
  });
  await app.register(swagger, {
    openapi: {
      info: {
        title: "API de Costeo Organizacional",
        version: "0.1.0",
        description: "Contrato beta. Los decimales se serializan como strings."
      }
    }
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });

  app.get("/health", {
    schema: {
      tags: ["operacion"],
      response: {
        200: {
          type: "object",
          required: ["status", "engine_version"],
          properties: {
            status: { type: "string" },
            engine_version: { type: "string" }
          }
        }
      }
    }
  }, async () => ({ status: "ok", engine_version: "0.2.0" }));

  app.post("/v1/calculations/free", {
    schema: {
      tags: ["calculo"],
      summary: "Calcula una sesión gratuita sin persistir datos empresariales",
      description: "Valida el contrato beta, ejecuta el motor determinista y devuelve hashes reproducibles.",
      response: {
        200: { type: "object", additionalProperties: true },
        422: { type: "object", additionalProperties: true }
      }
    }
  }, async (request, reply) => {
    reply.header("cache-control", "no-store");
    try {
      const input = parseCalculationInput(request.body);
      const result = calculate(input);
      const envelope = {
        data: result,
        meta: {
          request_id: request.id,
          input_hash: await sha256Canonical(input),
          result_hash: await sha256Canonical(result)
        }
      };
      return reply.code(result.ok ? 200 : 422).send(envelope);
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.code(422).send({
          error: "CONTRACT_VALIDATION_ERROR",
          details: error.issues.map((entry) => ({
            path: `/${entry.path.join("/")}`,
            message: entry.message,
            code: entry.code
          }))
        });
      }
      throw error;
    }
  });

  return app;
}
