import { createClient } from '@supabase/supabase-js';
import { Intent, ConversationContext, FlowResult } from '../../models/conversation';
import { BaseFlowController } from './baseFlowController';
import { createLogger } from '../../utils/logger';

const logger = createLogger(true);
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export class PollUpdateFlowController extends BaseFlowController {
  async handleIntent(intent: Intent, context: ConversationContext): Promise<FlowResult> {
    try {
      // Check if user is admin
      if (context.userProfile.role !== 'admin') {
        return this.createErrorResult('Only admin users can update polls.');
      }

      // Handle different stages of poll update
      if (!context.currentState || context.currentState.type !== 'poll_update') {
        return await this.startPollUpdateFlow(intent, context);
      }

      return await this.continueUpdateFlow(intent, context);
    } catch (error) {
      logger.error('Error in poll update flow:', error);
      return this.createErrorResult('An error occurred while updating the poll.');
    }
  }

  private async startPollUpdateFlow(intent: Intent, context: ConversationContext): Promise<FlowResult> {
    // Get user's polls
    const { data: userPolls } = await supabase
      .from('polls')
      .select('id, title, category, status, end_date, created_at')
      .eq('user_id', context.userId)
      .order('created_at', { ascending: false });

    if (!userPolls || userPolls.length === 0) {
      return this.createEndFlowResult({
        message: "You don't have any polls to update. Would you like to create a new poll instead?",
        type: 'no_polls'
      });
    }

    // Check if user mentioned a specific poll
    const pollRef = this.extractPollReference(intent.rawText, userPolls);
    if (pollRef) {
      // User specified which poll to edit, proceed to field selection
      return await this.selectPollField(pollRef, context);
    }

    // Show poll list for selection
    return this.createSuccessResult({
      polls: userPolls,
      message: this.generatePollListMessage(userPolls),
      type: 'poll_list',
      contextUpdate: {
        currentState: {
          type: 'poll_update',
          step: 'select_poll',
          data: { availablePolls: userPolls }
        }
      }
    });
  }

  private async continueUpdateFlow(intent: Intent, context: ConversationContext): Promise<FlowResult> {
    const state = context.currentState!;
    
    switch (state.step) {
      case 'select_poll':
        return await this.handlePollSelection(intent, context);
      case 'select_field':
        return await this.handleFieldSelection(intent, context);
      case 'update_options':
        return await this.handleOptionsUpdate(intent, context);
      case 'confirm_update':
        return await this.handleUpdateConfirmation(intent, context);
      default:
        return this.createErrorResult('Unknown update step.');
    }
  }

  private async handlePollSelection(intent: Intent, context: ConversationContext): Promise<FlowResult> {
    const state = context.currentState!;
    const availablePolls = state.data?.availablePolls || [];

    // Try to extract poll selection
    let selectedPoll = null;
    
    // Check for number selection
    if (intent.entities.selection) {
      const index = intent.entities.selection - 1;
      if (index >= 0 && index < availablePolls.length) {
        selectedPoll = availablePolls[index];
      }
    }

    // Check for poll name/title matching
    if (!selectedPoll) {
      selectedPoll = this.findPollByTitle(intent.rawText, availablePolls);
    }

    if (!selectedPoll) {
      return this.createSuccessResult({
        message: "I couldn't identify which poll you want to update. Please tell me the number (1, 2, 3...) or part of the poll title.",
        type: 'clarification_needed'
      });
    }

    // Proceed to field selection
    return await this.selectPollField(selectedPoll, context);
  }

  private async selectPollField(selectedPoll: any, context: ConversationContext): Promise<FlowResult> {
    return this.createSuccessResult({
      poll: selectedPoll,
      message: `Great! You selected "${selectedPoll.title}". What would you like to update?\n\n1. **Options** - Add, remove, or change voting choices\n2. **Title** - Change the poll question\n3. **End Date** - Extend the voting period\n4. **Category** - Change the poll category\n\nJust tell me what you'd like to update!`,
      type: 'field_selection',
      contextUpdate: {
        currentState: {
          type: 'poll_update',
          step: 'select_field',
          data: { selectedPoll }
        }
      }
    });
  }

  private async handleFieldSelection(intent: Intent, context: ConversationContext): Promise<FlowResult> {
    const selectedPoll = context.currentState!.data?.selectedPoll;
    const message = intent.rawText.toLowerCase();

    // Check if user specified field type in entities
    const fieldType = intent.entities.fieldType;
    
    if (fieldType === 'options' || this.matchesOptions(message)) {
      // Get current options
      const { data: currentOptions } = await supabase
        .from('poll_options')
        .select('*')
        .eq('poll_id', selectedPoll.id)
        .order('position');

      return this.createSuccessResult({
        poll: selectedPoll,
        currentOptions: currentOptions || [],
        message: this.generateOptionsUpdateMessage(selectedPoll, currentOptions || []),
        type: 'options_update',
        contextUpdate: {
          currentState: {
            type: 'poll_update',
            step: 'update_options',
            data: { selectedPoll, currentOptions: currentOptions || [] }
          }
        }
      });
    }

    // Handle other field types (title, category, end_date) - simplified for now
    return this.createSuccessResult({
      message: "I can help you update poll options right now. For other changes, please say 'options' to update the voting choices.",
      type: 'field_not_supported'
    });
  }

  private async handleOptionsUpdate(intent: Intent, context: ConversationContext): Promise<FlowResult> {
    const state = context.currentState!;
    const selectedPoll = state.data?.selectedPoll;
    const currentOptions = state.data?.currentOptions || [];

    // Handle confirmation
    if (intent.entities.confirmation || intent.context?.isConfirmation) {
      return await this.executeOptionsUpdate(context);
    }

    // Extract options to add
    const optionsToAdd = intent.entities.options || this.extractOptionsFromText(intent.rawText);
    
    if (optionsToAdd && optionsToAdd.length > 0) {
      // Prepare update preview
      const existingOptionTexts = currentOptions.map((opt: any) => opt.text);
      const newOptions = [...existingOptionTexts, ...optionsToAdd];

      return this.createSuccessResult({
        poll: selectedPoll,
        currentOptions: existingOptionTexts,
        newOptions: optionsToAdd,
        finalOptions: newOptions,
        message: this.generateUpdatePreview(selectedPoll, existingOptionTexts, optionsToAdd, newOptions),
        type: 'update_preview',
        contextUpdate: {
          currentState: {
            type: 'poll_update',
            step: 'confirm_update',
            data: { 
              selectedPoll, 
              currentOptions, 
              optionsToAdd, 
              finalOptions: newOptions 
            }
          }
        }
      });
    }

    return this.createSuccessResult({
      message: "Please tell me which options you'd like to add. For example: 'add Mumbai, Delhi' or 'include Option A, Option B'",
      type: 'options_needed'
    });
  }

  private async handleUpdateConfirmation(intent: Intent, context: ConversationContext): Promise<FlowResult> {
    if (!intent.entities.confirmation && !intent.context?.isConfirmation) {
      return this.createSuccessResult({
        message: "Please confirm the update by saying 'yes', 'confirm', or 'that's correct'",
        type: 'confirmation_needed'
      });
    }

    return await this.executeOptionsUpdate(context);
  }

  private async executeOptionsUpdate(context: ConversationContext): Promise<FlowResult> {
    try {
      const state = context.currentState!;
      const selectedPoll = state.data?.selectedPoll;
      const finalOptions = state.data?.finalOptions || [];

      // Delete existing options
      await supabase
        .from('poll_options')
        .delete()
        .eq('poll_id', selectedPoll.id);

      // Insert new options
      const optionsToInsert = finalOptions.map((option: string, index: number) => ({
        poll_id: selectedPoll.id,
        text: option,
        position: index + 1
      }));

      await supabase
        .from('poll_options')
        .insert(optionsToInsert);

      return this.createEndFlowResult({
        message: `✅ **Poll Updated Successfully!**\n\nPoll "${selectedPoll.title}" now has ${finalOptions.length} options:\n${finalOptions.map((opt: string, i: number) => `${i + 1}. ${opt}`).join('\n')}\n\nUsers can now vote with the updated options!`,
        type: 'update_success',
        pollId: selectedPoll.id
      });

    } catch (error) {
      logger.error('Error executing options update:', error);
      return this.createErrorResult('Failed to update the poll options. Please try again.');
    }
  }

  // Helper methods
  private extractPollReference(text: string, polls: any[]): any | null {
    // Check for poll title mentions
    for (const poll of polls) {
      if (text.toLowerCase().includes(poll.title.toLowerCase().substring(0, 10))) {
        return poll;
      }
    }

    // Check for "district" poll specifically
    if (text.toLowerCase().includes('district')) {
      return polls.find(poll => 
        poll.title.toLowerCase().includes('district') || 
        poll.title.toLowerCase().includes('distric')
      ) || null;
    }

    return null;
  }

  private findPollByTitle(text: string, polls: any[]): any | null {
    const searchText = text.toLowerCase();
    
    return polls.find(poll => {
      const title = poll.title.toLowerCase();
      return title.includes(searchText) || searchText.includes(title.substring(0, 15));
    }) || null;
  }

  private matchesOptions(text: string): boolean {
    return text.includes('option') || text.includes('choice') || 
           text.includes('1') || text.includes('first');
  }

  private extractOptionsFromText(text: string): string[] {
    const patterns = [
      /add\s+(?:these?\s+)?(?:two\s+)?(?:more\s+)?(?:new\s+)?(?:districts?\s*[,:]\s*)?(.+)/i,
      /include\s+(.+)/i,
      /(?:also\s+)?(?:new\s+)?options?\s*[,:]\s*(.+)/i
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const optionsText = match[1]
          .replace(/,?\s*and\s+/g, ',')
          .replace(/^these?\s+/i, '');
        
        if (optionsText.includes(',')) {
          return optionsText.split(',').map(opt => opt.trim()).filter(opt => opt);
        } else {
          return [optionsText.trim()];
        }
      }
    }

    return [];
  }

  private generatePollListMessage(polls: any[]): string {
    return `Here are your polls that you can update:\n\n${polls.map((poll, idx) => 
      `${idx + 1}. **${poll.title}**\n   Category: ${poll.category} | Status: ${poll.status}`
    ).join('\n\n')}\n\nWhich poll would you like to update? Just tell me the number or name!`;
  }

  private generateOptionsUpdateMessage(poll: any, currentOptions: any[]): string {
    return `Perfect! Let's update the options for **"${poll.title}"**\n\n**Current options:**\n${currentOptions.map((opt, idx) => `${idx + 1}. ${opt.text}`).join('\n')}\n\nWhat options would you like to add? For example:\n• "add Mumbai, Delhi"\n• "include Option A, Option B"`;
  }

  private generateUpdatePreview(poll: any, current: string[], adding: string[], final: string[]): string {
    return `**Update Preview for "${poll.title}"**\n\n**Current options:**\n${current.map((opt, idx) => `${idx + 1}. ${opt}`).join('\n')}\n\n**Adding:**\n${adding.map((opt, idx) => `${current.length + idx + 1}. ${opt}`).join('\n')}\n\n**Final options list:**\n${final.map((opt, idx) => `${idx + 1}. ${opt}`).join('\n')}\n\nIs this correct? Say "yes" to update the poll!`;
  }
} 