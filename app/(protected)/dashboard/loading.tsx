import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="w-full max-w-[1440px] space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-10 w-40" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card
            key={index}
            size="sm"
            className="border border-[#E2E8F0] bg-white shadow-none ring-0"
          >
            <CardHeader className="gap-2 p-5">
              <div className="flex justify-between">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="size-8 rounded-md" />
              </div>
              <Skeleton className="h-9 w-20" />
            </CardHeader>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-5 lg:gap-6">
        <Card className="border border-[#E2E8F0] bg-white shadow-none ring-0 lg:col-span-3">
          <CardHeader className="border-b border-[#E2E8F0] p-5">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="mt-2 h-4 w-64" />
          </CardHeader>
          <CardContent className="space-y-3 p-5">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-9 w-40" />
          </CardContent>
        </Card>
        <Card className="border border-[#E2E8F0] bg-white shadow-none ring-0 lg:col-span-2">
          <CardHeader className="border-b border-[#E2E8F0] p-5">
            <Skeleton className="h-5 w-36" />
          </CardHeader>
          <CardContent className="space-y-3 p-5">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </CardContent>
        </Card>
      </div>

      <Card className="border border-[#E2E8F0] bg-white shadow-none ring-0">
        <CardHeader className="border-b border-[#E2E8F0] p-5">
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent className="space-y-3 p-5">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}
