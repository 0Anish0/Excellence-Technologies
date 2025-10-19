import { GoogleGenerativeAI } from '@google/generative-ai';
import { Intent, ConversationContext, IntentType } from '../models/conversation';
import { createLogger } from '../utils/logger';

const logger = createLogger(true);

export class IntentRecognitionService {
  private genAI?: GoogleGenerativeAI;

  constructor() {
    if (process.env.GEMINI_API_KEY) {
      this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    }
  }

  async recognizeIntent(message: string, context: ConversationContext): Promise<Intent> {
    try {
      // First try pattern-based recognition for quick responses
      const patternIntent = this.recognizeByPatterns(message, context);
      if (patternIntent.confidence > 0.8) {
        return patternIntent;
      }

      // Use AI for complex intent recognition
      const aiIntent = await this.recognizeByAI(message, context);
      
      // Return the higher confidence intent
      return aiIntent.confidence > patternIntent.confidence ? aiIntent : patternIntent;
    } catch (error) {
      logger.error('Error in intent recognition:', error);
      return this.fallbackIntent(message);
    }
  }

  private recognizeByPatterns(message: string, context: ConversationContext): Intent {
    const msg = message.toLowerCase().trim();
    const entities: Record<string, any> = {};
    
    // Check current state for context-aware recognition
    if (context.currentState) {
      return this.recognizeInStateContext(msg, context, entities);
    }

    // Enhanced poll update patterns - check FIRST before greeting
    if (this.isUpdatePollIntent(msg)) {
      entities.action = 'update';
      return { type: 'update_poll', confidence: 0.95, entities, rawText: message };
    }

    // Enhanced poll creation patterns
    if (this.isCreatePollIntent(msg)) {
      entities.action = 'create';
      return { type: 'create_poll', confidence: 0.95, entities, rawText: message };
    }

    // Enhanced poll listing patterns
    if (this.isListPollsIntent(msg)) {
      return { type: 'list_polls', confidence: 0.9, entities, rawText: message };
    }

    if (this.isListMyPollsIntent(msg)) {
      return { type: 'list_my_polls', confidence: 0.9, entities, rawText: message };
    }

    // Greeting patterns - AFTER other patterns to avoid conflicts
    if (this.isGreetingIntent(msg)) {
      return { type: 'greeting', confidence: 0.9, entities, rawText: message };
    }

    // Number selections (1, 2, 3, etc.)
    const numberMatch = msg.match(/^\s*(\d+)\s*$/);
    if (numberMatch && context.lastIntent) {
      entities.selection = parseInt(numberMatch[1]);
      return { 
        type: context.lastIntent.type, 
        confidence: 0.8, 
        entities, 
        rawText: message,
        context: { isSelection: true }
      };
    }

    // Yes/No responses
    if (this.isConfirmationIntent(msg)) {
      entities.confirmation = true;
      return { 
        type: context.lastIntent?.type || 'general', 
        confidence: 0.7, 
        entities, 
        rawText: message,
        context: { isConfirmation: true }
      };
    }

    return { type: 'general', confidence: 0.3, entities, rawText: message };
  }

  private isUpdatePollIntent(msg: string): boolean {
    const updatePatterns = [
      // Direct update phrases
      /\b(update|edit|modify|change)\s+(a\s+|the\s+)?poll\b/i,
      /\bpoll\b.*\b(update|edit|modify|change)\b/i,
      
      // Natural language variations
      /\b(can you|could you|help me|i want to|i need to)\b.*\b(update|edit|modify|change)\b.*\bpoll\b/i,
      /\bi want to\b.*\b(update|edit|modify|change)\b.*\bpoll\b/i,
      /\bedit\s+(a\s+|the\s+)?poll\b/i,
      /\bupdate\s+(a\s+|the\s+)?poll\b/i,
      
      // Poll named patterns
      /\b(edit|update|modify|change)\b.*\bpoll\s+(named|called|titled)\b/i,
      /\bpoll\s+(named|called|titled)\b.*\b(edit|update|modify|change)\b/i,
      
      // Option modification patterns
      /\b(add|include)\b.*\boption\b.*\b(to|in)\b.*\bpoll\b/i,
      /\bpoll\b.*\b(add|include)\b.*\boption\b/i
    ];
    
    return updatePatterns.some(pattern => pattern.test(msg));
  }

