'use client'

import { useState, useEffect } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { PollVoting } from '@/components/poll/poll-voting'
import { PollResults } from '@/components/poll/poll-results'
import { useToast } from '@/components/ui/use-toast'

interface Poll {
  id: string
  title: string
  category: string
  end_date: string
  description_file_url: string | null
  description_file_type: string | null
  options: {
    id: string
    text: string
    image_url: string | null
  }[]
}

export default function PollPage({ params }: { params: { id: string } }) {
  const [poll, setPoll] = useState<Poll | null>(null)
  const [hasVoted, setHasVoted] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const supabase = createClientComponentClient()
  const { toast } = useToast()

  useEffect(() => {
    fetchPoll()
  }, [params.id])

  const fetchPoll = async () => {
    try {
      setIsLoading(true)

      // Fetch poll data
      const { data: pollData, error: pollError } = await supabase
        .from('polls')
        .select(`
          id,
          title,
          category,
          end_date,
          description_file_url,
          description_file_type,
          poll_options (
            id,
            text,
            image_url
          )
        `)
        .eq('id', params.id)
        .single()

      if (pollError) throw pollError

      // Check if user has voted
      const { data: { user } } = await supabase.auth.getUser()
      let hasVoted = false

      if (user) {
        const { data: voteData } = await supabase
          .from('votes')
          .select('id')
          .eq('poll_id', params.id)
          .eq('user_id', user.id)
          .single()

        hasVoted = !!voteData
      } else {
        const sessionId = localStorage.getItem(`poll_${params.id}_session`)
        if (sessionId) {
          const { data: voteData } = await supabase
            .from('votes')
            .select('id')
            .eq('poll_id', params.id)
            .eq('session_id', sessionId)
            .single()

          hasVoted = !!voteData
        }
      }

      setPoll(pollData)
      setHasVoted(hasVoted)
    } catch (error) {
      console.error('Error fetching poll:', error)
      toast({
        title: 'Failed to load poll',
        description: 'Please try again later',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="container mx-auto py-8">
        <div className="text-center">
          <p className="text-muted-foreground">Loading poll...</p>
        </div>
      </div>
    )
  }

  if (!poll) {
    return (
      <div className="container mx-auto py-8">
        <div className="text-center">
          <p className="text-muted-foreground">Poll not found</p>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-8">
      {hasVoted ? (
        <PollResults
          pollId={poll.id}
          isAdmin={false}
        />
      ) : (
        <PollVoting
          pollId={poll.id}
          title={poll.title}
          category={poll.category}
          descriptionFileUrl={poll.description_file_url}
          descriptionFileType={poll.description_file_type}
          options={poll.options}
          endDate={poll.end_date}
        />
      )}
    </div>
  )
} 