import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { theme } from '../theme.js';
import { formatToolArgs } from '../utils.js';

interface ToolExecutionProps {
  toolName: string;
  args?: any;
  result?: string;
  isLoading?: boolean;
  isError?: boolean;
}

const MAX_RESULT_LINES = 8;

const truncateResult = (result: string): { lines: string[]; truncated: number } => {
  const allLines = result.split('\n');
  if (allLines.length <= MAX_RESULT_LINES) {
    return { lines: allLines, truncated: 0 };
  }
  return {
    lines: allLines.slice(0, MAX_RESULT_LINES),
    truncated: allLines.length - MAX_RESULT_LINES,
  };
};

export const ToolExecution: React.FC<ToolExecutionProps> = ({
  toolName,
  args,
  result,
  isLoading,
  isError = false,
}) => {
  const argsStr = formatToolArgs(toolName, args);
  const displayArgs = argsStr ? `(${argsStr})` : '';

  if (isLoading) {
    return (
      <Box flexDirection="column">
        <Box flexDirection="row">
          <Text color={theme.info}>
            <Spinner type="dots" />
          </Text>
          <Text> </Text>
          <Text bold>{toolName}</Text>
          <Text color={theme.text.dim}>{displayArgs}</Text>
        </Box>
      </Box>
    );
  }

  const bulletColor = isError ? theme.error : theme.success;
  const bulletChar = isError ? '✗' : '●';

  // Process result for tree-style display
  let resultContent: React.ReactNode = null;
  if (result) {
    const { lines, truncated } = truncateResult(result);
    resultContent = (
      <Box flexDirection="column" marginLeft={2}>
        {lines.map((line, idx) => (
          <Box key={idx} flexDirection="row">
            <Text color={theme.border.default}>{idx === 0 ? '└ ' : '  '}</Text>
            <Text color={theme.text.dim}>{line}</Text>
          </Box>
        ))}
        {truncated > 0 && (
          <Box flexDirection="row">
            <Text color={theme.border.default}> </Text>
            <Text color={theme.text.dim}>... +{truncated} lines</Text>
          </Box>
        )}
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box flexDirection="row">
        <Text color={bulletColor}>{bulletChar} </Text>
        <Text bold>{toolName}</Text>
        <Text color={theme.text.dim}>{displayArgs}</Text>
      </Box>
      {resultContent}
    </Box>
  );
};
