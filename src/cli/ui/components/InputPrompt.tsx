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
  /** Whether plan mode is active */
  planMode?: boolean;
}

export const InputPrompt: React.FC<InputPromptProps> = ({
  prompt = '>',
  onSubmit,
  value,
  onChange,
  disabled = false,
  planMode = false,
}) => {
  // Build the prompt with plan mode indicator
  const promptColor = planMode ? theme.warning : theme.primary;

  return (
    <Box flexDirection="row" paddingY={1}>
      {planMode && (
        <Box marginRight={1}>
          <Text color={theme.warning} bold>
            [PLAN]
          </Text>
        </Box>
      )}
      <Box marginRight={1}>
        <Text color={promptColor} bold>
          {prompt}
        </Text>
      </Box>
      {!disabled && (
        <TextInput
          value={value}
          onChange={onChange}
          onSubmit={onSubmit}
          placeholder={planMode ? "Plan mode: changes tracked but not executed..." : "Type a message (or /help)..."}
        />
      )}
      {disabled && <Text color={theme.text.dim}>Processing...</Text>}
    </Box>
  );
};
