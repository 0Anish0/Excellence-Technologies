"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

export default function PollResultsPage() {
  const params = useParams();
  const router = useRouter();
  const pollId = params.id as string;
  const [poll, setPoll] = useState<any>(null);
  const [options, setOptions] = useState<any[]>([]);
  const [votes, setVotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchResults = async () => {
      const supabase = createClientComponentClient();
      const { data: pollData, error: pollError } = await supabase
        .from("polls")
        .select("*, poll_options(*)")
        .eq("id", pollId)
        .single();
      if (!pollError && pollData) {
        setPoll(pollData);
        setOptions((pollData.poll_options || []).sort((a: any, b: any) => a.position - b.position));
      }
      const { data: votesData } = await supabase
        .from("votes")
        .select("selected_option")
        .eq("poll_id", pollId);
      setVotes(votesData || []);
      setLoading(false);
    };
    fetchResults();
  }, [pollId]);

  if (loading) return <div className="text-center py-8">Loading...</div>;
  if (!poll) return <div className="text-center py-8">Poll not found.</div>;

  const totalVotes = votes.length;
  const getOptionVotes = (optionIdx: number) => votes.filter(v => v.selected_option === optionIdx + 1).length;

  return (
    <div className="max-w-2xl mx-auto p-4">
      <Card className="p-6">
        <h1 className="text-2xl font-bold mb-2">{poll.title}</h1>
        <div className="text-sm text-muted-foreground mb-4">Results</div>
        {options.map((opt: any, idx: number) => {
          const count = getOptionVotes(idx);
          const percent = totalVotes === 0 ? 0 : Math.round((count / totalVotes) * 100);
          return (
            <div key={opt.id} className="mb-4">
              <div className="flex justify-between items-center mb-1">
                <span>{opt.text}</span>
                <span className="text-xs text-muted-foreground">{count} vote{count !== 1 ? "s" : ""} ({percent}%)</span>
              </div>
              <Progress value={percent} />
            </div>
          );
        })}
        <div className="mt-6 flex justify-end">
          <Button onClick={() => router.push("/")}>Back to Polls</Button>
        </div>
      </Card>
    </div>
  );
} 