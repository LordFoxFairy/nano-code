import React from 'react';
import { Box, Text, useInput } from 'ink';
import { theme } from '../theme.js';
import { formatToolArgs } from '../utils.js';

interface HITLApprovalProps {
  toolName: string;
  toolArgs: any;
  onApprove: () => void;
  onReject: () => void;
}

export const HITLApproval: React.FC<HITLApprovalProps> = ({
  toolName,
  toolArgs,
  onApprove,
  onReject,
}) => {
  useInput((input, key) => {
    if (input === 'y' || input === 'Y') {
      onApprove();
    } else if (input === 'n' || input === 'N') {
      onReject();
    } else if (key.return) {
      // Default to No for HITL safety
      onReject();
    }
  });

  const renderDetails = () => {
    // Special formatting for Bash/Exec tools
    if (toolName === 'Bash' || toolName === 'execute' || toolName === 'RunCommand') {
      const cmd = toolArgs.command || toolArgs.cmd || JSON.stringify(toolArgs);
      return (
        <Box
          flexDirection="column"
          marginTop={1}
          paddingLeft={2}
          borderStyle="single"
          borderColor={theme.border.default}
        >
          <Text color={theme.text.dim}>Command:</Text>
          <Text color={theme.warning}>{cmd}</Text>
        </Box>
      );
    }

    // Write file details
    if (toolName === 'Write' || toolName === 'write_file') {
      const content = toolArgs.content || '';
      const preview =
        content.length > 300 ? content.substring(0, 300) + '... (truncated)' : content;

      return (
        <Box
          flexDirection="column"
          marginTop={1}
          paddingLeft={2}
          borderStyle="single"
          borderColor={theme.border.default}
        >
          <Text color={theme.text.dim}>Writing to: </Text>
          <Text bold>{toolArgs.file_path}</Text>
          <Box marginTop={1} padding={1} borderStyle="round" borderColor={theme.border.default}>
            <Text color={theme.text.dim}>{preview}</Text>
          </Box>
        </Box>
      );
    }

    // Edit file details
    if (toolName === 'Edit' || toolName === 'edit_file') {
      // If we have old/new strings
      if (toolArgs.old_string && toolArgs.new_string) {
        return (
          <Box
            flexDirection="column"
            marginTop={1}
            paddingLeft={2}
            borderStyle="single"
            borderColor={theme.border.default}
          >
            <Text color={theme.text.dim}>Editing: {toolArgs.file_path}</Text>
            <Box flexDirection="column" marginTop={1}>
              <Text color={theme.error} strikethrough>
                -{' '}
                {toolArgs.old_string.length > 100
                  ? toolArgs.old_string.substring(0, 100) + '...'
                  : toolArgs.old_string}
              </Text>
              <Text color={theme.success}>
                +{' '}
                {toolArgs.new_string.length > 100
                  ? toolArgs.new_string.substring(0, 100) + '...'
                  : toolArgs.new_string}
              </Text>
            </Box>
          </Box>
        );
      }
    }

    // Default display
    const argsStr = formatToolArgs(toolName, toolArgs);
    return (
      <Box marginTop={1} paddingLeft={2}>
        <Text color={theme.text.dim}>Args: {argsStr}</Text>
      </Box>
    );
  };

  return (
    <Box flexDirection="column" padding={1} borderStyle="round" borderColor={theme.warning}>
      <Box flexDirection="row">
        <Text color={theme.warning} bold>
          ⚠️ Approval Required:{' '}
        </Text>
        <Text bold>{toolName}</Text>
      </Box>

      {renderDetails()}

      <Box marginTop={1}>
        <Text>Allow this action? </Text>
        <Text color={theme.text.dim}>[y/N]</Text>
      </Box>
    </Box>
  );
};
