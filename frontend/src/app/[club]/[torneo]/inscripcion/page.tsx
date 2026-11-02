import { Registration } from "@/components/public";
export default async function Page({
  params,
}: {
  params: Promise<{ club: string; torneo: string }>;
}) {
  const { club, torneo } = await params;
  return <Registration slug={club} torneo={torneo} />;
}
