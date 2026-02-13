import React, { useState, useRef } from 'react';
import { Box, useApp, useInput } from 'ink';
import { Command } from '@langchain/langgraph';
import { WelcomeScreen } from './components/WelcomeScreen.js';
import { UserMessage } from './components/UserMessage.js';
import { AssistantMessage } from './components/AssistantMessage.js';
import { ToolExecution } from './components/ToolExecution.js';
import { StatusBar } from './components/StatusBar.js';
import { InputPrompt } from './components/InputPrompt.js';
import { SystemMessage } from './components/SystemMessage.js';
import { ThinkingIndicator } from './components/ThinkingIndicator.js';
import { HITLApproval } from './components/HITLApproval.js';
import { Session } from '../session.js';
import { parseMessage } from '../message-utils.js';
import { NanoCodeAgent } from '../../agent/factory.js';

// HITL interrupt types from deepagents/langchain
interface HITLActionRequest {
  name: string;
  args: Record<string, unknown>;
  description?: string;
}

interface HITLRequest {
  actionRequests: HITLActionRequest[];
  reviewConfigs: { actionName: string; allowedDecisions: string[] }[];
}

interface HITLInterrupt {
  value?: HITLRequest;
}

interface HITLDecision {
  type: 'approve' | 'edit' | 'reject';
  message?: string;
}

interface HITLResponse {
  decisions: HITLDecision[];
}

/**
 * Stream chunk from agent
 */
interface StreamChunk {
  messages?: unknown[];
  __interrupt__?: HITLInterrupt[];
}

interface AppProps {
  agent: NanoCodeAgent;
  session: Session;
}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  toolName?: string;
  toolArgs?: unknown;
  isError?: boolean;
}

