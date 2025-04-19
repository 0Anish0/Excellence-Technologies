'use client'

import { useState, useEffect } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/use-toast'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Edit, Trash2, Eye } from 'lucide-react'

interface Poll {
  id: string
  title: string
  category: string
  end_date: string
  vote_count: number
  status: 'active' | 'inactive'
  created_at: string
}

interface PollData {
  id: string
  title: string
  category: string
  end_date: string
  created_at: string
  votes: { id: string }[]
}

export default function AdminDashboard() {
  const [polls, setPolls] = useState<Poll[]>([])
  const [filteredPolls, setFilteredPolls] = useState<Poll[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [isLoading, setIsLoading] = useState(false)
  const supabase = createClientComponentClient()
  const router = useRouter()
  const { toast } = useToast()

  useEffect(() => {
    fetchPolls()
  }, [])

  useEffect(() => {
    filterPolls()
  }, [polls, searchQuery, selectedCategory])

  const fetchPolls = async () => {
    try {
      setIsLoading(true)
      const { data, error } = await supabase
        .from('polls')
        .select(`
          id,
          title,
          category,
          end_date,
          created_at,
          votes (
            id
          )
        `)
        .order('created_at', { ascending: false })
        .returns<PollData[]>()

      if (error) throw error

      const formattedPolls = data.map(poll => ({
        id: poll.id,
        title: poll.title,
        category: poll.category,
        end_date: poll.end_date,
        vote_count: poll.votes.length,
        status: new Date(poll.end_date) > new Date() ? 'active' as const : 'inactive' as const,
        created_at: poll.created_at,
      }))

      setPolls(formattedPolls)
    } catch (error) {
      console.error('Error fetching polls:', error)
      toast({
        title: 'Failed to fetch polls',
        description: 'Please try again later',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  const filterPolls = () => {
    let filtered = polls

    // Filter by search query
    if (searchQuery) {
      filtered = filtered.filter(poll =>
        poll.title.toLowerCase().includes(searchQuery.toLowerCase())
      )
    }

    // Filter by category
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(poll => poll.category === selectedCategory)
    }

    setFilteredPolls(filtered)
  }

  const handleDeletePoll = async (pollId: string) => {
    try {
      setIsLoading(true)

      // Delete poll options
      const { error: optionsError } = await supabase
        .from('poll_options')
        .delete()
        .eq('poll_id', pollId)

      if (optionsError) throw optionsError

      // Delete votes
      const { error: votesError } = await supabase
        .from('votes')
        .delete()
        .eq('poll_id', pollId)

      if (votesError) throw votesError

      // Delete poll
      const { error: pollError } = await supabase
        .from('polls')
        .delete()
        .eq('id', pollId)

      if (pollError) throw pollError

      toast({
        title: 'Poll deleted successfully',
        variant: 'default',
      })

      // Refresh polls
      fetchPolls()
    } catch (error) {
      console.error('Error deleting poll:', error)
      toast({
        title: 'Failed to delete poll',
        description: 'Please try again later',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        <Button onClick={() => router.push('/admin/polls/create')}>
          Create New Poll
        </Button>
      </div>

      <Card className="p-6">
        <div className="flex gap-4 mb-6">
          <Input
            placeholder="Search polls..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="max-w-sm"
          />
          <Select
            value={selectedCategory}
            onValueChange={setSelectedCategory}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem value="politics">Politics</SelectItem>
              <SelectItem value="technology">Technology</SelectItem>
              <SelectItem value="entertainment">Entertainment</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Votes</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredPolls.map((poll) => (
              <TableRow key={poll.id}>
                <TableCell>{poll.title}</TableCell>
                <TableCell>{poll.category}</TableCell>
                <TableCell>
                  <span
                    className={`px-2 py-1 rounded-full text-xs ${
                      poll.status === 'active'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {poll.status}
                  </span>
                </TableCell>
                <TableCell>{poll.vote_count}</TableCell>
                <TableCell>
                  {new Date(poll.created_at).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => router.push(`/polls/${poll.id}/results`)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => router.push(`/admin/polls/${poll.id}/edit`)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="destructive"
                      size="icon"
                      onClick={() => handleDeletePoll(poll.id)}
                      disabled={isLoading}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
} 