/**
 * Prompt for suggesting poll options based on the topic
 * @param topic - The poll topic or question
 * @returns A prompt for suggesting poll options
 */
export const optionSuggestionPrompt = (topic: string): string => {
  return `You are PollBot, assisting with poll creation. The user is creating a poll with the topic: "${topic}".

Suggest 4-6 relevant and concise poll options (each 5-15 words) that users can vote on.
Format the response as a numbered list of options.

Example:
1. Option one
2. Option two
3. Option three
4. Option four

Make sure the options:
- Are directly relevant to the topic
- Cover the most likely/popular choices
- Are distinct from each other
- Are clear and easy to understand
- Are neutral and unbiased

Respond with ONLY the numbered list, nothing else.`;
}; 