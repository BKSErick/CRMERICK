import { notFound } from "next/navigation";
import { ModulePlaceholder } from "@/components/ModulePlaceholder";
import { getNavItem } from "@/lib/navigation";

type ModulePageProps = {
  params: Promise<{ module: string }>;
};

export default async function ModulePage({ params }: ModulePageProps) {
  const { module } = await params;
  const item = getNavItem(module);

  if (!item || item.href === "/") {
    notFound();
  }

  return <ModulePlaceholder item={item} />;
}
