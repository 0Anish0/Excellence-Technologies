import { Intent, ConversationContext, FlowResult } from '../../models/conversation';
import { BaseFlowController } from './baseFlowController';

export class GeneralFlowController extends BaseFlowController {
  async handleIntent(intent: Intent, context: ConversationContext): Promise<FlowResult> {
    switch (intent.type) {
      case 'greeting':
        return this.handleGreeting(context);
      case 'help':
        return this.handleHelp(context);
      default:
        return this.handleGeneral(intent, context);
    }
  }

  private handleGreeting(context: ConversationContext): FlowResult {
    const capabilities = context.userProfile.role === 'admin' 
      ? ['Viewing polls', 'Voting on polls', 'Creating polls', 'Updating polls']
      : ['Viewing polls', 'Voting on polls'];

    return this.createEndFlowResult({
      message: `Hi! I'm PollBot, your friendly assistant for polls and voting! 🗳️\n\nI can help you with:\n${capabilities.map(cap => `• ${cap}`).join('\n')}\n\nWhat would you like to do today?`,
      type: 'greeting'
    });
  }

  private handleHelp(context: ConversationContext): FlowResult {
    return this.createEndFlowResult({
      message: "I can help you with polls! Here are some things you can say:\n\n• \"show polls\" - See available polls\n• \"update poll\" - Edit your polls (admin only)\n• \"create poll\" - Make a new poll (admin only)\n\nJust talk to me naturally and I'll understand!",
      type: 'help'
    });
  }

  private handleGeneral(intent: Intent, context: ConversationContext): FlowResult {
    return this.createEndFlowResult({
      message: "I'm here to help with polls and voting! You can ask me to show polls, update polls (if you're an admin), or help with voting. What would you like to do?",
      type: 'general'
    });
  }
} 