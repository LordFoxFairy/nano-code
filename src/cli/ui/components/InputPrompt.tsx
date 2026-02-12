import React from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import { theme } from '../theme.js';

interface InputPromptProps {
  prompt?: string;
  onSubmit: (value: string) => void;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export const InputPrompt: React.FC<InputPromptProps> = ({
  prompt = '›',
  onSubmit,
  value,
  onChange,
  disabled = false,
}) => {
  return (
    <Box flexDirection="row" paddingY={1}>
      <Box marginRight={1}>
        <Text color={theme.primary} bold>
          {prompt}
        </Text>
      </Box>
      {!disabled && (
        <TextInput
          value={value}
          onChange={onChange}
          onSubmit={onSubmit}
          placeholder="Type a message (or /help)..."
        />
      )}
      {disabled && <Text color={theme.text.dim}>Processing...</Text>}
    </Box>
  );
};
