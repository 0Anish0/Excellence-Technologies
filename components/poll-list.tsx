'use client'

import { useEffect, useState } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { BarChart } from '@/components/ui/bar-chart'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/components/ui/use-toast'
import { Skeleton } from '@/components/ui/skeleton'

type Poll = {
  id: string
  user_id: string
  question: string
  option1: string
  option2: string
  option3: string
  option4: string
  file_url: string | null
  file_type: string | null
  extracted_text: string | null
  created_at: string
  user: {
    email: string
  }
}

type Vote = {
  id: string
  poll_id: string
  user_id: string
  selected_option: number
  voted_at: string
}

export function PollList() {
  const [polls, setPolls] = useState<Poll[]>([])
  const [votes, setVotes] = useState<{ [key: string]: Vote }>({})
  const [voteCounts, setVoteCounts] = useState<{ [key: string]: number[] }>({})
  const [loading, setLoading] = useState(true)
  const [voting, setVoting] = useState<string | null>(null)
  const supabase = createClientComponentClient()
  const { toast } = useToast()

  useEffect(() => {
    fetchPolls()
    fetchVotes()
  }, [])

  const fetchPolls = async () => {
    try {
      const { data, error } = await supabase
        .from('polls')
        .select('*, user:user_id(email)')
        .order('created_at', { ascending: false })

      if (error) throw error

      setPolls(data)
      await fetchVoteCounts(data)
    } catch (error) {
      console.error('Error fetching polls:', error)
      toast({
        title: 'Failed to load polls',
        description: 'Please try again later',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const fetchVotes = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from('votes')
        .select('*')
        .eq('user_id', user.id)

      if (error) throw error

      const voteMap = data.reduce((acc, vote) => {
        acc[vote.poll_id] = vote
        return acc
      }, {} as { [key: string]: Vote })

      setVotes(voteMap)
    } catch (error) {
      console.error('Error fetching votes:', error)
    }
  }

  const fetchVoteCounts = async (polls: Poll[]) => {
    try {
      const counts: { [key: string]: number[] } = {}

      for (const poll of polls) {
        const { data, error } = await supabase
          .from('votes')
          .select('selected_option, count', { count: 'exact' })
          .eq('poll_id', poll.id)
          .groupBy('selected_option')

        if (error) throw error

        const optionCounts = [0, 0, 0, 0]
        data.forEach(({ selected_option, count }) => {
          optionCounts[selected_option - 1] = count
        })

        counts[poll.id] = optionCounts
      }

      setVoteCounts(counts)
    } catch (error) {
      console.error('Error fetching vote counts:', error)
    }
  }

  const handleVote = async (pollId: string, optionIndex: number) => {
    try {
      setVoting(pollId)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { error } = await supabase
        .from('votes')
        .insert({
          poll_id: pollId,
          user_id: user.id,
          selected_option: optionIndex + 1,
        })

      if (error) throw error

      // Update local state
      await fetchVotes()
      await fetchVoteCounts(polls)

      toast({
        title: 'Vote recorded successfully',
        variant: 'default',
      })
    } catch (error) {
      console.error('Error voting:', error)
      toast({
        title: 'Failed to record vote',
        description: 'Please try again later',
        variant: 'destructive',
      })
    } finally {
      setVoting(null)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-4 w-2/3" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-4 w-full mb-4" />
              <div className="grid grid-cols-2 gap-4">
                {[1, 2, 3, 4].map((j) => (
                  <Skeleton key={j} className="h-10" />
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {polls.map((poll) => {
        const userVote = votes[poll.id]
        const hasVoted = !!userVote
        const voteCount = voteCounts[poll.id] || [0, 0, 0, 0]
        const totalVotes = voteCount.reduce((a, b) => a + b, 0)

        return (
          <Card key={poll.id}>
            <CardHeader>
              <CardTitle className="text-lg font-medium">
                {poll.question}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Created by {poll.user.email}
              </p>
            </CardHeader>
            <CardContent>
              {/* File Preview or Extracted Text */}
              {(poll.file_url || poll.extracted_text) && (
                <div className="mb-6">
                  {poll.file_type?.startsWith('image/') ? (
                    <img
                      src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/poll-files/${poll.file_url}`}
                      alt="Poll attachment"
                      className="max-w-full h-auto max-h-64 rounded"
                    />
                  ) : poll.extracted_text && (
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {poll.extracted_text}
                    </p>
                  )}
                </div>
              )}

              {/* Options */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[poll.option1, poll.option2, poll.option3, poll.option4].map(
                  (option, index) => (
                    <Button
                      key={index}
                      variant={
                        hasVoted && userVote.selected_option === index + 1
                          ? 'default'
                          : 'outline'
                      }
                      disabled={hasVoted || voting === poll.id}
                      onClick={() => handleVote(poll.id, index)}
                    >
                      {option}
                    </Button>
                  )
                )}
              </div>

              {/* Results */}
              {hasVoted && (
                <div className="mt-6">
                  <h4 className="text-sm font-medium mb-2">Results</h4>
                  <BarChart
                    data={[
                      {
                        name: poll.option1,
                        value: (voteCount[0] / totalVotes) * 100,
                      },
                      {
                        name: poll.option2,
                        value: (voteCount[1] / totalVotes) * 100,
                      },
                      {
                        name: poll.option3,
                        value: (voteCount[2] / totalVotes) * 100,
                      },
                      {
                        name: poll.option4,
                        value: (voteCount[3] / totalVotes) * 100,
                      },
                    ]}
                  />
                  <p className="text-sm text-muted-foreground mt-2">
                    Total votes: {totalVotes}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
} 