export const App: React.FC<AppProps> = ({ agent, session }) => {
  const { exit } = useApp();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [modelInfo, setModelInfo] = useState({
    model: session.mode || 'sonnet',
    tokens: 0,
    cost: 0,
  });
  const [pendingHITL, setPendingHITL] = useState<HITLRequest | null>(null);
  const [hitlConfig, setHitlConfig] = useState<{ thread_id: string } | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Handle Ctrl+C - abort streaming or exit
  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      if (isStreaming && abortControllerRef.current) {
        // Abort the current streaming operation
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
        setIsStreaming(false);
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now().toString(),
            role: 'system',
            content: 'Operation cancelled by user.',
            isError: false,
          },
        ]);
        return; // Don't exit, just cancel
      }
      exit();
    }
  });

  // Handle HITL approval/rejection
  const handleHITLDecision = async (decisions: HITLDecision[]) => {
    if (!hitlConfig) return;

    setPendingHITL(null);
    setIsStreaming(true);

    // Create abort controller for this request
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const response: HITLResponse = { decisions };
      const resumeCommand = new Command({ resume: response });

      const stream = await agent.stream(resumeCommand, {
        configurable: hitlConfig,
        streamMode: 'values',
        signal: abortController.signal,
      });

      for await (const rawChunk of stream) {
        const chunk = rawChunk as StreamChunk;
        // Process stream chunks same as handleSubmit
        if (chunk.messages && Array.isArray(chunk.messages)) {
          const agentMessages = chunk.messages;
          const uiMessages: Message[] = [];

          for (const msg of agentMessages) {
            const parsed = parseMessage(msg as import('../message-utils.js').MessageLike);

            if (parsed.role === 'user') {
              uiMessages.push({
                id: parsed.id || `user-${uiMessages.length}`,
                role: 'user',
                content: parsed.content,
              });
            }

            if (parsed.role === 'assistant') {
              uiMessages.push({
                id: parsed.id || `asst-${uiMessages.length}`,
                role: 'assistant',
                content: parsed.content,
                toolName: parsed.toolCalls?.[0]?.name,
                toolArgs: parsed.toolCalls?.[0]?.args,
              });
            }

            if (parsed.role === 'tool') {
              uiMessages.push({
                id: parsed.id || `tool-${uiMessages.length}`,
                role: 'tool',
                content: parsed.content,
                toolName: parsed.name,
                isError: parsed.isError,
              });
            }
          }

          setMessages(uiMessages);

          setModelInfo((prev) => ({
            ...prev,
            tokens: uiMessages.reduce((acc, m) => acc + (m.content?.length || 0) / 4, 0),
          }));
        }

        // Check for another HITL interrupt
        if (chunk.__interrupt__ && chunk.__interrupt__[0]) {
          const interrupt = chunk.__interrupt__[0];
          if (interrupt.value) {
            setPendingHITL(interrupt.value);
            setIsStreaming(false);
            return;
          }
        }
      }
    } catch (err: unknown) {
      const error = err as Error;
      // Don't show error message if aborted by user
      if (error.name !== 'AbortError') {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now().toString(),
            role: 'system',
            content: `Error: ${error.message}`,
            isError: true,
          },
        ]);
      }
    } finally {
      abortControllerRef.current = null;
      setIsStreaming(false);
      setHitlConfig(null);
    }
  };

  const handleSubmit = async (value: string) => {
    if (!value.trim()) return;

    const userMsgId = Date.now().toString();
    // Optimistically add user message
    const newMessages: Message[] = [...messages, { id: userMsgId, role: 'user', content: value }];

    setMessages(newMessages);
    setInputValue('');
    setIsStreaming(true);

    try {
      if (value.startsWith('/')) {
        const parts = value.trim().split(/\s+/);
        const command = parts[0];
        const args = parts.slice(1);

        if (command === '/clear' || command === '/reset') {
          await session.clear();
          setMessages([]);
          setIsStreaming(false);
          return;
        }
        if (command === '/exit' || command === '/quit') {
          exit();
          return;
        }
        if (command === '/model') {
          const model = args[0];
          if (model && ['opus', 'sonnet', 'haiku'].includes(model)) {
            session.setMode(model);
            setModelInfo((prev) => ({ ...prev, model }));
            setMessages((prev) => [
              ...prev,
              {
                id: Date.now().toString(),
                role: 'system',
                content: `Switched to ${model} mode.`,
              },
            ]);
          } else {
            setMessages((prev) => [
              ...prev,
              {
                id: Date.now().toString(),
                role: 'system',
                content: `Usage: /model <opus|sonnet|haiku>`,
                isError: true,
              },
            ]);
          }
          setIsStreaming(false);
          return;
        }
        if (command === '/help') {
          setMessages((prev) => [
            ...prev,
            {
              id: Date.now().toString(),
              role: 'system',
              content: `Available Commands:
/help           Show this help message
/model [name]   Switch model (opus, sonnet, haiku)
/clear          Clear conversation context
/exit           Exit NanoCode`,
            },
          ]);
          setIsStreaming(false);
          return;
        }

        setMessages((prev) => [
          ...prev,
          {
            id: Date.now().toString(),
            role: 'system',
            content: `Unknown command: ${command}`,
            isError: true,
          },
        ]);
        setIsStreaming(false);
        return;
      }

      const threadConfig = { thread_id: session.threadId };
      setHitlConfig(threadConfig);

      // Create abort controller for this request
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      const stream = await agent.stream(
        { messages: [{ role: 'user', content: value }] },
        {
          configurable: threadConfig,
          streamMode: 'values',
          signal: abortController.signal,
        },
      );

      for await (const rawChunk of stream) {
        const chunk = rawChunk as StreamChunk;
        if (chunk.messages && Array.isArray(chunk.messages)) {
          const agentMessages = chunk.messages;
          const uiMessages: Message[] = [];

          for (const msg of agentMessages) {
            const parsed = parseMessage(msg as import('../message-utils.js').MessageLike);

            if (parsed.role === 'user') {
              uiMessages.push({
                id: parsed.id || `user-${uiMessages.length}`,
                role: 'user',
                content: parsed.content,
              });
            }

            if (parsed.role === 'assistant') {
              uiMessages.push({
                id: parsed.id || `asst-${uiMessages.length}`,
                role: 'assistant',
                content: parsed.content,
                toolName: parsed.toolCalls?.[0]?.name,
                toolArgs: parsed.toolCalls?.[0]?.args,
              });
            }

            if (parsed.role === 'tool') {
              uiMessages.push({
                id: parsed.id || `tool-${uiMessages.length}`,
                role: 'tool',
                content: parsed.content,
                toolName: parsed.name,
                isError: parsed.isError,
              });
            }
          }

          setMessages(uiMessages);

          setModelInfo((prev) => ({
            ...prev,
            tokens: uiMessages.reduce((acc, m) => acc + (m.content?.length || 0) / 4, 0),
          }));
        }

        // Check for HITL interrupt
        if (chunk.__interrupt__ && chunk.__interrupt__[0]) {
          const interrupt = chunk.__interrupt__[0];
          if (interrupt.value) {
            setPendingHITL(interrupt.value);
            setIsStreaming(false);
            return;
          }
        }
      }
    } catch (err: unknown) {
      const error = err as Error;
      // Don't show error message if aborted by user
      if (error.name !== 'AbortError') {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now().toString(),
            role: 'system',
            content: `Error: ${error.message}`,
            isError: true,
          },
        ]);
      }
    } finally {
      abortControllerRef.current = null;
      setIsStreaming(false);
    }
  };

  // Helper to pair assistant tool calls with tool results
  const renderMessages = () => {
    const elements: React.ReactNode[] = [];

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (!msg) continue;

      if (msg.role === 'user') {
        elements.push(<UserMessage key={msg.id || i} content={msg.content} />);
        continue;
      }

      if (msg.role === 'assistant') {
        elements.push(
          <Box key={msg.id || i} flexDirection="column">
            {msg.content && <AssistantMessage content={msg.content} />}
          </Box>,
        );

        if (msg.toolName) {
          // Check if next message is the corresponding tool result
          // For simplicity, just look at i+1. In robust implementation we'd match IDs.
          const nextMsg = messages[i + 1];
          const hasResult = nextMsg && nextMsg.role === 'tool';

          if (hasResult) {
            // We will render the result here and SKIP the next iteration
            elements.push(
              <ToolExecution
                key={`exec-${msg.id}`}
                toolName={msg.toolName}
                args={msg.toolArgs}
                result={nextMsg?.content}
                isLoading={false}
                isError={nextMsg?.isError}
              />,
            );
            i++; // Skip next message
          } else {
            // Tool is running
            elements.push(
              <ToolExecution
                key={`exec-${msg.id}`}
                toolName={msg.toolName}
                args={msg.toolArgs}
                isLoading={true}
              />,
            );
          }
        }
        continue;
      }

      if (msg.role === 'tool') {
        // If we got here, it's a tool result without a preceding assistant call
        // (or we failed to match it). Render independently.
        elements.push(
          <ToolExecution
            key={msg.id || i}
            toolName={msg.toolName || 'Tool'}
            result={msg.content}
            isLoading={false}
            isError={msg.isError}
          />,
        );
      }

      if (msg.role === 'system') {
        elements.push(
          <SystemMessage
            key={msg.id || i}
            content={msg.content}
            isError={msg.isError}
            isSuccess={!msg.isError && msg.content.includes('Switched')}
          />,
        );
      }
    }

    return elements;
  };

  return (
    <Box flexDirection="column" height="100%">
      {messages.length === 0 && <WelcomeScreen />}

      <Box flexDirection="column" flexGrow={1} overflowY="hidden">
        {renderMessages()}
        {isStreaming && messages.length > 0 && !messages.some((m) => m.role === 'assistant') && (
          <ThinkingIndicator />
        )}
      </Box>

      {/* HITL Approval UI */}
      {pendingHITL && (
        <HITLApproval
          request={pendingHITL}
          onApprove={() => {
            const decisions: HITLDecision[] = pendingHITL.actionRequests.map(() => ({
              type: 'approve' as const,
            }));
            handleHITLDecision(decisions);
          }}
          onReject={(message?: string) => {
            const decisions: HITLDecision[] = pendingHITL.actionRequests.map(() => ({
              type: 'reject' as const,
              message,
            }));
            handleHITLDecision(decisions);
          }}
          onEdit={(editedArgs: Record<string, unknown>) => {
            const decisions: HITLDecision[] = pendingHITL.actionRequests.map(() => ({
              type: 'edit' as const,
              message: JSON.stringify(editedArgs),
            }));
            handleHITLDecision(decisions);
          }}
        />
      )}

      <Box flexDirection="column">
        <InputPrompt
          value={inputValue}
          onChange={setInputValue}
          onSubmit={handleSubmit}
          disabled={isStreaming || !!pendingHITL}
        />
        <StatusBar
          model={modelInfo.model}
          tokens={Math.round(modelInfo.tokens)}
          cost={modelInfo.tokens * 0.000003}
          isProcessing={isStreaming}
        />
      </Box>
    </Box>
  );
};
