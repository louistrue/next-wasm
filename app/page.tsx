"use client";

import dynamic from "next/dynamic";

const IFCViewer = dynamic(() => import("./components/IFCViewer"), {
  ssr: false,
  loading: () => <p>Loading viewer...</p>,
});

export default function Home() {
  return (
    <main className="w-full h-screen">
      <IFCViewer />
    </main>
  );
}
