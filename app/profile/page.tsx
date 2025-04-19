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

interface VoteHistory {
  id: string
  poll_id: string
  poll_title: string
  option_text: string
  created_at: string
}

interface VoteData {
  id: string
  poll_id: string
  polls: {
    title: string
  }
  poll_options: {
    text: string
  }
  created_at: string
}

export default function ProfilePage() {
  const [voteHistory, setVoteHistory] = useState<VoteHistory[]>([])
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const supabase = createClientComponentClient()
  const router = useRouter()
  const { toast } = useToast()

  useEffect(() => {
    fetchVoteHistory()
  }, [])

  const fetchVoteHistory = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth/login')
        return
      }

      const { data, error } = await supabase
        .from('votes')
        .select(`
          id,
          poll_id,
          polls (
            title
          ),
          poll_options (
            text
          ),
          created_at
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .returns<VoteData[]>()

      if (error) throw error

      const formattedData = data.map(vote => ({
        id: vote.id,
        poll_id: vote.poll_id,
        poll_title: vote.polls.title,
        option_text: vote.poll_options.text,
        created_at: vote.created_at,
      }))

      setVoteHistory(formattedData)
    } catch (error) {
      console.error('Error fetching vote history:', error)
      toast({
        title: 'Failed to fetch vote history',
        description: 'Please try again later',
        variant: 'destructive',
      })
    }
  }

  const handlePasswordUpdate = async () => {
    if (newPassword !== confirmPassword) {
      toast({
        title: 'Passwords do not match',
        variant: 'destructive',
      })
      return
    }

    if (newPassword.length < 6) {
      toast({
        title: 'Password too short',
        description: 'Password must be at least 6 characters',
        variant: 'destructive',
      })
      return
    }

    try {
      setIsLoading(true)
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      })

      if (error) throw error

      toast({
        title: 'Password updated successfully',
        variant: 'default',
      })

      setNewPassword('')
      setConfirmPassword('')
    } catch (error) {
      console.error('Error updating password:', error)
      toast({
        title: 'Failed to update password',
        description: 'Please try again later',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="container mx-auto py-8 space-y-8">
      <h1 className="text-3xl font-bold">Profile</h1>

      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">Update Password</h2>
        <div className="space-y-4 max-w-md">
          <div className="space-y-2">
            <label className="text-sm font-medium">New Password</label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Confirm Password</label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
            />
          </div>
          <Button
            onClick={handlePasswordUpdate}
            disabled={isLoading}
          >
            {isLoading ? 'Updating...' : 'Update Password'}
          </Button>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">Voting History</h2>
        {voteHistory.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Poll</TableHead>
                <TableHead>Selected Option</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {voteHistory.map((vote) => (
                <TableRow key={vote.id}>
                  <TableCell>{vote.poll_title}</TableCell>
                  <TableCell>{vote.option_text}</TableCell>
                  <TableCell>
                    {new Date(vote.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => router.push(`/polls/${vote.poll_id}/results`)}
                    >
                      View Results
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-muted-foreground">No voting history yet</p>
        )}
      </Card>
    </div>
  )
} 