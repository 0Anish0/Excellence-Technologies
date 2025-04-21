'use client';

import { useState, useEffect } from 'react';
import { Table } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { PollForm, PollFormProps } from '@/components/poll-form';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { PollList } from '@/components/poll-list';

interface Poll {
  id: string;
  title: string;
  category: string;
  status: string;
  created_at: string;
  end_date?: string;
  poll_options?: any[];
  description_text?: string;
}

const CATEGORIES = [
  'All',
  'Politics',
  'Technology',
  'Entertainment',
  'Other',
];

export default function AdminDashboard() {
  const [polls, setPolls] = useState<Poll[]>([]);
  const [voteCounts, setVoteCounts] = useState<{ [pollId: string]: number } >({});
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editPoll, setEditPoll] = useState<Poll | null>(null);
  const [showView, setShowView] = useState(false);
  const [selectedPoll, setSelectedPoll] = useState<Poll | null>(null);
  const supabase = createClientComponentClient();

  useEffect(() => {
    fetchPolls();
  }, [categoryFilter]);

  const fetchPolls = async () => {
    setLoading(true);
    let query = supabase.from('polls').select('*, poll_options(*)');
    if (categoryFilter && categoryFilter !== 'All') {
      query = query.ilike('category', `%${categoryFilter}%`);
    }
    const { data, error } = await query;
    if (error) {
      console.error('Error fetching polls:', error);
      setLoading(false);
      return;
    }
    setPolls(data as Poll[]);
    await fetchVoteCounts(data as Poll[]);
    setLoading(false);
  };

  const fetchVoteCounts = async (polls: Poll[]) => {
    const counts: { [pollId: string]: number } = {};
    for (const poll of polls) {
      const { count, error } = await supabase
        .from('votes')
        .select('*', { count: 'exact', head: true })
        .eq('poll_id', poll.id);
      counts[poll.id] = count || 0;
    }
    setVoteCounts(counts);
  };

  const handleDelete = async (pollId: string) => {
    await supabase.from('polls').delete().eq('id', pollId);
    fetchPolls();
  };

  // For edit: set poll and open modal
  const handleEdit = (poll: Poll) => {
    setEditPoll(poll);
  };

  // For view: set selected poll and open modal
  const handleView = (poll: Poll) => {
    setSelectedPoll(poll);
    setShowView(true);
  };

  // Refresh polls after poll creation or edit
  const handlePollChanged = () => {
    setShowCreate(false);
    setEditPoll(null);
    fetchPolls();
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 gap-4">
        <div className="flex items-center gap-4">
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filter by category" />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((cat) => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button onClick={() => setShowCreate(true)} className="font-semibold">Create Poll</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl w-full">
            <PollForm onCreated={handlePollChanged} mode="create" />
          </DialogContent>
        </Dialog>
      </div>
      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <Table>
          <thead>
            <tr className="bg-gray-100">
              <th className="px-4 py-2 text-left">Title</th>
              <th className="px-4 py-2 text-left">Category</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-left">Vote Count</th>
              <th className="px-4 py-2 text-left">Creation Date</th>
              <th className="px-4 py-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center py-8">Loading...</td></tr>
            ) : polls.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-8">No polls found.</td></tr>
            ) : (
              polls.map((poll) => (
                <tr key={poll.id} className="border-b">
                  <td className="px-4 py-2 font-medium">{poll.title}</td>
                  <td className="px-4 py-2">{poll.category}</td>
                  <td className="px-4 py-2">{poll.status}</td>
                  <td className="px-4 py-2">{voteCounts[poll.id] ?? 0}</td>
                  <td className="px-4 py-2">{new Date(poll.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-2 flex gap-2">
                    <Dialog open={!!editPoll && editPoll.id === poll.id} onOpenChange={() => setEditPoll(null)}>
                      <DialogTrigger asChild>
                        <Button size="sm" variant="outline" onClick={() => handleEdit(poll)}>Edit</Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl w-full">
                        {editPoll && editPoll.id === poll.id && (
                          <PollForm
                            onCreated={handlePollChanged}
                            initialValues={{
                              basicDetails: {
                                title: editPoll.title,
                                category: editPoll.category,
                                endDate: editPoll.end_date ? new Date(editPoll.end_date) : new Date(),
                              },
                              options: editPoll.poll_options?.map((opt: any) => ({ text: opt.text, image: null })) || [],
                              description: {
                                file: null,
                                extractedText: editPoll.description_text || '',
                              },
                            }}
                            mode="edit"
                          />
                        )}
                      </DialogContent>
                    </Dialog>
                    <Button size="sm" variant="destructive" onClick={() => handleDelete(poll.id)}>Delete</Button>
                    <Dialog open={showView && selectedPoll?.id === poll.id} onOpenChange={setShowView}>
                      <DialogTrigger asChild>
                        <Button size="sm" variant="secondary" onClick={() => handleView(poll)}>View Results</Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl w-full max-h-screen overflow-auto">
                        <PollList singlePoll={selectedPoll} />
                      </DialogContent>
                    </Dialog>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </div>
    </div>
  );
} 