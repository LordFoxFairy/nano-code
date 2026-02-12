import React from 'react';
import { Box, Text } from 'ink';
import { marked } from 'marked';
import TerminalRenderer from 'marked-terminal';

// Configure marked for terminal output
marked.setOptions({
  // @ts-expect-error - marked-terminal types don't match perfectly
  renderer: new TerminalRenderer({
    width: process.stdout.columns || 80,
    reflowText: true,
  }),
});

interface AssistantMessageProps {
  content: string;
}

export const AssistantMessage: React.FC<AssistantMessageProps> = ({ content }) => {
  // Parse markdown to ANSI-styled text
  const renderedContent = marked(content) as string;

  return (
    <Box flexDirection="column" paddingY={1}>
      <Text>{renderedContent.trim()}</Text>
    </Box>
  );
};
