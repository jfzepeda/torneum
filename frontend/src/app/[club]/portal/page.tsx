import { Portal } from "@/components/public";
export default async function Page({
  params,
}: {
  params: Promise<{ club: string }>;
}) {
  const { club } = await params;
  return <Portal slug={club} />;
}
