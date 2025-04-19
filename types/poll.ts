export type Poll = {
  id: string;
  title: string;
  category: string;
  status: "active" | "inactive";
  vote_count: number;
  created_at: string;
  end_date: string;
  description_file?: string;
  poll_options?: PollOption[];
  votes?: Vote[];
};

export type PollOption = {
  id: string;
  text: string;
  image_url?: string;
  poll_id: string;
};

export type Vote = {
  id: string;
  poll_id: string;
  option_id: string;
  user_id?: string;
  session_id?: string;
  created_at: string;
}; 