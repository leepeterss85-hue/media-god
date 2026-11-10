import { createHash, createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';

// A new 256-bit device capability, independent of legacy Base44 guest keys.
// Only its hash names the record; credentials are encrypted using the capability.
export async function deviceClient(header, directory = process.env.GUEST_DATA_DIR) {
  const match = /^Device ([a-f0-9]{64})$/.exec(String(header || ''));
  if (!match || !directory) return null;
  const capability = match[1];
  const id = createHash('sha256').update('media-god-device-id:' + capability).digest('hex');
  const key = createHash('sha256').update('media-god-device-encryption:' + capability).digest();
  const file = `${directory}/${id}.json`;
  await mkdir(directory, { recursive: true, mode: 0o700 });
  async function read() {
    try {
      const packed = Buffer.from(await readFile(file, 'utf8'), 'base64');
      const decipher = createDecipheriv('aes-256-gcm', key, packed.subarray(0, 12));
      decipher.setAuthTag(packed.subarray(12, 28));
      return JSON.parse(Buffer.concat([decipher.update(packed.subarray(28)), decipher.final()]).toString());
    } catch (error) {
      if (error.code === 'ENOENT') return { user: { id: `device-${id}` }, links: [] };
      throw new Error('Device connection storage unavailable.');
    }
  }
  async function save(record) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const data = Buffer.concat([cipher.update(JSON.stringify(record)), cipher.final()]);
    const temp = `${file}.${randomUUID()}.tmp`;
    await writeFile(temp, Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64'), { mode: 0o600 });
    await rename(temp, file);
  }
  const client = {
    auth: {
      me: async () => (await read()).user,
      updateMe: async patch => {
        const record = await read();
        record.user = { ...record.user, ...patch, id: `device-${id}` };
        await save(record);
        return record.user;
      },
    },
    entities: {
      Addon: { list: async () => [] },
      RdLink: {
        filter: async (query = {}) => (await read()).links.filter(row => Object.entries(query).every(([k,v]) => row[k] === v)),
        create: async data => {
          const record = await read();
          const row = { ...data, id: randomUUID(), created_date: new Date().toISOString() };
          record.links.push(row);
          record.links = record.links.slice(-500);
          await save(record); return row;
        },
        update: async (linkId, patch) => {
          const record = await read();
          const row = record.links.find(row => row.id === linkId);
          if (!row) throw new Error('Device link not found');
          Object.assign(row, patch, { id: linkId });
          await save(record); return row;
        },
        delete: async linkId => {
          const record = await read();
          record.links = record.links.filter(row => row.id !== linkId);
          await save(record); return {};
        },
      },
    },
  };
  return { client, user: await client.auth.me() };
}
