import { randomUUID } from 'crypto';
import { homedir } from 'os';
import path from 'path';
import fs from 'fs-extra';

export interface Message {
  role: string;
  content: string;
  [key: string]: unknown;
}

export interface SessionData {
  id: string;
  threadId: string;
  mode: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, unknown>;
}

// Session lifecycle event types
export type SessionEvent = 'start' | 'restore' | 'clear' | 'save' | 'end';

export interface SessionEventData {
  event: SessionEvent;
  session: Session;
  previousState?: SessionData;
}

export type SessionEventHandler = (data: SessionEventData) => void | Promise<void>;

// Default auto-save interval (5 minutes)
const DEFAULT_AUTOSAVE_INTERVAL = 5 * 60 * 1000;

export class Session {
  id: string;
  threadId: string;
  mode: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  metadata: Record<string, unknown>;

  private eventHandlers: Map<SessionEvent, SessionEventHandler[]> = new Map();
  private isRestored: boolean = false;
  private autoSaveTimer: ReturnType<typeof setInterval> | null = null;
  private isDirty: boolean = false;

  constructor(data?: SessionData) {
    this.id = data?.id || randomUUID();
    this.threadId = data?.threadId || randomUUID();
    this.mode = data?.mode || 'sonnet';
    this.messages = data?.messages || [];
    this.createdAt = data?.createdAt || Date.now();
    this.updatedAt = data?.updatedAt || Date.now();
    this.metadata = data?.metadata || {};
  }

  /**
   * Register an event handler for session lifecycle events
   */
  on(event: SessionEvent, handler: SessionEventHandler): void {
    const handlers = this.eventHandlers.get(event) || [];
    handlers.push(handler);
    this.eventHandlers.set(event, handlers);
  }

  /**
   * Remove an event handler
   */
  off(event: SessionEvent, handler: SessionEventHandler): void {
    const handlers = this.eventHandlers.get(event) || [];
    const index = handlers.indexOf(handler);
    if (index !== -1) {
      handlers.splice(index, 1);
      this.eventHandlers.set(event, handlers);
    }
  }

  /**
   * Emit a session event
   */
  private async emit(event: SessionEvent, previousState?: SessionData): Promise<void> {
    const handlers = this.eventHandlers.get(event) || [];
    for (const handler of handlers) {
      await handler({ event, session: this, previousState });
    }
  }

  /**
   * Start the session (call after construction for new sessions)
   */
  async start(): Promise<void> {
    await this.emit('start');
  }

  addMessage(msg: Message): void {
    this.messages.push(msg);
    this.updatedAt = Date.now();
    this.isDirty = true;
  }

  /**
   * Get conversation history
   */
  getHistory(): Message[] {
    return [...this.messages];
  }

  setMode(mode: string): void {
    this.mode = mode;
    this.updatedAt = Date.now();
    this.isDirty = true;
  }

  /**
   * Set metadata value
   */
  setMetadata(key: string, value: unknown): void {
    this.metadata[key] = value;
    this.updatedAt = Date.now();
    this.isDirty = true;
  }

  /**
   * Get metadata value
   */
  getMetadata<T = unknown>(key: string): T | undefined {
    return this.metadata[key] as T | undefined;
  }

  async clear(): Promise<void> {
    const previousState = this.toJSON();
    this.messages = [];
    this.threadId = randomUUID();
    this.updatedAt = Date.now();
    await this.emit('clear', previousState);
  }

  /**
   * End the session (call before exiting)
   * Automatically saves if there are unsaved changes
   */
  async end(): Promise<void> {
    this.stopAutoSave();
    if (this.isDirty) {
      await this.save();
    }
    await this.emit('end');
  }

  /**
   * Start auto-save timer
   * @param interval - Auto-save interval in milliseconds (default: 5 minutes)
   */
  startAutoSave(interval: number = DEFAULT_AUTOSAVE_INTERVAL): void {
    this.stopAutoSave();
    this.autoSaveTimer = setInterval(async () => {
      if (this.isDirty) {
        await this.save();
      }
    }, interval);
  }

  /**
   * Stop auto-save timer
   */
  stopAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  /**
   * Check if session has unsaved changes
   */
  hasUnsavedChanges(): boolean {
    return this.isDirty;
  }

