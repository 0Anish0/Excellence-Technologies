import { IntentType, ConversationContext } from '../../models/conversation';
import { BaseFlowController } from './baseFlowController';
import { PollUpdateFlowController } from './pollUpdateFlowController';
import { PollCreationFlowController } from './pollCreationFlowController';
import { PollListFlowController } from './pollListFlowController';
import { GeneralFlowController } from './generalFlowController';

export class FlowControllerFactory {
  private static controllers = new Map<string, BaseFlowController>();

  static getController(intentType: IntentType, context: ConversationContext): BaseFlowController {
    const key = `${intentType}_${context.userProfile.role}`;
    
    if (!this.controllers.has(key)) {
      this.controllers.set(key, this.createController(intentType, context));
    }

    return this.controllers.get(key)!;
  }

  private static createController(intentType: IntentType, context: ConversationContext): BaseFlowController {
    switch (intentType) {
      case 'update_poll':
        return new PollUpdateFlowController();
      
      case 'create_poll':
        return new PollCreationFlowController();
      
      case 'list_polls':
      case 'list_my_polls':
        return new PollListFlowController();
      
      case 'greeting':
      case 'help':
      case 'general':
      default:
        return new GeneralFlowController();
    }
  }

  static clearCache(): void {
    this.controllers.clear();
  }
} 