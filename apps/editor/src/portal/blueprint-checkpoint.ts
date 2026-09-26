import type { SceneDocument } from '../contracts';
import type { CatalogProduct } from '../adapters/database-catalog';
import { parseScene } from '../core/persistence';
import { isRecord } from '../core/validation';

export interface BlueprintCheckpoint { scene: SceneDocument; catalog: CatalogProduct[] }

const DATABASE = 'varpet.blueprint-checkpoints';
const STORE = 'checkpoints';

function validated(value: unknown): BlueprintCheckpoint {
  if (!isRecord(value) || !Array.isArray(value.catalog) || value.catalog.length > 1000 || value.catalog.some(product =>
    !isRecord(product) || !isRecord(product.asset) || typeof product.priceSource !== 'string'
    || typeof product.sizeStatus !== 'string' || typeof product.attribution !== 'string')) {
    throw new Error('The saved blueprint has invalid catalog data.');
  }
  const catalog = structuredClone(value.catalog) as CatalogProduct[];
  return { scene: parseScene(JSON.stringify(value.scene), catalog.map(product => product.asset)), catalog };
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('Blueprint recovery storage is unavailable in this browser.')); return; }
    const request = indexedDB.open(DATABASE, 1);
    let blocked = false;
    request.onupgradeneeded = () => { request.result.createObjectStore(STORE); };
    request.onerror = () => reject(request.error ?? new Error('Could not open blueprint recovery storage.'));
    request.onblocked = () => {
      blocked = true;
      reject(new Error('Close older Varpet tabs to make blueprint recovery storage available.'));
    };
    request.onsuccess = () => {
      const database = request.result;
      if (blocked) { database.close(); return; }
      database.onversionchange = () => database.close();
      resolve(database);
    };
  });
}

/** A successful request is not durable until its containing transaction commits. */
async function stored<T>(mode: IDBTransactionMode, request: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    let transaction: IDBTransaction | undefined;
    try {
      transaction = database.transaction(STORE, mode);
      let result: T;
      transaction.oncomplete = () => { database.close(); resolve(result); };
      transaction.onabort = () => { database.close(); reject(transaction!.error ?? new Error('Blueprint recovery storage was interrupted.')); };
      const operation = request(transaction.objectStore(STORE));
      operation.onsuccess = () => { result = operation.result; };
    } catch (error) {
      transaction?.abort(); database.close(); reject(error);
    }
  });
}

/** Preserve the reviewed scene, its source evidence, and every required catalog asset before reloading. */
export async function saveBlueprintCheckpoint(scene: SceneDocument, catalog: CatalogProduct[]): Promise<string> {
  const checkpoint = validated({ scene, catalog });
  const id = crypto.randomUUID();
  await stored('readwrite', store => store.add(checkpoint, id));
  return id;
}

/** Reading never consumes the checkpoint: a failed editor import must remain recoverable. */
export async function readBlueprintCheckpoint(id: string): Promise<BlueprintCheckpoint | null> {
  const value: unknown = await stored('readonly', store => store.get(id));
  return value === undefined ? null : validated(value);
}

/** Call only after the editor has successfully initialized the restored apartment. */
export async function clearBlueprintCheckpoint(id: string): Promise<void> {
  await stored('readwrite', store => store.delete(id));
}
