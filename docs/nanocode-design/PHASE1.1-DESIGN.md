# Phase 1.1: 接口设计规格 (Skill 发现与路由)

## 1. 概述

### 1.1 目标
Phase 1.1 旨在构建 NanoCode 的 Skill 发现与执行基础架构。本阶段的核心任务是实现从用户输入到具体 Skill 执行的映射机制，打通 CLI 壳与 Skill 系统的连接。

主要交付物包括：
*   处理 `!command` 语法的预处理器。
*   基于意图匹配 Skill 的语义路由接口。
*   将 Skill 元数据注入到 agent 上下文的集成机制。

### 1.2 与 Claude Code 机制的对齐
NanoCode 参考 Claude Code 的设计，将 "Tool" (原子操作) 和 "Skill" (复合能力) 分离。Phase 1.1 重点关注 Skill 的路由，确保系统能够像 Claude Code 一样，既支持显式的 Slash Commands (如 `/commit`)，也支持隐式的语义触发。但在 NanoCode 中，我们使用更通用的 `!command` 语法作为显式调用的基础。

---

## 2. 接口设计

### 2.1 预处理器 (Preprocessor)

预处理器负责拦截和解析用户输入中的特殊指令，将自然语言与控制指令分离。

```typescript
/**
 * 预处理器接口
 * 负责解析用户输入中的显式指令（如 /skill args 或 !shell）
 */
interface Preprocessor {
  /**
   * 处理输入字符串
   * @param content 用户原始输入
   * @returns 处理结果，可能包含提取出的指令和清洗后的文本
   */
  execute(content: string): Promise<PreprocessingResult>;
}

interface PreprocessingResult {
  /** 原始文本中去除了指令部分的剩余文本 */
  cleanedContent: string;
  /** 提取出的指令列表 */
  commands: CommandInstruction[];
  /** 是否应该终止标准对话流程 (如果全是指令则为 true) */
  shouldHaltConversation: boolean;
}

interface CommandInstruction {
  name: string; // skill name or shell command
  args: string[];
  type: 'skill' | 'shell';
  originalString: string;
}
```

**语法规范与增强:**

1.  **Shell Pass-through (`!command`)**:
    *   遵循 Claude Code 惯例，使用 `!` 前缀执行 Shell 命令（底层映射到 `Bash` tool）。
    *   格式: `` !`command` `` 或 `! command`
    *   示例: `` !`ls -la` ``, `!npm test`

2.  **Skill Invocation (`/command`)**:
    *   使用 Slash Commands 显式调用 Skill。
    *   格式: `/skillName [args...]`
    *   示例: `/commit -m "fix bug"`, `/pr-review 123`

3.  **文件引用 (`@file`)**:
    *   支持使用 `@path/to/file` 语法将文件内容直接读取并注入上下文。
    *   预处理器应自动解析路径，读取内容，并替换为 context 引用或直接展开。
    *   示例: `/explain @src/core/router.ts`

4.  **参数替换 (Argument Substitution)**:
    *   支持定义 Alias 或 Macro 时使用变量占位符。
    *   `$1`, `$2`, ...: 位置参数。
    *   `$ARGUMENTS`: 所有参数的集合（原始字符串）。
    *   `${SKILL_ROOT}`: 当前 Skill 的根目录路径。
    *   此功能主要用于 Custom Commands 定义（将在后续 Phase 支持）。

### 2.2 语义路由 (SemanticRouter)

当用户没有使用显式指令时，语义路由负责分析用户意图，判断是否需要激活某个 Skill。

```typescript
/**
 * 语义路由接口
 * 负责将自然语言映射到具体的 Skill
 */
interface SemanticRouter {
  /**
   * 匹配最合适的 Skill
   * @param userInput 用户输入的自然语言
   * @param skills 可用的 Skill 列表
   * @returns 匹配到的 Skill (由 LLM 决定)
   */
  match(userInput: string, skills: Skill[]): Promise<SkillMatch | null>;
}

interface Skill {
  name: string;
  description: string; // "This skill should be used when..."
  examples: string[]; // 具体触发短语示例
  // ... 其他元数据
}
```

**匹配机制:**

NanoCode 摒弃传统的关键词匹配，完全采用 **LLM 语义理解** 作为路由核心，与 Claude Code 机制对齐。

