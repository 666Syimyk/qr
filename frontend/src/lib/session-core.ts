export interface TokenStorage {
  loadToken(): Promise<string | null>;
  saveToken(token: string): Promise<void>;
  clearToken(): Promise<void>;
}
export interface SessionSnapshot {
  token: string | null;
  ready: boolean;
  storageWarning: string | null;
  revision: number;
}

/** State and I/O ordering shared by the React provider and the session tests. */
export class SessionController {
  private readonly storage: TokenStorage;
  private snapshot: SessionSnapshot = {
    token: null,
    ready: false,
    storageWarning: null,
    revision: 0,
  };
  private listeners = new Set<() => void>();
  private storageQueue: Promise<unknown> = Promise.resolve();
  private hydration: Promise<void> | undefined;

  constructor(storage: TokenStorage) {
    this.storage = storage;
  }

  getSnapshot = (): SessionSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private update(next: Partial<SessionSnapshot>) {
    this.snapshot = { ...this.snapshot, ...next };
    for (const listener of this.listeners) listener();
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.storageQueue.then(operation, operation);
    this.storageQueue = next.catch(() => undefined);
    return next;
  }

  hydrate = (): Promise<void> => {
    if (this.hydration) return this.hydration;
    const revision = this.snapshot.revision;
    this.hydration = this.enqueue(() => this.storage.loadToken())
      .then((token) => {
        if (revision !== this.snapshot.revision) return;
        this.update({ token, ready: true, revision: revision + 1 });
      })
      .catch(() => {
        if (revision !== this.snapshot.revision) return;
        this.update({
          ready: true,
          storageWarning:
            "Не удалось прочитать защищённое хранилище. Введите ранее сохранённый приватный ключ вручную.",
        });
      });
    return this.hydration;
  };

  saveToken = async (token: string): Promise<void> => {
    const revision = this.snapshot.revision + 1;
    this.update({ token, ready: true, storageWarning: null, revision });
    try {
      await this.enqueue(() => this.storage.saveToken(token));
    } catch {
      if (revision !== this.snapshot.revision) return;
      this.update({
        storageWarning:
          "Не удалось сохранить ключ в защищённом хранилище устройства. Откройте приватный ключ и сохраните его вручную сейчас: после перезапуска доступ может быть потерян.",
      });
    }
  };

  logout = async (): Promise<void> => {
    const revision = this.snapshot.revision + 1;
    this.update({ token: null, ready: true, storageWarning: null, revision });
    try {
      // Serialize writes so a preceding slow save cannot run after this removal.
      await this.enqueue(() => this.storage.clearToken());
    } catch {
      if (revision !== this.snapshot.revision) return;
      this.update({
        storageWarning:
          "Ключ очищен из текущей сессии, но удалить его из защищённого хранилища не удалось. Копия может остаться на устройстве. Повторите выход после разблокировки устройства.",
      });
    }
  };

  handleUnauthorized = async (
    rejectedToken: string,
    requestRevision: number,
  ): Promise<void> => {
    if (
      this.snapshot.token !== rejectedToken ||
      this.snapshot.revision !== requestRevision
    )
      return;
    await this.logout();
  };
}
