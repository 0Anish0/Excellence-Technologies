import { Intent, ConversationContext, FlowResult } from '../../models/conversation';

export abstract class BaseFlowController {
  abstract handleIntent(intent: Intent, context: ConversationContext): Promise<FlowResult>;

  protected createSuccessResult(data?: any, nextStep?: string): FlowResult {
    return {
      success: true,
      data,
      nextStep,
      shouldEndFlow: false
    };
  }

  protected createErrorResult(error: string): FlowResult {
    return {
      success: false,
      error,
      shouldEndFlow: true
    };
  }

  protected createEndFlowResult(data?: any): FlowResult {
    return {
      success: true,
      data,
      shouldEndFlow: true
    };
  }
} 