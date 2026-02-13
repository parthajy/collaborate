import type { SSEEvent } from "./types";

// Map of space slugs to connected SSE clients
type SSEClient = {
  id: string;
  controller: ReadableStreamDefaultController<Uint8Array>;
};

const clients = new Map<string, Set<SSEClient>>();

// Generate unique client ID
let clientIdCounter = 0;
function generateClientId(): string {
  return `client-${++clientIdCounter}-${Date.now()}`;
}

// Subscribe a client to a space
export function subscribe(
  slug: string,
  controller: ReadableStreamDefaultController<Uint8Array>
): string {
  const clientId = generateClientId();

  if (!clients.has(slug)) {
    clients.set(slug, new Set());
  }

  clients.get(slug)!.add({ id: clientId, controller });

  console.log(`SSE: Client ${clientId} subscribed to space ${slug}`);
  return clientId;
}

// Unsubscribe a client from a space
export function unsubscribe(slug: string, clientId: string): void {
  const spaceClients = clients.get(slug);
  if (!spaceClients) return;

  for (const client of spaceClients) {
    if (client.id === clientId) {
      spaceClients.delete(client);
      console.log(`SSE: Client ${clientId} unsubscribed from space ${slug}`);
      break;
    }
  }

  // Clean up empty sets
  if (spaceClients.size === 0) {
    clients.delete(slug);
  }
}

// Broadcast an event to all clients in a space
export function broadcast(slug: string, event: SSEEvent, excludeClientId?: string): void {
  const spaceClients = clients.get(slug);
  if (!spaceClients || spaceClients.size === 0) return;

  const encoder = new TextEncoder();
  const data = `data: ${JSON.stringify(event)}\n\n`;
  const encodedData = encoder.encode(data);

  const deadClients: SSEClient[] = [];

  for (const client of spaceClients) {
    if (excludeClientId && client.id === excludeClientId) continue;

    try {
      client.controller.enqueue(encodedData);
    } catch (error) {
      // Client disconnected
      console.log(`SSE: Client ${client.id} disconnected (error during broadcast)`);
      deadClients.push(client);
    }
  }

  // Clean up dead clients
  for (const client of deadClients) {
    spaceClients.delete(client);
  }

  if (spaceClients.size === 0) {
    clients.delete(slug);
  }
}

// Get count of connected clients for a space
export function getClientCount(slug: string): number {
  return clients.get(slug)?.size ?? 0;
}
