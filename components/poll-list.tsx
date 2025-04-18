'use client'

import { useEffect, useState } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { BarChart } from '@/components/ui/bar-chart'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/components/ui/use-toast'
import { Skeleton } from '@/components/ui/skeleton'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Download } from "lucide-react"

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
  const router = useRouter()

  useEffect(() => {
    checkAuthAndFetch()
  }, [])

  const checkAuthAndFetch = async () => {
    try {
      const { data: { session }, error: authError } = await supabase.auth.getSession()
      
      if (authError) throw authError
      if (!session) {
        router.push('/auth/login')
        return
      }

      await Promise.all([fetchPolls(), fetchVotes()])
    } catch (error) {
      console.error('Authentication error:', error)
      toast({
        title: 'Authentication Error',
        description: 'Please log in to view polls',
        variant: 'destructive',
      })
      router.push('/auth/login')
    }
  }

  const fetchPolls = async () => {
    try {
      const { data, error } = await supabase
        .from('polls')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Supabase error:', error)
        throw new Error(error.message)
      }

      if (!data) {
        throw new Error('No data returned from polls table')
      }

      setPolls(data)
      await fetchVoteCounts(data)
    } catch (error) {
      console.error('Error fetching polls:', error)
      toast({
        title: 'Failed to load polls',
        description: error instanceof Error ? error.message : 'Please try again later',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const fetchVotes = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        console.error('No authenticated user found')
        return
      }

      const { data, error } = await supabase
        .from('votes')
        .select('*')
        .eq('user_id', user.id)

      if (error) {
        console.error('Supabase error:', error)
        throw new Error(error.message)
      }

      const voteMap = data.reduce((acc, vote) => {
        acc[vote.poll_id] = vote
        return acc
      }, {} as { [key: string]: Vote })

      setVotes(voteMap)
    } catch (error) {
      console.error('Error fetching votes:', error)
      toast({
        title: 'Failed to load votes',
        description: error instanceof Error ? error.message : 'Please try again later',
        variant: 'destructive',
      })
    }
  }

  const fetchVoteCounts = async (polls: Poll[]) => {
    try {
      const counts: { [key: string]: number[] } = {}

      for (const poll of polls) {
        const { data, error } = await supabase
          .from('votes')
          .select('selected_option')
          .eq('poll_id', poll.id)

        if (error) {
          console.error('Supabase error:', error)
          throw new Error(error.message)
        }

        const optionCounts = [0, 0, 0, 0]
        data?.forEach(({ selected_option }: { selected_option: number }) => {
          optionCounts[selected_option - 1]++
        })

        counts[poll.id] = optionCounts
      }

      setVoteCounts(counts)
    } catch (error) {
      console.error('Error fetching vote counts:', error)
      toast({
        title: 'Failed to load vote counts',
        description: error instanceof Error ? error.message : 'Please try again later',
        variant: 'destructive',
      })
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

      if (error) {
        console.error('Supabase error:', error)
        throw new Error(error.message)
      }

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
        description: error instanceof Error ? error.message : 'Please try again later',
        variant: 'destructive',
      })
    } finally {
      setVoting(null)
    }
  }

  const handleDownload = async (fileUrl: string, fileName: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('poll-files')
        .download(fileUrl)

      if (error) {
        throw error
      }

      // Create a blob URL and trigger download
      const url = window.URL.createObjectURL(data)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      toast({
        title: "Success",
        description: "File downloaded successfully",
      })
    } catch (error) {
      console.error('Error downloading file:', error)
      toast({
        title: "Error",
        description: "Failed to download file",
        variant: "destructive",
      })
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

  if (polls.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">No polls available yet. Be the first to create one!</p>
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
                Created on {new Date(poll.created_at).toLocaleDateString()}
              </p>
            </CardHeader>
            <CardContent>
              {/* File Preview */}
              {poll.file_url && (
                <div className="mb-4">
                  {poll.file_type?.startsWith('image/') ? (
                    <img
                      src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/poll-files/${poll.file_url}`}
                      alt="Poll attachment"
                      className="w-full h-auto max-h-64 object-contain rounded-lg"
                    />
                  ) : poll.file_type === 'application/pdf' ? (
                    <div className="p-4 bg-muted rounded-lg">
                      <div className="flex items-center space-x-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                        <span className="text-sm font-medium">PDF Document</span>
                      </div>
                      {poll.extracted_text && (
                        <p className="mt-2 text-sm text-muted-foreground line-clamp-3">
                          {poll.extracted_text}
                        </p>
                      )}
                    </div>
                  ) : poll.file_type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ? (
                    <div className="p-4 bg-muted rounded-lg">
                      <div className="flex items-center space-x-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <span className="text-sm font-medium">Word Document</span>
                      </div>
                      {poll.extracted_text && (
                        <p className="mt-2 text-sm text-muted-foreground line-clamp-3">
                          {poll.extracted_text}
                        </p>
                      )}
                    </div>
                  ) : null}
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
              {totalVotes > 0 && (
                <div className="mt-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium">Results</h4>
                    <span className="text-sm text-muted-foreground">
                      Total votes: {totalVotes}
                    </span>
                  </div>
                  <div className="space-y-4">
                    {[poll.option1, poll.option2, poll.option3, poll.option4].map((option, index) => {
                      const votes = voteCount[index] || 0
                      const percentage = totalVotes > 0 ? (votes / totalVotes) * 100 : 0
                      const isUserVote = hasVoted && userVote.selected_option === index + 1
                      
                      return (
                        <div key={index} className="space-y-1">
                          <div className="flex items-center justify-between text-sm">
                            <span className={cn(
                              "font-medium",
                              isUserVote && "text-primary"
                            )}>
                              {option}
                            </span>
                            <span className="text-muted-foreground">
                              {votes} votes ({percentage.toFixed(1)}%)
                            </span>
                          </div>
                          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                            <div
                              className={cn(
                                "h-full rounded-full transition-all duration-500",
                                isUserVote ? "bg-primary" : "bg-primary/50"
                              )}
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Download Button */}
              {poll.file_url && (
                <div className="mt-4">
                  <div className="flex items-center justify-between p-2 border rounded-md">
                    <span className="text-sm truncate">
                      {poll.file_url.split('/').pop()}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDownload(poll.file_url, poll.file_url.split('/').pop() || 'document')}
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Download
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
} 