import React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../theme.js';

interface WelcomeScreenProps {
  version?: string;
  cwd?: string;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  version = '0.1.0',
  cwd = process.cwd(),
}) => {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={theme.primary}
        paddingX={2}
        paddingY={1}
      >
        <Box marginBottom={1}>
          <Text bold color={theme.primary}>
            NanoCode
          </Text>
          <Text color={theme.text.dim}> v{version}</Text>
        </Box>

        <Box flexDirection="row" justifyContent="space-between">
          {/* Left side: Welcome text */}
          <Box flexDirection="column">
            <Text>Welcome to NanoCode</Text>
            <Text color={theme.text.dim}>The open-source AI coding assistant</Text>
          </Box>

          {/* Right side: Tips */}
          <Box flexDirection="column" marginLeft={4}>
            <Text color={theme.text.dim}>Tips:</Text>
            <Box flexDirection="row">
              <Text color={theme.secondary}>/help</Text>
              <Text color={theme.text.dim}> - commands</Text>
            </Box>
            <Box flexDirection="row">
              <Text color={theme.secondary}>/model</Text>
              <Text color={theme.text.dim}> - switch model</Text>
            </Box>
            <Box flexDirection="row">
              <Text color={theme.secondary}>/clear</Text>
              <Text color={theme.text.dim}> - reset context</Text>
            </Box>
          </Box>
        </Box>
      </Box>

      {/* Current working directory */}
      <Box marginTop={1} marginLeft={1}>
        <Text color={theme.text.dim}>cwd: </Text>
        <Text color={theme.info}>{cwd}</Text>
      </Box>
    </Box>
  );
};