  private isCreatePollIntent(msg: string): boolean {
    const createPatterns = [
      /\b(create|make|add|new|build)\s+(a\s+|the\s+)?poll\b/i,
      /\bpoll\b.*\b(create|creation|make|new|build)\b/i,
      /\b(i want|i need|can you|could you)\b.*\b(create|make|new)\b.*\bpoll\b/i
    ];
    
    return createPatterns.some(pattern => pattern.test(msg));
  }

  private isListPollsIntent(msg: string): boolean {
    const listPatterns = [
      /\b(show|list|display|view|see)\b.*\bpolls?\b/i,
      /\bpolls?\b.*\b(available|active|show|list|display)\b/i,
      /\bwhat.*\bpolls?\b/i,
      /^\s*(polls?|show polls?|list polls?)\s*$/i
    ];
    
    return listPatterns.some(pattern => pattern.test(msg));
  }

  private isListMyPollsIntent(msg: string): boolean {
    const myPollsPatterns = [
      /\b(my|mine)\b.*\bpolls?\b/i,
      /\bpolls?\b.*\b(created|made|mine|my)\b/i,
      /\bshow.*\bmy.*\bpolls?\b/i
    ];
    
    return myPollsPatterns.some(pattern => pattern.test(msg));
  }

  private isGreetingIntent(msg: string): boolean {
    // Only match pure greetings, not complex sentences
    if (msg.length > 50) return false; // Long messages are probably not just greetings
    
    const greetingPatterns = [
      /^(hi|hello|hey|good morning|good afternoon|good evening|greetings)(!|\s)*$/i,
      /^(what's up|sup|how are you|how's it going)(!|\s)*$/i,
      /^(start|begin|help)(!|\s)*$/i
    ];
    
    return greetingPatterns.some(pattern => pattern.test(msg));
  }

  private isConfirmationIntent(msg: string): boolean {
    const confirmPatterns = [
      /^(yes|yeah|yep|sure|ok|okay|confirm|correct|right|exactly|that's right|that's correct)(!|\s)*$/i
    ];
    
    return confirmPatterns.some(pattern => pattern.test(msg));
  }

  private recognizeInStateContext(
    msg: string, 
    context: ConversationContext, 
    entities: Record<string, any>
  ): Intent {
    const state = context.currentState!;
    
    switch (state.type) {
      case 'poll_update':
        return this.recognizeUpdateIntents(msg, context, entities);
      case 'poll_creation':
        return this.recognizeCreationIntents(msg, context, entities);
      default:
        return { type: 'general', confidence: 0.5, entities, rawText: msg };
    }
  }

  private recognizeUpdateIntents(
    msg: string, 
    context: ConversationContext, 
    entities: Record<string, any>
  ): Intent {
    const state = context.currentState!;
    
    // Extract poll references
    const pollMatch = msg.match(/poll\s*(\d+|first|1st|second|2nd)/i);
    if (pollMatch) {
      entities.pollReference = pollMatch[1];
    }

    // Handle field selection when user is in poll update flow
    if (state.step === 'select_field') {
      if (this.matchesFieldSelection(msg)) {
        entities.fieldType = this.extractFieldType(msg);
        return { type: 'update_poll', confidence: 0.95, entities, rawText: msg };
      }
    }

    // Extract specific edit requests
    if (this.matchesPattern(msg, ['add', 'include']) && 
        this.matchesPattern(msg, ['option', 'choice', 'district'])) {
      entities.action = 'add_options';
      entities.options = this.extractOptions(msg);
      return { type: 'update_poll', confidence: 0.9, entities, rawText: msg };
    }

    // Simple confirmations in update flow
    if (this.isConfirmationIntent(msg)) {
      entities.confirmation = true;
      return { type: 'update_poll', confidence: 0.9, entities, rawText: msg };
    }

    return { type: 'update_poll', confidence: 0.6, entities, rawText: msg };
  }

  private matchesFieldSelection(msg: string): boolean {
    const fieldPatterns = [
      /\b(option|choice|voting)\b/i,
      /\btitle\b/i,
      /\b(end|date|deadline)\b/i,
      /\bcategory\b/i,
      /^\s*1\s*$/,  // Number 1 for options
      /^\s*2\s*$/,  // Number 2 for title
      /^\s*3\s*$/,  // Number 3 for end date
      /^\s*4\s*$/   // Number 4 for category
    ];
    
    return fieldPatterns.some(pattern => pattern.test(msg));
  }

