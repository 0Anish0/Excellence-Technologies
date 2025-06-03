/**
 * Enhanced prompt for detecting poll categories from user input with intelligent classification
 * @param topic - The topic or message provided by the user
 * @param conversationHistory - Previous messages for context
 * @returns The enhanced category detection prompt
 */
export const categoryPrompt = (topic: string, conversationHistory?: string): string => {
  return `You are an intelligent category classifier for PollBot, a polling application assistant.

CONTEXT: ${conversationHistory ? `Previous conversation: ${conversationHistory}` : 'This is a new category classification request.'}

USER INPUT: "${topic}"

TASK: Intelligently categorize this topic into the most appropriate category.

AVAILABLE CATEGORIES:
1. **Technology**: Software, hardware, apps, internet, devices, AI, programming, cybersecurity, social media platforms, gaming tech, startup companies, tech trends, digital tools, coding languages, operating systems, cloud services, etc.

2. **Politics**: Government, elections, policies, laws, political parties, candidates, voting systems, international relations, civic issues, public administration, political movements, constitutional matters, governance, political ideologies, etc.

3. **Entertainment**: Movies, music, TV shows, celebrities, sports, games, books, streaming services, concerts, festivals, theater, art, comedy, reality shows, anime, podcasts, social media content, etc.

4. **Other**: Health & wellness, education, lifestyle, food & dining, travel, business & finance, science & research, environment, relationships, hobbies, fashion, home & garden, personal development, etc.

INTELLIGENT CLASSIFICATION RULES:
- Consider implied meanings and context clues
- Look for keywords that strongly indicate a category
- Consider the likely voting audience and purpose
- If borderline between categories, choose the most specific fit
- Consider subcategories (e.g., "esports" = Entertainment, "AI ethics" = Technology)

EDGE CASE HANDLING:
- Tech companies in news → Technology
- Celebrity political opinions → Entertainment  
- Sports politics/governance → Entertainment
- Political use of technology → Politics
- Gaming/streaming platforms → Entertainment
- Tech policy/regulation → Politics

RESPONSE FORMAT: Return ONLY the category name (Technology, Politics, Entertainment, or Other). No explanations or additional text.

EXAMPLES:
- "iPhone vs Android" → Technology
- "Best Marvel movie" → Entertainment
- "Climate change policy" → Politics
- "Work from home preferences" → Other
- "AI replacing jobs" → Technology
- "Olympic games hosting" → Entertainment`;
};