// In-memory AsyncStorage mock — resets between test files via jest module isolation.
let store = new Map<string, string>();

const AsyncStorage = {
  getItem: jest.fn(async (key: string): Promise<string | null> => store.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string): Promise<void> => { store.set(key, value); }),
  removeItem: jest.fn(async (key: string): Promise<void> => { store.delete(key); }),
  clear: jest.fn(async (): Promise<void> => { store.clear(); }),
  getAllKeys: jest.fn(async (): Promise<readonly string[]> => Array.from(store.keys())),
  __resetStore: () => { store = new Map(); },
};

export default AsyncStorage;
