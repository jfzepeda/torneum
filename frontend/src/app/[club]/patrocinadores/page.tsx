import { SponsorsPage } from "@/components/public";
export default async function Page({
  params,
}: {
  params: Promise<{ club: string }>;
}) {
  const { club } = await params;
  return <SponsorsPage slug={club} />;
}
