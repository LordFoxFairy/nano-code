// src/cli/session.ts
import { randomUUID } from 'crypto';
import path from 'path';
import fs from 'fs-extra';
import { homedir } from 'os';

export interface Message {
  role: string;
  content: string;
  [key: string]: any;
}

export interface SessionData {
  id: string;
  threadId: string;
  mode: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

export class Session {
    id: string;
    threadId: string;
    mode: string;
    messages: Message[];
    createdAt: number;
    updatedAt: number;

    constructor(data?: SessionData) {
        this.id = data?.id || randomUUID();
        this.threadId = data?.threadId || randomUUID();
        this.mode = data?.mode || 'sonnet';
        this.messages = data?.messages || [];
        this.createdAt = data?.createdAt || Date.now();
        this.updatedAt = data?.updatedAt || Date.now();
    }

    addMessage(msg: Message) {
        this.messages.push(msg);
        this.updatedAt = Date.now();
    }

    setMode(mode: string) {
        this.mode = mode;
        this.updatedAt = Date.now();
    }

    clear() {
        this.messages = [];
        this.threadId = randomUUID();
        this.updatedAt = Date.now();
    }

    static async load(id: string): Promise<Session | null> {
        const sessionPath = path.join(homedir(), '.nanocode', 'sessions', `${id}.json`);
        try {
            const data = await fs.readJSON(sessionPath);
            return new Session(data);
        } catch (error) {
            return null;
        }
    }

    async save() {
        const sessionPath = path.join(homedir(), '.nanocode', 'sessions', `${this.id}.json`);
        await fs.ensureDir(path.dirname(sessionPath));
        await fs.writeJSON(sessionPath, this, { spaces: 2 });
    }
}
