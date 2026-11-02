import { LegacyRedirect } from "@/components/public";
export default async function Page({
  params,
}: {
  params: Promise<{ club: string }>;
}) {
  const { club } = await params;
  return <LegacyRedirect slug={club} page="inscripcion" />;
}
