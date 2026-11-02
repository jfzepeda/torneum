import { Dashboard } from "@/components/dashboard";
export default async function Page({
  params,
}: {
  params: Promise<{ club: string }>;
}) {
  const { club } = await params;
  return <Dashboard slug={club} />;
}
