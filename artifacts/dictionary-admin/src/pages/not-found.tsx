import { Card, CardContent } from '@workspace/rebound/components/ui/card';
import { Button } from '@workspace/rebound/components/ui/button';
import { AlertCircle } from 'lucide-react';
import { Link } from 'wouter';

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <h1 className="text-2xl font-bold text-foreground">
              Page not found
            </h1>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            This page is not part of the Dictionary Admin workspace.
          </p>
          <Button asChild className="mt-5">
            <Link href="/" data-testid="link-return-dashboard">Return to dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