  /**
   * Check if this session was restored from storage
   */
  wasRestored(): boolean {
    return this.isRestored;
  }

  /**
   * Get session data as JSON
   */
  toJSON(): SessionData {
    return {
      id: this.id,
      threadId: this.threadId,
      mode: this.mode,
      messages: this.messages,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      metadata: this.metadata,
    };
  }

  /**
   * Get the session storage directory
   */
  static getSessionsDir(): string {
    return path.join(homedir(), '.nanocode', 'sessions');
  }

  /**
   * Load a session from storage
   */
  static async load(id: string): Promise<Session | null> {
    const sessionPath = path.join(Session.getSessionsDir(), `${id}.json`);
    try {
      const data = await fs.readJSON(sessionPath);
      const session = new Session(data);
      session.isRestored = true;
      await session.emit('restore');
      return session;
    } catch {
      return null;
    }
  }

  /**
   * Load the most recent session
   */
  static async loadLatest(): Promise<Session | null> {
    const sessionsDir = Session.getSessionsDir();
    try {
      await fs.ensureDir(sessionsDir);
      const files = await fs.readdir(sessionsDir);
      const jsonFiles = files.filter((f) => f.endsWith('.json'));

      if (jsonFiles.length === 0) return null;

      // Sort by modification time (newest first)
      const stats = await Promise.all(
        jsonFiles.map(async (f) => ({
          file: f,
          mtime: (await fs.stat(path.join(sessionsDir, f))).mtime.getTime(),
        })),
      );
      stats.sort((a, b) => b.mtime - a.mtime);

      const latestFile = stats[0]?.file;
      if (!latestFile) return null;

      const id = latestFile.replace('.json', '');
      return Session.load(id);
    } catch {
      return null;
    }
  }

  /**
   * List all stored sessions
   */
  static async list(): Promise<SessionData[]> {
    const sessionsDir = Session.getSessionsDir();
    try {
      await fs.ensureDir(sessionsDir);
      const files = await fs.readdir(sessionsDir);
      const jsonFiles = files.filter((f) => f.endsWith('.json'));

      const sessions: SessionData[] = [];
      for (const file of jsonFiles) {
        try {
          const data = await fs.readJSON(path.join(sessionsDir, file));
          sessions.push(data);
        } catch {
          // Skip invalid files
        }
      }

      // Sort by updatedAt (newest first)
      sessions.sort((a, b) => b.updatedAt - a.updatedAt);
      return sessions;
    } catch {
      return [];
    }
  }

  /**
   * Find a session by name or ID (partial match supported for ID)
   */
  static async find(query: string): Promise<SessionData | null> {
    const sessions = await Session.list();

    // 1. Try exact ID match
    const exactId = sessions.find(s => s.id === query);
    if (exactId) return exactId;

    // 2. Try exact Name match
    const exactName = sessions.find(s => s.metadata?.name === query);
    if (exactName) return exactName;

    // 3. Try partial ID match (start of ID)
    const partialId = sessions.find(s => s.id.startsWith(query));
    if (partialId) return partialId;

    // 4. Try partial Name match (case insensitive)
    const partialName = sessions.find(
      s => String(s.metadata?.name || '').toLowerCase().includes(query.toLowerCase())
    );
    if (partialName) return partialName;

    return null;
  }

  /**
   * Delete a session from storage
   */
  static async delete(id: string): Promise<boolean> {
    const sessionPath = path.join(Session.getSessionsDir(), `${id}.json`);
    try {
      await fs.remove(sessionPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Save the session to storage
   */
  async save(): Promise<void> {
    const sessionPath = path.join(Session.getSessionsDir(), `${this.id}.json`);
    await fs.ensureDir(path.dirname(sessionPath));
    await fs.writeJSON(sessionPath, this.toJSON(), { spaces: 2 });
    this.isDirty = false;
    await this.emit('save');
  }

  /**
   * Get summary info about the session
   */
  getSummary(): { name: string; messageCount: number; lastUsedAt: Date } {
    return {
      name: (this.metadata.name as string) || `Session ${this.id.substring(0, 8)}`,
      messageCount: this.messages.length,
      lastUsedAt: new Date(this.updatedAt),
    };
  }
}