1.  **Description Driven**: Skill 的 `description` 必须严格遵循 "This skill should be used when..." 格式，准确描述适用场景而非功能细节。
2.  **触发短语 (Trigger Phrases)**: `examples` 字段提供具体的自然语言指令示例（如 "Run the tests", "Check for bugs"），作为 Few-Shot 提示注入 System Prompt，而非用于正则匹配。
3.  **LLM 决策**: Router 将用户输入与 Skill 定义一同通过 Prompt 提交给 LLM，由 LLM 判断意图并决定调用哪个 Tool/Skill。

### 2.3 L1 集成 (SkillsContext)

L1 (Level 1) 是 NanoCode 的核心调度层。通过 SkillsContext 将发现的 Skill 注入到执行环境。

```typescript
interface SkillsContext {
  /**
   * 获取当前上下文所有可用 Skill 的 Prompt 描述
   * 用于注入到 System Prompt
   */
  getSkillsPrompt(): string;

  /**
   * 注册一个新的 Skill
   */
  register(skill: Skill): void;

  /**
   * 扫描目录加载 Skills
   */
  loadFromDirectory(dir: string): Promise<void>;
}
```

*   **注入时机**: 在 deepagents 初始化 Agent Loop 之前，通过 `SkillsContext` 生成系统提示词片段，合并到 System Prompt 中。
*   **集成方式**: 通过 deepagents 的 `context` 对象传递 `SkillsContext` 实例。

---

## 3. 设计决策

### 3.1 预处理器执行时机
**决策**: 在将用户输入发送给 LLM **之前** 执行。
**理由**:
*   显式指令 (Slash Commands 和 Shell) 是确定性操作。
*   降低延迟，立即响应用户明确的操作请求。
*   文件引用 `@file` 需要在上下文构建阶段解析并注入。

### 3.2 语义路由算法
**决策**: Phase 1.1 采用 **LLM-Based Intent Recognition**。
*   **不使用硬编码关键词**。
*   依赖 LLM 对 Description 和 Few-Shot Examples 的理解。
**理由**:
*   为了与 Claude Code (及现代 Agent 框架) 的交互体验保持一致。
*   自然语言的多样性无法通过正则完全覆盖。
*   Skill 的选择往往依赖上下文（Context-Aware）。

### 3.3 L1 注入点
**决策**: **CLI 启动时扫描，Agent Loop 初始化时注入**。
**理由**:
*   Skills 目录结构在一次 Session 中通常不变，启动时加载缓存即可。
*   注入 System Prompt 确保 Agent 始终知晓自身能力边界。

---

## 4. 测试策略

### 4.1 测试用例清单

#### Preprocessor 测试
1.  **纯文本输入**: 输入 "hello world"，期望 commands 为空，shouldHaltConversation 为 false。
2.  **Slash Command**: 输入 "/commit -m 'wip'"，期望提取 Skill 指令 `commit`，shouldHaltConversation 为 true。
3.  **Shell Command**: 输入 "!ls -la"，期望提取 Shell 指令，shouldHaltConversation 为 true。
4.  **文件引用**: 输入 "/review @src/index.ts"，期望解析出文件路径并尝试读取内容（Mock读取）。
5.  **混合输入**: 输入 "check this @file"，期望替换 `@file` 为文件内容。

#### SemanticRouter 测试
1.  **Intent Recognition**: 输入 "Please run the test suite"，配合定义了 "Run tests" 示例的 Skill，期望 LLM 正确选择测试 Skill。
2.  **Ambiguity**: 输入模糊指令，验证 LLM 是否请求澄清或拒绝 (取决于 Prompt 设计)。
3.  **Negative Case**: 输入无关内容，确保不错误触发敏感 Skill (如 deploy)。

#### SkillsContext 测试
1.  **加载目录**: 指定模拟目录，验证是否正确读取 `SKILL.md` 和配置文件。
2.  **Prompt 生成**: 验证 `getSkillsPrompt()` 是否生成了符合 "Tool Use" 格式的 Prompt 片段。

### 4.2 验收标准
1.  能够解析标准格式的 CLI 指令。
2.  能够通过简单的关键词触发模拟 Skill。
3.  能够正确读取文件系统中的 Skill 定义并生成 Prompt。
