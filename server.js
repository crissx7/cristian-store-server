
const http = require("node:http");

const PORT = process.env.PORT || 3000;
const HEXZ_KEY = process.env.HEXZ_LLAVE;
const HEXZ_URL = "https://hexzrecargas.com/api/v1";

const requests = new Map();

function send(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    return send(res, 200, { ok: true });
  }

  if (req.method === "GET" && req.url === "/health") {
    return send(res, 200, { status: "ok" });
  }

  if (req.method !== "POST" ||
      req.url !== "/api/validate-player") {
    return send(res, 404, { error: "Ruta no encontrada" });
  }

  if (!HEXZ_KEY) {
    return send(res, 500, { error: "Falta configurar la llave privada" });
  }

  // Límite básico para evitar demasiadas consultas
  const ip = req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const previous = requests.get(ip) || [];
  const recent = previous.filter(t => now - t < 60000);

  if (recent.length >= 10) {
    return send(res, 429, {
      error: "Demasiadas consultas. Espera un minuto."
    });
  }

  recent.push(now);
  requests.set(ip, recent);

  try {
    let body = "";

    for await (const chunk of req) {
      body += chunk;
      if (body.length > 5000) {
        return send(res, 413, { error: "Solicitud demasiado grande" });
      }
    }

    const data = JSON.parse(body);
    const playerId = String(data.player_id || "").trim();

    if (!/^[0-9]{8,12}$/.test(playerId)) {
      return send(res, 400, {
        error: "Escribe un ID válido de 8 a 12 números."
      });
    }

    const response = await fetch(
      HEXZ_URL + "/player/validate",
      {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + HEXZ_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          game: "ff",
          player_id: playerId
        }),
        signal: AbortSignal.timeout(40000)
      }
    );

    const result = await response.json();

    if (!response.ok) {
      return send(res, response.status, {
        error: result.error?.message_es ||
               "Hexz no pudo verificar el jugador.",
        code: result.error?.code || "hexz_error"
      });
    }

    return send(res, 200, {
      status: result.status,
      valid: result.valid === true,
      player_id: result.player_id || playerId,
      player_name: result.player_name || null,
      region: result.region || null,
      items_deliverable: result.items_deliverable ?? null,
      retry_after: result.retry_after || null
    });

  } catch (error) {
    console.error("Error:", error.message);

    return send(res, 500, {
      error: "No se pudo completar la verificación."
    });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("CRISTIAN STORE servidor iniciado en puerto " + PORT);
});
          
