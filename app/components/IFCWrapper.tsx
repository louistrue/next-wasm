"use client";

import dynamic from "next/dynamic";

const IFCParser = dynamic(() => import("./IFCParser"), {
  ssr: false,
  loading: () => <p>Loading IFC parser...</p>,
});

export default function IFCWrapper() {
  return <IFCParser />;
}
