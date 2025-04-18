import { Header } from '@/components/ui/header'
import { PollForm } from '@/components/poll-form'
import { PollList } from '@/components/poll-list'

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <div className="space-y-8">
          <PollForm />
          <PollList />
        </div>
      </main>
    </div>
  )
}