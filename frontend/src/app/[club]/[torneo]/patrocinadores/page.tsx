import { SponsorsPage } from "@/components/sponsors-public";
export default async function Page({
  params,
}: {
  params: Promise<{ club: string; torneo: string }>;
}) {
  const { club, torneo } = await params;
  return <SponsorsPage slug={club} torneo={torneo} />;
}
