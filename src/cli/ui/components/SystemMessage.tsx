import React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../theme.js';

interface SystemMessageProps {
  content: string;
  isError?: boolean;
  isSuccess?: boolean;
}

export const SystemMessage: React.FC<SystemMessageProps> = ({
  content,
  isError = false,
  isSuccess = false,
}) => {
  let color = theme.text.dim;
  let prefix = 'ℹ';

  if (isError) {
    color = theme.error;
    prefix = '✗';
  } else if (isSuccess) {
    color = theme.success;
    prefix = '✓';
  }

  return (
    <Box flexDirection="row" paddingY={1}>
      <Text color={color}>{prefix} </Text>
      <Text color={color}>{content}</Text>
    </Box>
  );
};
