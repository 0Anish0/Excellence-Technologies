"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { getSessionId } from "@/lib/session";
import { useToast } from "@/components/ui/use-toast";

export default function PollDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const { toast } = useToast();
  const pollId = params.id as string;
  const [poll, setPoll] = useState<any>(null);
  const [options, setOptions] = useState<any[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [voted, setVoted] = useState(false);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileType, setFileType] = useState<string | null>(null);

  useEffect(() => {
    const fetchPoll = async () => {
      const supabase = createClientComponentClient();
      const { data, error } = await supabase
        .from("polls")
        .select("*, poll_options(*)")
        .eq("id", pollId)
        .single();
      if (!error && data) {
        setPoll(data);
        setOptions(data.poll_options || []);
        setFileUrl(data.description_file_url || null);
        setFileType(data.description_file_type || null);
      }
      setLoading(false);
    };
    fetchPoll();
  }, [pollId]);

  useEffect(() => {
    // Check if user has already voted
    const checkVoted = async () => {
      const supabase = createClientComponentClient();
      const sessionId = getSessionId();
      const { data: { user } } = await supabase.auth.getUser();
      let voteQuery = supabase.from("votes").select("id").eq("poll_id", pollId);
      if (user) {
        voteQuery = voteQuery.eq("user_id", user.id);
      } else {
        voteQuery = voteQuery.eq("session_id", sessionId);
      }
      const { data: votes, error } = await voteQuery;
      if (!error && votes && votes.length > 0) setVoted(true);
    };
    if (pollId) checkVoted();
  }, [pollId]);

  const handleVote = async () => {
    if (!selected) {
      toast({ title: "Please select an option.", variant: "destructive" });
      return;
    }
    setLoading(true);
    const supabase = createClientComponentClient();
    const sessionId = getSessionId();
    const { data: { user } } = await supabase.auth.getUser();
    const votePayload: any = {
      poll_id: pollId,
      option_id: selected,
    };
    if (user) {
      votePayload.user_id = user.id;
    } else {
      votePayload.session_id = sessionId;
    }
    const { error } = await supabase.from("votes").insert([votePayload]);
    setLoading(false);
    if (!error) {
      toast({ title: "Vote submitted!", variant: "default" });
      router.push(`/poll/${pollId}/results`);
    } else {
      toast({ title: "You have already voted or an error occurred.", variant: "destructive" });
    }
  };

  if (loading) return <div className="text-center py-8">Loading...</div>;
  if (!poll) return <div className="text-center py-8">Poll not found.</div>;

  return (
    <div className="max-w-2xl mx-auto p-4">
      <Card className="p-6">
        <h1 className="text-2xl font-bold mb-2">{poll.title}</h1>
        <div className="text-sm text-muted-foreground mb-2">{poll.category}</div>
        <div className="mb-4 text-xs">Ends: {poll.end_date ? new Date(poll.end_date).toLocaleString() : "N/A"}</div>
        {poll.description_text && (
          <div className="mb-4">
            <div className="font-semibold mb-1">Description:</div>
            <div className="bg-gray-100 rounded p-2 text-sm whitespace-pre-wrap">{poll.description_text}</div>
          </div>
        )}
        {fileUrl && fileType && (
          <div className="mb-4">
            <a href={fileUrl} download className="text-blue-600 underline" target="_blank" rel="noopener noreferrer">
              Download {fileType.includes("pdf") ? "PDF" : fileType.includes("doc") ? "DOCX" : "File"}
            </a>
          </div>
        )}
        <div className="mb-4">
          <RadioGroup value={selected} onValueChange={setSelected} className="space-y-2">
            {options.map((opt: any) => (
              <div key={opt.id} className="flex items-center gap-2">
                <RadioGroupItem value={opt.id} id={`option-${opt.id}`} />
                <label htmlFor={`option-${opt.id}`} className="cursor-pointer">
                  {opt.text}
                </label>
                {opt.image_url && (
                  <img src={opt.image_url} alt="option" className="h-8 w-8 object-cover rounded ml-2" />
                )}
              </div>
            ))}
          </RadioGroup>
        </div>
        <Button onClick={handleVote} disabled={loading || voted} className="w-full">
          {voted ? "You have already voted" : loading ? "Submitting..." : "Submit Vote"}
        </Button>
      </Card>
    </div>
  );
} 