import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { BarChart } from "@/components/ui/bar-chart"
import { Button } from "@/components/ui/button"
import { Poll, PollOption } from "@/types/poll"

interface PollResultsPageProps {
  params: {
    id: string
  }
}

interface PollWithOptions extends Poll {
  poll_options: (PollOption & {
    votes: Array<{
      id: string
      user_id?: string
      session_id?: string
      created_at: string
    }>
  })[]
}

export default async function PollResultsPage({ params }: PollResultsPageProps) {
  const supabase = createClient()

  const { data: poll, error: pollError } = await supabase
    .from("polls")
    .select(`
      *,
      poll_options (
        id,
        text,
        image_url,
        votes (
          id,
          user_id,
          session_id,
          created_at
        )
      )
    `)
    .eq("id", params.id)
    .single()

  if (pollError) {
    return <div>Error loading poll results</div>
  }

  if (!poll) {
    return <div>Poll not found</div>
  }

  const pollData = poll as PollWithOptions

  const totalVotes = pollData.poll_options.reduce(
    (sum: number, option) => sum + option.votes.length,
    0
  )

  const chartData = pollData.poll_options.map((option) => ({
    name: option.text,
    value: option.votes.length,
    percentage: totalVotes > 0 ? (option.votes.length / totalVotes) * 100 : 0,
  }))

  const downloadCsv = () => {
    const csvContent = [
      ["Option", "Vote Count", "Percentage"],
      ...pollData.poll_options.map((option) => [
        option.text,
        option.votes.length,
        totalVotes > 0 ? ((option.votes.length / totalVotes) * 100).toFixed(2) + "%" : "0%",
      ]),
    ]
      .map((row) => row.join(","))
      .join("\n")

    const blob = new Blob([csvContent], { type: "text/csv" })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `poll-results-${pollData.id}.csv`
    a.click()
    window.URL.revokeObjectURL(url)
  }

  return (
    <div className="container mx-auto py-8">
      <Card>
        <CardHeader>
          <CardTitle>{pollData.title}</CardTitle>
          <div className="text-sm text-muted-foreground">
            Category: {pollData.category}
          </div>
          <div className="text-sm text-muted-foreground">
            Total Votes: {totalVotes}
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="details">Details</TabsTrigger>
            </TabsList>
            <TabsContent value="overview">
              <div className="h-[400px]">
                <BarChart data={chartData} />
              </div>
            </TabsContent>
            <TabsContent value="details">
              <div className="space-y-4">
                <Button onClick={downloadCsv}>Download CSV</Button>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Option</TableHead>
                      <TableHead>Vote Count</TableHead>
                      <TableHead>Percentage</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pollData.poll_options.map((option) => (
                      <TableRow key={option.id}>
                        <TableCell className="flex items-center gap-2">
                          {option.image_url && (
                            <img
                              src={option.image_url}
                              alt={option.text}
                              className="h-8 w-8 object-cover rounded"
                            />
                          )}
                          {option.text}
                        </TableCell>
                        <TableCell>{option.votes.length}</TableCell>
                        <TableCell>
                          {totalVotes > 0
                            ? ((option.votes.length / totalVotes) * 100).toFixed(2)
                            : 0}
                          %
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
} 