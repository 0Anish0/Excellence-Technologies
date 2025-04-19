'use client'

import { useState } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useRouter } from 'next/navigation'
import { v4 as uuidv4 } from 'uuid'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { useToast } from '@/components/ui/use-toast'
import { Label } from '@/components/ui/label'

interface PollOption {
  id: string
  text: string
  image_url: string | null
}

interface PollVotingProps {
  pollId: string
  title: string
  category: string
  descriptionFileUrl?: string
  descriptionFileType?: string
  options: PollOption[]
  endDate: string
}

export function PollVoting({
  pollId,
  title,
  category,
  descriptionFileUrl,
  descriptionFileType,
  options,
  endDate,
}: PollVotingProps) {
  const [selectedOption, setSelectedOption] = useState<string>('')
  const [hasVoted, setHasVoted] = useState(false)
  const [sessionId, setSessionId] = useState<string>('')
  const supabase = createClientComponentClient()
  const router = useRouter()
  const { toast } = useToast()

  const handleVote = async () => {
    if (!selectedOption) {
      toast({
        title: 'Please select an option',
        variant: 'destructive',
      })
      return
    }

    try {
      const { data: { user } } = await supabase.auth.getUser()

      // Check if poll is still active
      const endDateObj = new Date(endDate)
      if (endDateObj < new Date()) {
        toast({
          title: 'Poll has ended',
          description: 'This poll is no longer accepting votes',
          variant: 'destructive',
        })
        return
      }

      // Submit vote
      const { error: voteError } = await supabase
        .from('votes')
        .insert({
          poll_id: pollId,
          option_id: selectedOption,
          user_id: user?.id || null,
          session_id: user ? null : sessionId,
        })

      if (voteError) throw voteError

      toast({
        title: 'Vote submitted successfully',
        variant: 'default',
      })

      // Redirect to results page
      router.push(`/polls/${pollId}/results`)
    } catch (error) {
      console.error('Error submitting vote:', error)
      toast({
        title: 'Failed to submit vote',
        description: 'Please try again later',
        variant: 'destructive',
      })
    }
  }

  const handleDownloadDescription = () => {
    if (descriptionFileUrl) {
      window.open(descriptionFileUrl, '_blank')
    }
  }

  return (
    <Card className="p-6">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="text-muted-foreground">Category: {category}</p>
          {endDate && (
            <p className="text-muted-foreground">
              Ends: {new Date(endDate).toLocaleDateString()}
            </p>
          )}
        </div>

        {descriptionFileUrl && (
          <div>
            <Button
              variant="outline"
              onClick={handleDownloadDescription}
            >
              {descriptionFileType?.startsWith('image/') ? 'View Description Image' : 'Download Description File'}
            </Button>
          </div>
        )}

        <RadioGroup
          value={selectedOption}
          onValueChange={setSelectedOption}
          className="space-y-4"
        >
          {options.map((option) => (
            <div key={option.id} className="flex items-center space-x-4">
              <RadioGroupItem value={option.id} id={option.id} />
              <Label htmlFor={option.id} className="flex items-center gap-4">
                {option.image_url && (
                  <img
                    src={option.image_url}
                    alt={option.text}
                    className="w-16 h-16 object-cover rounded"
                  />
                )}
                <span>{option.text}</span>
              </Label>
            </div>
          ))}
        </RadioGroup>

        <Button
          onClick={handleVote}
          disabled={hasVoted}
          className="w-full"
        >
          {hasVoted ? 'Already Voted' : 'Submit Vote'}
        </Button>
      </div>
    </Card>
  )
} 