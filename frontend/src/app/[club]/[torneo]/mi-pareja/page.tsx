import { MyTeam } from "@/components/public";
export default async function Page({
  params,
}: {
  params: Promise<{ club: string; torneo: string }>;
}) {
  const { club, torneo } = await params;
  return <MyTeam slug={club} torneo={torneo} />;
}
