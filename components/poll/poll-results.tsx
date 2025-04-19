'use client'

import { useEffect, useState } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Download } from 'lucide-react'

interface PollResult {
  id: string
  text: string
  image_url: string | null
  vote_count: number
  percentage: number
}

interface PollResultsProps {
  pollId: string
  isAdmin?: boolean
}

export function PollResults({ pollId, isAdmin = false }: PollResultsProps) {
  const [results, setResults] = useState<PollResult[]>([])
  const [totalVotes, setTotalVotes] = useState(0)
  const [voters, setVoters] = useState<Array<{ id: string; is_authenticated: boolean }>>([])
  const supabase = createClientComponentClient()

  useEffect(() => {
    fetchResults()
  }, [pollId])

  const fetchResults = async () => {
    try {
      // Fetch poll options with vote counts
      const { data: options, error: optionsError } = await supabase
        .from('poll_options')
        .select('id, text, image_url')
        .eq('poll_id', pollId)

      if (optionsError) throw optionsError

      // Fetch votes
      const { data: votes, error: votesError } = await supabase
        .from('votes')
        .select('option_id, user_id, session_id')
        .eq('poll_id', pollId)

      if (votesError) throw votesError

      // Calculate vote counts and percentages
      const voteCounts = votes.reduce((acc, vote) => {
        acc[vote.option_id] = (acc[vote.option_id] || 0) + 1
        return acc
      }, {} as Record<string, number>)

      const total = Object.values(voteCounts).reduce((sum, count) => sum + count, 0)
      setTotalVotes(total)

      const results = options.map(option => ({
        ...option,
        vote_count: voteCounts[option.id] || 0,
        percentage: total > 0 ? Math.round((voteCounts[option.id] || 0) / total * 100) : 0,
      }))

      setResults(results)

      // Fetch voters if admin
      if (isAdmin) {
        const uniqueVoters = votes.reduce((acc, vote) => {
          const id = vote.user_id || vote.session_id
          if (!acc.some(v => v.id === id)) {
            acc.push({
              id,
              is_authenticated: !!vote.user_id,
            })
          }
          return acc
        }, [] as Array<{ id: string; is_authenticated: boolean }>)
        setVoters(uniqueVoters)
      }
    } catch (error) {
      console.error('Error fetching results:', error)
    }
  }

  const downloadCSV = () => {
    const csvContent = [
      ['Option', 'Vote Count', 'Percentage'],
      ...results.map(result => [
        result.text,
        result.vote_count,
        `${result.percentage}%`,
      ]),
    ].map(row => row.join(',')).join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `poll-results-${pollId}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold">Poll Results</h2>
          <p className="text-muted-foreground">Total Votes: {totalVotes}</p>
        </div>

        <div className="h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={results}
              margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="text" />
              <YAxis />
              <Tooltip
                formatter={(value: number) => [`${value} votes`, 'Votes']}
                labelFormatter={(label) => `Option: ${label}`}
              />
              <Bar dataKey="vote_count" fill="#8884d8" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-semibold">Detailed Results</h3>
          {isAdmin && (
            <Button variant="outline" onClick={downloadCSV}>
              <Download className="h-4 w-4 mr-2" />
              Download CSV
            </Button>
          )}
        </div>

        <div className="space-y-4">
          {results.map((result) => (
            <div key={result.id} className="flex items-center gap-4">
              {result.image_url && (
                <img
                  src={result.image_url}
                  alt={result.text}
                  className="w-16 h-16 object-cover rounded"
                />
              )}
              <div className="flex-1">
                <div className="flex justify-between items-center">
                  <span className="font-medium">{result.text}</span>
                  <span className="text-muted-foreground">
                    {result.vote_count} votes ({result.percentage}%)
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5 mt-2">
                  <div
                    className="bg-blue-600 h-2.5 rounded-full"
                    style={{ width: `${result.percentage}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {isAdmin && (
        <Card className="p-6">
          <h3 className="text-xl font-semibold mb-4">Voters</h3>
          <div className="space-y-2">
            {voters.map((voter) => (
              <div key={voter.id} className="flex items-center gap-2">
                <span className="font-medium">
                  {voter.is_authenticated ? 'User' : 'Anonymous'}
                </span>
                <span className="text-muted-foreground">{voter.id}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
} 