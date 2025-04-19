import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { createClient } from "@/lib/supabase/client";
import { CreatePollForm } from "@/components/poll/create-poll-form";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Poll } from "@/types/poll";

export function PollDashboard() {
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const supabase = createClient();

  const { data: polls, isLoading } = useQuery({
    queryKey: ["polls", categoryFilter, searchQuery],
    queryFn: async () => {
      let query = supabase
        .from("polls")
        .select(`
          *,
          poll_options (
            id,
            text,
            image_url
          ),
          votes (
            id
          )
        `);

      if (categoryFilter !== "all") {
        query = query.eq("category", categoryFilter);
      }

      if (searchQuery) {
        query = query.ilike("title", `%${searchQuery}%`);
      }

      const { data, error } = await query;

      if (error) throw error;

      return data.map((poll: Poll) => ({
        ...poll,
        vote_count: poll.votes?.length || 0,
        status: new Date(poll.end_date) > new Date() ? "active" : "inactive",
      }));
    },
  });

  const deletePoll = useMutation({
    mutationFn: async (pollId: string) => {
      const { error } = await supabase.from("polls").delete().eq("id", pollId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["polls"] });
      toast({
        title: "Success",
        description: "Poll deleted successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete poll",
        variant: "destructive",
      });
    },
  });

  const handleDelete = (pollId: string) => {
    if (window.confirm("Are you sure you want to delete this poll?")) {
      deletePoll.mutate(pollId);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Poll Dashboard</h1>
        <Dialog>
          <DialogTrigger asChild>
            <Button>Create New Poll</Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl">
            <CreatePollForm />
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-4">
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            <SelectItem value="Politics">Politics</SelectItem>
            <SelectItem value="Technology">Technology</SelectItem>
            <SelectItem value="Entertainment">Entertainment</SelectItem>
            <SelectItem value="Other">Other</SelectItem>
          </SelectContent>
        </Select>

        <Input
          placeholder="Search polls..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-sm"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Votes</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : polls?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center">
                    No polls found
                  </TableCell>
                </TableRow>
              ) : (
                polls?.map((poll: Poll) => (
                  <TableRow key={poll.id}>
                    <TableCell>{poll.title}</TableCell>
                    <TableCell>{poll.category}</TableCell>
                    <TableCell>
                      <span
                        className={`px-2 py-1 rounded-full text-xs ${
                          poll.status === "active"
                            ? "bg-green-100 text-green-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {poll.status}
                      </span>
                    </TableCell>
                    <TableCell>{poll.vote_count}</TableCell>
                    <TableCell>
                      {new Date(poll.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.location.href = `/polls/${poll.id}/results`}
                        >
                          View Results
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.location.href = `/polls/${poll.id}/edit`}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDelete(poll.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
} 