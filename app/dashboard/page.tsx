'use client'

import { useState } from 'react'
import { Header } from '@/components/ui/header'
import { PollForm } from '@/components/poll-form'
import { PollList } from '@/components/poll-list'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState('polls')

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <div className="space-y-8">
          <Tabs defaultValue="polls" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="polls">Active Polls</TabsTrigger>
              <TabsTrigger value="create">Create Poll</TabsTrigger>
            </TabsList>
            <TabsContent value="polls" className="mt-6">
              <PollList />
            </TabsContent>
            <TabsContent value="create" className="mt-6">
              <PollForm />
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  )
}