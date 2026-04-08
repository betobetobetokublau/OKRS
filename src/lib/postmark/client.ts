import { ServerClient } from 'postmark';

let client: ServerClient | null = null;

export function getPostmarkClient(): ServerClient {
  if (!client) {
    client = new ServerClient(process.env.POSTMARK_SERVER_TOKEN!);
  }
  return client;
}
