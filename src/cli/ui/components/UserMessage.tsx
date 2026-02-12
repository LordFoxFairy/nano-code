import React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../theme.js';

interface UserMessageProps {
  content: string;
}

export const UserMessage: React.FC<UserMessageProps> = ({ content }) => {
  return (
    <Box paddingY={1}>
      <Text color={theme.primary} bold>
        ›{' '}
      </Text>
      <Text>{content}</Text>
    </Box>
  );
};
