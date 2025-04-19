'use client'

import { useState, useEffect } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

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

export function PollList() {
  const [polls, setPolls] = useState<Poll[]>([])
  const [filteredPolls, setFilteredPolls] = useState<Poll[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [isLoading, setIsLoading] = useState(false)
  const supabase = createClientComponentClient()
  const router = useRouter()

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

    // Only show active polls
    filtered = filtered.filter(poll => poll.status === 'active')

    setFilteredPolls(filtered)
  }

  const getTimeRemaining = (endDate: string) => {
    const end = new Date(endDate)
    const now = new Date()
    const diff = end.getTime() - now.getTime()

    if (diff <= 0) return 'Ended'

    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))

    if (days > 0) return `${days} days left`
    if (hours > 0) return `${hours} hours left`
    return 'Less than an hour left'
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-4">
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

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {filteredPolls.map((poll) => (
          <Card key={poll.id} className="p-6">
            <div className="space-y-4">
              <div>
                <h3 className="text-xl font-semibold">{poll.title}</h3>
                <p className="text-sm text-muted-foreground">
                  Category: {poll.category}
                </p>
              </div>

              <div className="flex justify-between items-center">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">
                    {poll.vote_count} votes
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {getTimeRemaining(poll.end_date)}
                  </p>
                </div>

                <Button
                  onClick={() => router.push(`/polls/${poll.id}`)}
                >
                  Take Poll
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {filteredPolls.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">
            {isLoading ? 'Loading polls...' : 'No active polls found'}
          </p>
        </div>
      )}
    </div>
  )
} 