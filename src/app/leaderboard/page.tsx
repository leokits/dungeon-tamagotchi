import Leaderboard from "@/components/Leaderboard";

export const dynamic = "force-dynamic";

export default function LeaderboardPage() {
  return (
    <div className="min-h-screen bg-zinc-950 p-8">
      <Leaderboard />
    </div>
  );
}
