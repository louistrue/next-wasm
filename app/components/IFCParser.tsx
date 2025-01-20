"use client";

import { useState, useCallback, useEffect } from "react";
import * as WebIFC from "web-ifc";

interface IFCModelData {
  modelID: number;
  fileName: string;
}

export default function IFCParser() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modelData, setModelData] = useState<IFCModelData | null>(null);
  const [ifcApi, setIfcApi] = useState<WebIFC.IfcAPI | null>(null);

  // Initialize IFC API on component mount
  useEffect(() => {
    const initAPI = async () => {
      try {
        const api = new WebIFC.IfcAPI();
        // Set the WASM location
        api.SetWasmPath("/");
        await api.Init();
        setIfcApi(api);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to initialize IFC API"
        );
      }
    };

    initAPI();
  }, []);

  const handleFileUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      if (!ifcApi) {
        setError("IFC API not initialized");
        return;
      }

      const file = event.target.files?.[0];
      if (!file) return;

      setIsLoading(true);
      setError(null);

      try {
        const data = await file.arrayBuffer();
        const modelID = ifcApi.OpenModel(new Uint8Array(data));

        const modelData = {
          modelID,
          fileName: file.name,
        };

        setModelData(modelData);
        ifcApi.CloseModel(modelID);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to parse IFC file"
        );
      } finally {
        setIsLoading(false);
      }
    },
    [ifcApi]
  );

  if (!ifcApi) {
    return <div>Initializing IFC API...</div>;
  }

  return (
    <div className="p-4">
      <input
        type="file"
        accept=".ifc"
        onChange={handleFileUpload}
        disabled={isLoading}
        className="mb-4"
      />

      {isLoading && <div>Loading...</div>}
      {error && <div className="text-red-500">{error}</div>}

      {modelData && (
        <div>
          <h3>Model Information:</h3>
          <pre>{JSON.stringify(modelData, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
