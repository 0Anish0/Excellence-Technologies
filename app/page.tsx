'use client'

import { PollList } from '@/components/poll/poll-list'

export default function HomePage() {
  return (
    <div className="container mx-auto py-8">
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold">Active Polls</h1>
          <p className="text-muted-foreground">
            Participate in the latest polls and make your voice heard
          </p>
        </div>

        <PollList />
      </div>
    </div>
  )
}