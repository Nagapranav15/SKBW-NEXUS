/**
 * Real-time SSE (Server-Sent Events) Service for ERP Multi-User Live Sync.
 * Provides instant live updates across all connected devices when any user
 * creates, updates, or completes a transaction.
 */

const companyClients = new Map(); // companyId -> Set of express res objects

/**
 * Register a client SSE connection.
 * @param {string} companyId 
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 */
function handleSseConnection(companyId, req, res) {
  const compIdStr = companyId ? String(companyId) : "GLOBAL";

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "Access-Control-Allow-Origin": "*",
    "X-Accel-Buffering": "no"
  });

  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }

  // Initial handshake event
  res.write(`data: ${JSON.stringify({ type: "CONNECTED", companyId: compIdStr, timestamp: new Date().toISOString() })}\n\n`);

  if (!companyClients.has(compIdStr)) {
    companyClients.set(compIdStr, new Set());
  }
  const clientSet = companyClients.get(compIdStr);
  clientSet.add(res);

  // Keep-alive heartbeat every 20 seconds
  const keepAliveInterval = setInterval(() => {
    try {
      res.write(":keepalive\n\n");
    } catch (_) {
      clearInterval(keepAliveInterval);
    }
  }, 20000);

  // Cleanup on connection close
  req.on("close", () => {
    clearInterval(keepAliveInterval);
    clientSet.delete(res);
    if (clientSet.size === 0) {
      companyClients.delete(compIdStr);
    }
  });

  req.on("error", () => {
    clearInterval(keepAliveInterval);
    clientSet.delete(res);
  });
}

/**
 * Broadcasts a real-time event to all active clients of a company.
 * @param {string|ObjectId} companyId 
 * @param {{ entity: string, action: 'create'|'update'|'delete', id?: string, data?: any }} payload 
 */
function broadcast(companyId, payload) {
  const compIdStr = companyId ? String(companyId) : null;
  const messageData = `data: ${JSON.stringify({
    ...payload,
    timestamp: payload.timestamp || new Date().toISOString()
  })}\n\n`;

  const targets = [];
  if (compIdStr && companyClients.has(compIdStr)) {
    targets.push(...companyClients.get(compIdStr));
  }
  // Also push global listeners (e.g. system monitors)
  if (companyClients.has("GLOBAL")) {
    targets.push(...companyClients.get("GLOBAL"));
  }

  // If no companyId specified, broadcast to all companies
  if (!compIdStr) {
    companyClients.forEach(set => {
      targets.push(...set);
    });
  }

  for (const client of targets) {
    try {
      client.write(messageData);
    } catch (err) {
      // Remove stale client if writing fails
      companyClients.forEach(set => set.delete(client));
    }
  }
}

module.exports = {
  handleSseConnection,
  broadcast
};
