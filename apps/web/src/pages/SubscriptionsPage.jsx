import React from 'react';
import { Helmet } from 'react-helmet';
import SubscriptionAccountSection from '@/components/SubscriptionAccountSection.jsx';

export default function SubscriptionsPage() {
  return (
    <>
      <Helmet>
        <title>Your subscription - Triptigenusswelt</title>
        <meta name="description" content="View your current plan and manage billing." />
      </Helmet>

      <main className="h-full mx-auto max-w-3xl px-6 py-12 w-full">
        <header className="mb-8">
          <h1 className="text-3xl font-semibold sm:text-4xl">Your subscription</h1>
          <p className="mt-2 text-muted-foreground">
            View your current plan and manage billing.
          </p>
        </header>
        <SubscriptionAccountSection />
      </main>
    </>
  );
}