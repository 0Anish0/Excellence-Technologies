/**
 * Prompt for detecting poll categories from user input
 * @param topic - The topic or message provided by the user
 * @returns The category detection prompt
 */
export const categoryPrompt = (topic: string): string => {
  return `You are a category classifier for a polling application.

The user has provided the following topic for a poll: "${topic}"

Categorize this topic into one of the following categories:
- Technology: For topics related to software, hardware, apps, internet, devices, AI, programming, etc.
- Politics: For topics related to government, elections, policies, laws, political parties, candidates, etc.
- Entertainment: For topics related to movies, music, TV shows, celebrities, sports, games, etc.
- Other: For any topics that don't fit the above categories

Respond with ONLY the category name, nothing else.`;
}; 