  private extractFieldType(msg: string): string {
    if (/\b(option|choice|voting)\b/i.test(msg) || /^\s*1\s*$/.test(msg)) {
      return 'options';
    }
    if (/\btitle\b/i.test(msg) || /^\s*2\s*$/.test(msg)) {
      return 'title';
    }
    if (/\b(end|date|deadline)\b/i.test(msg) || /^\s*3\s*$/.test(msg)) {
      return 'end_date';
    }
    if (/\bcategory\b/i.test(msg) || /^\s*4\s*$/.test(msg)) {
      return 'category';
    }
    return 'options'; // Default to options
  }

  private recognizeCreationIntents(
    msg: string, 
    context: ConversationContext, 
    entities: Record<string, any>
  ): Intent {
    // Creation flow recognition logic
    return { type: 'create_poll', confidence: 0.6, entities, rawText: msg };
  }

  private async recognizeByAI(message: string, context: ConversationContext): Promise<Intent> {
    if (!this.genAI) {
      return this.fallbackIntent(message);
    }

    try {
      const model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
      
      const prompt = this.buildAIPrompt(message, context);
      const result = await model.generateContent(prompt);
      const response = result.response.text();
      
      return this.parseAIResponse(response, message);
    } catch (error) {
      logger.error('AI intent recognition failed:', error);
      return this.fallbackIntent(message);
    }
  }

  private buildAIPrompt(message: string, context: ConversationContext): string {
    return `You are an expert at understanding user intent in a poll management system.

CONTEXT:
- User role: ${context.userProfile.role}
- Current state: ${context.currentState?.type || 'idle'}
- Last few messages: ${context.conversationHistory.slice(-3).map(m => `${m.role}: ${m.content}`).join('\n')}

USER MESSAGE: "${message}"

AVAILABLE INTENTS:
- greeting: User is greeting or starting conversation
- list_polls: User wants to see available polls
- list_my_polls: User wants to see their created polls (admin only)
- create_poll: User wants to create a new poll
- update_poll: User wants to edit/modify/update an existing poll
- delete_poll: User wants to delete a poll
- vote: User wants to vote on a poll
- view_results: User wants to see poll results
- help: User needs help or guidance
- general: General conversation or unclear intent

INSTRUCTIONS:
1. Analyze the user message in context
2. Consider conversation flow and state
3. Extract relevant entities (poll IDs, options, confirmations, etc.)
4. Respond with ONLY a JSON object in this format:

{
  "intent": "intent_name",
  "confidence": 0.85,
  "entities": {
    "pollId": "123",
    "action": "add_options",
    "options": ["option1", "option2"],
    "confirmation": true
  },
  "reasoning": "Brief explanation"
}`;
  }

  private parseAIResponse(response: string, message: string): Intent {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found');
      
      const parsed = JSON.parse(jsonMatch[0]);
      
      return {
        type: parsed.intent as IntentType,
        confidence: Math.min(parsed.confidence || 0.5, 1.0),
        entities: parsed.entities || {},
        rawText: message,
        context: { reasoning: parsed.reasoning }
      };
    } catch (error) {
      logger.error('Failed to parse AI response:', error);
      return this.fallbackIntent(message);
    }
  }

  private matchesPattern(text: string, patterns: string[]): boolean {
    return patterns.some(pattern => text.includes(pattern));
  }

  private extractOptions(text: string): string[] {
    // Extract options from various formats
    const options: string[] = [];
    
    // Handle "add X and Y" format
    const addMatch = text.match(/add\s+(?:these?\s+)?(?:two\s+)?(?:more\s+)?(?:new\s+)?(?:districts?\s*[,:]\s*)?(.+)/i);
    if (addMatch) {
      const optionsText = addMatch[1]
        .replace(/,?\s*and\s+/g, ',')
        .replace(/^these?\s+/i, '');
      
      if (optionsText.includes(',')) {
        options.push(...optionsText.split(',').map(opt => opt.trim()).filter(opt => opt));
      } else {
        options.push(optionsText.trim());
      }
    }
    
    return options;
  }

  private fallbackIntent(message: string): Intent {
    return {
      type: 'general',
      confidence: 0.2,
      entities: {},
      rawText: message
    };
  }
} 