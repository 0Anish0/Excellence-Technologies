"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

export default function PublicPollList() {
  const [polls, setPolls] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPolls = async () => {
      const supabase = createClientComponentClient();
      const { data, error } = await supabase
        .from("polls")
        .select("id, title, category, end_date, status")
        .eq("status", "active")
        .order("end_date", { ascending: true });
      if (!error) setPolls(data || []);
      setLoading(false);
    };
    fetchPolls();
  }, []);

  const filteredPolls = polls.filter((poll) =>
    poll.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="max-w-3xl mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Active Polls</h1>
        <Button asChild>
          <Link href="/auth/login">Login</Link>
        </Button>
      </div>
      <Input
        placeholder="Search polls by title..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-6"
      />
      {loading ? (
        <div className="text-center py-8">Loading...</div>
      ) : filteredPolls.length === 0 ? (
        <div className="text-center py-8">No polls found.</div>
      ) : (
        <div className="grid gap-6">
          {filteredPolls.map((poll) => (
            <Card key={poll.id} className="p-6 flex flex-col md:flex-row md:items-center md:justify-between">
              <div>
                <div className="font-bold text-lg">{poll.title}</div>
                <div className="text-sm text-muted-foreground">{poll.category}</div>
                <div className="text-xs mt-1">
                  Time left: {Math.max(0, Math.ceil((new Date(poll.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))} days
                </div>
              </div>
              <Button asChild className="mt-4 md:mt-0">
                <Link href={`/poll/${poll.id}`}>Take Poll</Link>
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}