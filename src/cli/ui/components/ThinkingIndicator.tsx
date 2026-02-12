import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { theme } from '../theme.js';

interface ThinkingIndicatorProps {
  text?: string;
}

export const ThinkingIndicator: React.FC<ThinkingIndicatorProps> = ({ text = 'Thinking' }) => {
  return (
    <Box flexDirection="row" paddingY={1}>
      <Text color={theme.warning}>
        <Spinner type="dots" />
      </Text>
      <Text color={theme.text.dim}> {text}...</Text>
    </Box>
  );
};
