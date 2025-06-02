import { createClient } from '@supabase/supabase-js';
import { Intent, ConversationContext, FlowResult } from '../../models/conversation';
import { BaseFlowController } from './baseFlowController';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export class PollListFlowController extends BaseFlowController {
  async handleIntent(intent: Intent, context: ConversationContext): Promise<FlowResult> {
    try {
      if (intent.type === 'list_my_polls') {
        return await this.listUserPolls(context);
      } else {
        return await this.listAllPolls(context);
      }
    } catch (error) {
      return this.createErrorResult('Failed to load polls.');
    }
  }

  private async listUserPolls(context: ConversationContext): Promise<FlowResult> {
    if (context.userProfile.role !== 'admin') {
      return this.createErrorResult('Only admin users have created polls to view.');
    }

    const { data: polls } = await supabase
      .from('polls')
      .select('*')
      .eq('user_id', context.userId)
      .order('created_at', { ascending: false });

    return this.createEndFlowResult({
      polls: polls || [],
      message: this.formatPollList(polls || [], 'your polls'),
      type: 'my_polls'
    });
  }

  private async listAllPolls(context: ConversationContext): Promise<FlowResult> {
    const { data: polls } = await supabase
      .from('polls')
      .select('*')
      .eq('status', 'active')
      .order('end_date', { ascending: true });

    return this.createEndFlowResult({
      polls: polls || [],
      message: this.formatPollList(polls || [], 'available polls'),
      type: 'all_polls'
    });
  }

  private formatPollList(polls: any[], title: string): string {
    if (polls.length === 0) {
      return `No ${title} found.`;
    }

    return `Here are the ${title}:\n\n${polls.map((poll, idx) => 
      `${idx + 1}. **${poll.title}**\n   Category: ${poll.category}\n   Status: ${poll.status}`
    ).join('\n\n')}`;
  }
} 