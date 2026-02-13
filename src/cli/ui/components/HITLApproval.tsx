import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { theme } from '../theme.js';
import { formatToolArgs } from '../utils.js';

// HITL types from LangGraph interrupts
interface HITLActionRequest {
  name: string;
  args: Record<string, unknown>;
  description?: string;
}

interface HITLRequest {
  actionRequests: HITLActionRequest[];
  reviewConfigs: { actionName: string; allowedDecisions: string[] }[];
}

// Legacy single-action props (for backwards compatibility)
interface LegacyHITLApprovalProps {
  toolName: string;
  toolArgs: unknown;
  onApprove: () => void;
  onReject: (message?: string) => void;
  onEdit?: (editedArgs: Record<string, unknown>) => void;
}

// New multi-action props (for LangGraph interrupts)
interface MultiActionHITLApprovalProps {
  request: HITLRequest;
  onApprove: () => void;
  onReject: (message?: string) => void;
  onEdit?: (editedArgs: Record<string, unknown>) => void;
}

type HITLApprovalProps = LegacyHITLApprovalProps | MultiActionHITLApprovalProps;

// Type guard to check if props are multi-action
function isMultiAction(props: HITLApprovalProps): props is MultiActionHITLApprovalProps {
  return 'request' in props;
}

export const HITLApproval: React.FC<HITLApprovalProps> = (props) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Normalize to array of actions
  const actions: HITLActionRequest[] = isMultiAction(props)
    ? props.request.actionRequests
    : [{ name: props.toolName, args: (props.toolArgs as Record<string, unknown>) || {} }];

  const { onApprove, onReject } = props;

  useInput((input, key) => {
    if (input === 'y' || input === 'Y') {
      onApprove();
    } else if (input === 'n' || input === 'N') {
      onReject();
    } else if (key.return) {
      // Default to No for HITL safety
      onReject();
    } else if (key.upArrow && actions.length > 1) {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
    } else if (key.downArrow && actions.length > 1) {
      setSelectedIndex((prev) => Math.min(actions.length - 1, prev + 1));
    }
  });

  const renderActionDetails = (action: HITLActionRequest, isSelected: boolean = false) => {
    const { name: toolName, args: toolArgs, description } = action;
    const borderColor = isSelected ? theme.primary : theme.border.default;

    const argObj = toolArgs as Record<string, unknown>;

    // Special formatting for Bash/Exec tools
    if (toolName === 'Bash' || toolName === 'execute' || toolName === 'RunCommand') {
      const cmd =
        (typeof argObj.command === 'string' ? argObj.command : '') ||
        (typeof argObj.cmd === 'string' ? argObj.cmd : '') ||
        JSON.stringify(toolArgs);
      return (
        <Box
          flexDirection="column"
          marginTop={1}
          paddingLeft={2}
          borderStyle="single"
          borderColor={borderColor}
        >
          {description && <Text color={theme.text.dim}>{description}</Text>}
          <Text color={theme.text.dim}>Command:</Text>
          <Text color={theme.warning}>{cmd}</Text>
        </Box>
      );
    }

    // Write file details
    if (toolName === 'Write' || toolName === 'write_file') {
      const content = typeof argObj.content === 'string' ? argObj.content : '';
      const preview =
        content.length > 300 ? content.substring(0, 300) + '... (truncated)' : content;

      return (
        <Box
          flexDirection="column"
          marginTop={1}
          paddingLeft={2}
          borderStyle="single"
          borderColor={borderColor}
        >
          {description && <Text color={theme.text.dim}>{description}</Text>}
          <Text color={theme.text.dim}>Writing to: </Text>
          <Text bold>{String(argObj.file_path || '')}</Text>
          <Box marginTop={1} padding={1} borderStyle="round" borderColor={theme.border.default}>
            <Text color={theme.text.dim}>{preview}</Text>
          </Box>
        </Box>
      );
    }

    // Edit file details
    if (toolName === 'Edit' || toolName === 'edit_file') {
      // If we have old/new strings
      if (
        typeof argObj.old_string === 'string' &&
        typeof argObj.new_string === 'string'
      ) {
        return (
          <Box
            flexDirection="column"
            marginTop={1}
            paddingLeft={2}
            borderStyle="single"
            borderColor={borderColor}
          >
            {description && <Text color={theme.text.dim}>{description}</Text>}
            <Text color={theme.text.dim}>Editing: {String(argObj.file_path || '')}</Text>
            <Box flexDirection="column" marginTop={1}>
              <Text color={theme.error} strikethrough>
                -{' '}
                {argObj.old_string.length > 100
                  ? argObj.old_string.substring(0, 100) + '...'
                  : argObj.old_string}
              </Text>
              <Text color={theme.success}>
                +{' '}
                {argObj.new_string.length > 100
                  ? argObj.new_string.substring(0, 100) + '...'
                  : argObj.new_string}
              </Text>
            </Box>
          </Box>
        );
      }
    }

    // Default display
    const argsStr = formatToolArgs(toolName, toolArgs);
    return (
      <Box
        flexDirection="column"
        marginTop={1}
        paddingLeft={2}
        borderStyle="single"
        borderColor={borderColor}
      >
        {description && <Text color={theme.text.dim}>{description}</Text>}
        <Text color={theme.text.dim}>
          {toolName}: {argsStr}
        </Text>
      </Box>
    );
  };

  return (
    <Box flexDirection="column" padding={1} borderStyle="round" borderColor={theme.warning}>
      <Box flexDirection="row">
        <Text color={theme.warning} bold>
          ⚠️ Approval Required
        </Text>
        {actions.length > 1 && (
          <Text color={theme.text.dim}> ({actions.length} actions)</Text>
        )}
      </Box>

      {actions.map((action, index) => (
        <Box key={index} flexDirection="column">
          <Box flexDirection="row" marginTop={1}>
            {actions.length > 1 && (
              <Text color={index === selectedIndex ? theme.primary : theme.text.dim}>
                {index === selectedIndex ? '▶ ' : '  '}
              </Text>
            )}
            <Text bold>{action.name}</Text>
          </Box>
          {renderActionDetails(action, index === selectedIndex)}
        </Box>
      ))}

      <Box marginTop={1}>
        <Text>Allow {actions.length > 1 ? 'these actions' : 'this action'}? </Text>
        <Text color={theme.text.dim}>[y/N]</Text>
      </Box>
    </Box>
  );
};
