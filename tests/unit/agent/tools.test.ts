import { describe, it, expect, beforeEach } from 'vitest';
import { AskUserTool, getNanoCodeTools, WebFetchTool, WebSearchTool, MultiEditTool, LSPTool } from '../../../src/agent/tools';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('AskUserTool', () => {
    let tool: AskUserTool;

    beforeEach(() => {
        tool = new AskUserTool();
    });

    it('should have correct name and description', () => {
        expect(tool.name).toBe('ask_user');
        expect(tool.description).toContain('question');
    });

    it('should have correct schema', () => {
        const schema = tool.schema as any;
        const shape = schema.shape;
        expect(shape.question).toBeDefined();
        expect(shape.type).toBeDefined();
        expect(shape.options).toBeDefined();
    });

    it('should return JSON formatted string', async () => {
        const result = await tool._call({
            question: 'Are you sure?',
            type: 'confirm'
        });

        const parsed = JSON.parse(result);
        expect(parsed).toEqual({
            tool: 'ask_user',
            question: 'Are you sure?',
            type: 'confirm',
            options: undefined
        });
    });

    it('should handle default type', async () => {
        const result = await tool._call({
            question: 'Name?'
        });

        const parsed = JSON.parse(result);
        expect(parsed.type).toBe('text');
    });
});

describe('getNanoCodeTools', () => {
    it('should return all tools by default', () => {
        const tools = getNanoCodeTools();
        expect(tools).toHaveLength(5);
        expect(tools[0]).toBeInstanceOf(AskUserTool);
        expect(tools[1]).toBeInstanceOf(WebFetchTool);
        expect(tools[2]).toBeInstanceOf(WebSearchTool);
        expect(tools[3]).toBeInstanceOf(MultiEditTool);
        expect(tools[4]).toBeInstanceOf(LSPTool);
    });

    it('should allow disabling WebFetch', () => {
        const tools = getNanoCodeTools({ enableWebFetch: false });
        expect(tools).toHaveLength(4);
        expect(tools[0]).toBeInstanceOf(AskUserTool);
        expect(tools[1]).toBeInstanceOf(WebSearchTool);
        expect(tools[2]).toBeInstanceOf(MultiEditTool);
        expect(tools[3]).toBeInstanceOf(LSPTool);
    });

    it('should allow disabling WebSearch', () => {
        const tools = getNanoCodeTools({ enableWebSearch: false });
        expect(tools).toHaveLength(4);
        expect(tools[0]).toBeInstanceOf(AskUserTool);
        expect(tools[1]).toBeInstanceOf(WebFetchTool);
        expect(tools[2]).toBeInstanceOf(MultiEditTool);
        expect(tools[3]).toBeInstanceOf(LSPTool);
    });

    it('should allow disabling MultiEdit', () => {
        const tools = getNanoCodeTools({ enableMultiEdit: false });
        expect(tools).toHaveLength(4);
        expect(tools[0]).toBeInstanceOf(AskUserTool);
        expect(tools[1]).toBeInstanceOf(WebFetchTool);
        expect(tools[2]).toBeInstanceOf(WebSearchTool);
        expect(tools[3]).toBeInstanceOf(LSPTool);
    });

    it('should allow disabling LSP', () => {
        const tools = getNanoCodeTools({ enableLSP: false });
        expect(tools).toHaveLength(4);
        expect(tools[0]).toBeInstanceOf(AskUserTool);
        expect(tools[1]).toBeInstanceOf(WebFetchTool);
        expect(tools[2]).toBeInstanceOf(WebSearchTool);
        expect(tools[3]).toBeInstanceOf(MultiEditTool);
    });
});

describe('WebFetchTool', () => {
    let tool: WebFetchTool;

    beforeEach(() => {
        tool = new WebFetchTool();
    });

    it('should have correct name and description', () => {
        expect(tool.name).toBe('web_fetch');
        expect(tool.description).toContain('Fetch');
    });

    it('should have correct schema', () => {
        const schema = tool.schema as any;
        const shape = schema.shape;
        expect(shape.url).toBeDefined();
        expect(shape.prompt).toBeDefined();
    });

    it('should reject blocked domains', async () => {
        const blockedTool = new WebFetchTool({
            blockedDomains: ['evil.com']
        });
        const result = await blockedTool._call({ url: 'https://evil.com/page' });
        expect(result).toContain('blocked');
    });
});

describe('MultiEditTool', () => {
    let tool: MultiEditTool;
    let tempDir: string;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'multiedit-test-'));
        tool = new MultiEditTool({ cwd: tempDir });
    });

    it('should have correct name and description', () => {
        expect(tool.name).toBe('multi_edit');
        expect(tool.description).toContain('multiple');
    });

    it('should have correct schema', () => {
        const schema = tool.schema as any;
        const shape = schema.shape;
        expect(shape.files).toBeDefined();
        expect(shape.dry_run).toBeDefined();
    });

    it('should apply single edit to file', async () => {
        const testFile = path.join(tempDir, 'test.txt');
        await fs.writeFile(testFile, 'Hello World');

        const result = await tool._call({
            files: [{
                file_path: testFile,
                edits: [{ old_string: 'World', new_string: 'NanoCode' }]
            }]
        });

        const content = await fs.readFile(testFile, 'utf-8');
        expect(content).toBe('Hello NanoCode');
        expect(result).toContain('Successfully');
    });

    it('should apply multiple edits to single file', async () => {
        const testFile = path.join(tempDir, 'test.txt');
        await fs.writeFile(testFile, 'const foo = 1;\nconst bar = 2;');

        const result = await tool._call({
            files: [{
                file_path: testFile,
                edits: [
                    { old_string: 'const foo = 1;', new_string: 'const foo = 10;' },
                    { old_string: 'const bar = 2;', new_string: 'const bar = 20;' }
                ]
            }]
        });

        const content = await fs.readFile(testFile, 'utf-8');
        expect(content).toBe('const foo = 10;\nconst bar = 20;');
        expect(result).toContain('2 edit(s)');
    });

    it('should support dry run mode', async () => {
        const testFile = path.join(tempDir, 'test.txt');
        await fs.writeFile(testFile, 'Original content');

        const result = await tool._call({
            files: [{
                file_path: testFile,
                edits: [{ old_string: 'Original', new_string: 'Modified' }]
            }],
            dry_run: true
        });

        const content = await fs.readFile(testFile, 'utf-8');
        expect(content).toBe('Original content'); // Unchanged
        expect(result).toContain('DRY RUN');
    });

    it('should fail if string not found', async () => {
        const testFile = path.join(tempDir, 'test.txt');
        await fs.writeFile(testFile, 'Hello World');

        const result = await tool._call({
            files: [{
                file_path: testFile,
                edits: [{ old_string: 'NotFound', new_string: 'Replacement' }]
            }]
        });

        expect(result).toContain('not found');
    });

    it('should handle replace_all flag', async () => {
        const testFile = path.join(tempDir, 'test.txt');
        await fs.writeFile(testFile, 'foo bar foo baz foo');

        const result = await tool._call({
            files: [{
                file_path: testFile,
                edits: [{ old_string: 'foo', new_string: 'qux', replace_all: true }]
            }]
        });

        const content = await fs.readFile(testFile, 'utf-8');
        expect(content).toBe('qux bar qux baz qux');
        expect(result).toContain('3 occurrence');
    });
});
