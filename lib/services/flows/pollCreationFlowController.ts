import { Intent, ConversationContext, FlowResult } from '../../models/conversation';
import { BaseFlowController } from './baseFlowController';

export class PollCreationFlowController extends BaseFlowController {
  async handleIntent(intent: Intent, context: ConversationContext): Promise<FlowResult> {
    if (context.userProfile.role !== 'admin') {
      return this.createErrorResult('Only admin users can create polls.');
    }

    return this.createSuccessResult({
      message: "Poll creation is being enhanced. For now, please use the existing interface.",
      type: 'creation_placeholder'
    });
  }
} 