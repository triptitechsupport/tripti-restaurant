import React from 'react';
import { Helmet } from 'react-helmet';
import PlansList from '@/components/PlansList.jsx';

export default function PlansPage() {
  return (
    <>
      <Helmet>
        <title>Choose your plan - Triptigenusswelt</title>
        <meta name="description" content="Pick the tier that fits how you'll use it. Upgrade or cancel anytime." />
      </Helmet>
      
      <main className="h-full mx-auto max-w-6xl px-6 py-12">
        <header className="mb-10 text-center">
          <h1 className="text-3xl font-semibold sm:text-4xl">Choose your plan</h1>
          <p className="mt-3 text-muted-foreground">
            Pick the tier that fits how you'll use it. Upgrade or cancel anytime.
          </p>
        </header>
        <PlansList />
      </main>
    </>
  );
}