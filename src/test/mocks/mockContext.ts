import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';

/**
 * Creates a mock VS Code ExtensionContext for testing.
 * Provides all required properties with sensible defaults.
 */
export function createMockContext(): vscode.ExtensionContext {
    const storagePath = path.join(os.tmpdir(), `draagon-test-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`);

    const mockMemento: vscode.Memento = {
        keys: () => [] as readonly string[],
        get: <T>(key: string, defaultValue?: T): T | undefined => defaultValue,
        update: (_key: string, _value: unknown) => Promise.resolve()
    };

    const mockGlobalState: vscode.Memento & { setKeysForSync: (keys: readonly string[]) => void } = {
        keys: () => [] as readonly string[],
        get: <T>(key: string, defaultValue?: T): T | undefined => defaultValue,
        update: (_key: string, _value: unknown) => Promise.resolve(),
        setKeysForSync: (_keys: readonly string[]) => { }
    };

    const mockSecrets: vscode.SecretStorage = {
        get: (_key: string) => Promise.resolve(undefined),
        store: (_key: string, _value: string) => Promise.resolve(),
        delete: (_key: string) => Promise.resolve(),
        onDidChange: new vscode.EventEmitter<vscode.SecretStorageChangeEvent>().event,
        keys: () => Promise.resolve([])
    };

    // Create a partial mock that satisfies the most common test scenarios
    const context: Partial<vscode.ExtensionContext> = {
        storageUri: vscode.Uri.file(storagePath),
        globalStorageUri: vscode.Uri.file(storagePath),
        workspaceState: mockMemento,
        globalState: mockGlobalState,
        subscriptions: [],
        extensionPath: path.join(os.tmpdir(), 'test-extension'),
        extensionUri: vscode.Uri.file(path.join(os.tmpdir(), 'test-extension')),
        secrets: mockSecrets,
        extensionMode: vscode.ExtensionMode.Test,
    };

    // Cast to full ExtensionContext - tests should only use the properties we've mocked
    return context as vscode.ExtensionContext;
}

/**
 * Creates a mock Memento (workspaceState/globalState) with in-memory storage.
 * Useful for tests that need to verify state persistence.
 */
export function createMockMemento(): vscode.Memento {
    const storage = new Map<string, unknown>();

    return {
        keys: () => Array.from(storage.keys()),
        get: <T>(key: string, defaultValue?: T): T | undefined => {
            if (storage.has(key)) {
                return storage.get(key) as T;
            }
            return defaultValue;
        },
        update: (key: string, value: unknown) => {
            if (value === undefined) {
                storage.delete(key);
            } else {
                storage.set(key, value);
            }
            return Promise.resolve();
        }
    };
}

/**
 * Creates a mock context with in-memory state storage.
 * Use this when you need to test state persistence behavior.
 */
export function createMockContextWithStorage(): vscode.ExtensionContext {
    const context = createMockContext();

    // Replace with in-memory storage
    (context as { workspaceState: vscode.Memento }).workspaceState = createMockMemento();
    (context as { globalState: vscode.Memento }).globalState = {
        ...createMockMemento(),
        setKeysForSync: () => { }
    } as vscode.Memento & { setKeysForSync: (keys: readonly string[]) => void };

    return context;
}
