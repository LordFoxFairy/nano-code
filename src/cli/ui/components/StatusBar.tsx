import React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../theme.js';

interface StatusBarProps {
  model: string;
  tokens: number;
  cost: number;
  isProcessing?: boolean;
  /** Whether plan mode is active */
  planMode?: boolean;
}

const formatTokens = (tokens: number): string => {
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}k`;
  }
  return tokens.toString();
};

const formatCost = (cost: number): string => {
  if (cost < 0.01) {
    return '<$0.01';
  }
  return `$${cost.toFixed(2)}`;
};

const getModelDisplayName = (model: string): string => {
  const modelMap: Record<string, string> = {
    opus: 'Claude Opus',
    sonnet: 'Claude Sonnet',
    haiku: 'Claude Haiku',
  };
  return modelMap[model] || model;
};

export const StatusBar: React.FC<StatusBarProps> = ({
  model,
  tokens,
  cost,
  isProcessing = false,
  planMode = false,
}) => {
  const borderColor = planMode ? theme.warning : theme.border.default;

  return (
    <Box
      flexDirection="row"
      justifyContent="space-between"
      borderStyle="single"
      borderColor={borderColor}
      paddingX={1}
    >
      <Box flexDirection="row">
        {planMode && (
          <Text color={theme.warning} bold>
            PLAN MODE{' '}
          </Text>
        )}
        <Text color={theme.primary}>{getModelDisplayName(model)}</Text>
        {isProcessing && <Text color={theme.warning}> (processing)</Text>}
      </Box>

      <Box flexDirection="row">
        <Text color={theme.text.dim}>{formatTokens(tokens)} tokens</Text>
        <Text color={theme.border.default}> | </Text>
        <Text color={theme.text.dim}>{formatCost(cost)}</Text>
        {planMode && (
          <>
            <Text color={theme.border.default}> | </Text>
            <Text color={theme.warning}>changes tracked</Text>
          </>
        )}
      </Box>
    </Box>
  );
};
