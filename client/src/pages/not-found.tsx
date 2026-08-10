import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-[100svh] w-full flex items-center justify-center bg-background bg-mesh px-4">
      <Card className="w-full max-w-md card-3d rounded-2xl">
        <CardContent className="pt-6">
          <div className="eyebrow mb-3">// Error 404</div>
          <div className="flex mb-2 gap-2 items-center">
            <AlertCircle className="h-7 w-7 text-destructive" />
            <h1 className="text-3xl font-black tracking-[-0.04em] text-foreground">Page Not Found</h1>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            The page you're looking for doesn't exist.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
