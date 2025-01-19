"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import IFCViewerClass from "./IFCViewerClass";
import styles from "./IFCViewer.module.css";

interface IFCProperty {
  Name?: { value: string };
  NominalValue?: any;
  Value?: any;
  HasProperties?: IFCProperty[] | IFCProperty;
}

interface IFCQuantity {
  Name: { value: string };
  LengthValue?: { value: number };
  AreaValue?: { value: number };
  VolumeValue?: { value: number };
  WeightValue?: { value: number };
  CountValue?: { value: number };
}

interface IFCQuantitySet {
  Name?: { value: string };
  Quantities: IFCQuantity[] | IFCQuantity;
}

interface IFCMaterial {
  ForLayerSet?: {
    MaterialLayers:
      | Array<{
          Material?: {
            Name: { value: string };
          };
          LayerThickness?: { value: number };
        }>
      | {
          Material?: {
            Name: { value: string };
          };
          LayerThickness?: { value: number };
        };
    LayerSetName?: { value: string };
  };
  DirectionSense?: { type: number; value: string };
  LayerSetDirection?: { type: number; value: string };
  OffsetFromReferenceLine?: { type: number; value: number };
}

interface IFCElementProperties {
  type: string;
  properties: any;
  psets: IFCProperty[];
  typeProps: any[];
  materials: IFCMaterial[];
  classifications: any[];
  spatialInfo: any[];
  quantities: IFCQuantitySet[];
}

interface PickResult {
  modelID: number;
  expressID: number;
}

export default function IFCViewer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<IFCViewerClass | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isModelsPanelCollapsed, setIsModelsPanelCollapsed] = useState(false);
  const [isPropertiesPanelCollapsed, setIsPropertiesPanelCollapsed] =
    useState(false);

  // Add state for form controls
  const [showGrid, setShowGrid] = useState(false);
  const [showAxes, setShowAxes] = useState(false);
  const [showShadows, setShowShadows] = useState(false);
  const [opacity, setOpacity] = useState(100);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && viewerRef.current) {
      try {
        setIsLoading(true);
        await viewerRef.current.loadIFC(file);
      } catch (error) {
        console.error("Error loading IFC file:", error);
      } finally {
        setIsLoading(false);
      }
    }
    // Reset the input value so the same file can be loaded again
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  useEffect(() => {
    if (!containerRef.current || viewerRef.current || !isInitialized) return;

    const initViewer = async () => {
      try {
        // Initialize viewer
        const container = containerRef.current;
        if (!container) return;

        const viewer = new IFCViewerClass(container);
        await viewer.init(); // Make sure init is complete
        viewerRef.current = viewer;
      } catch (error) {
        console.error("Error initializing viewer:", error);
      }
    };

    initViewer();

    return () => {
      if (viewerRef.current?.dispose) {
        try {
          viewerRef.current.dispose();
        } catch (error) {
          console.error("Error disposing viewer:", error);
        }
      }
    };
  }, [isInitialized]);

  // Initialize when component mounts
  useEffect(() => {
    setIsInitialized(true);
    return () => setIsInitialized(false);
  }, []);

  // Handle settings changes
  useEffect(() => {
    if (!viewerRef.current) return;

    try {
      viewerRef.current.grid?.set({ visible: showGrid });
      viewerRef.current.axes?.set({ visible: showAxes });
      viewerRef.current.setShadows?.(showShadows);
      viewerRef.current.setOpacity?.(opacity / 100);
    } catch (error) {
      console.error("Error updating viewer settings:", error);
    }
  }, [showGrid, showAxes, showShadows, opacity]);

  const displayElementProperties = (
    type: string,
    properties: any,
    psets: IFCProperty[],
    typeProps: any[],
    materials: IFCMaterial[],
    classifications: any[],
    spatialInfo: any[],
    quantities: IFCQuantitySet[]
  ) => {
    const attributesList = document.getElementById("element-attributes");
    const propertiesList = document.getElementById("element-properties");
    if (!attributesList || !propertiesList) return;

    // Clear previous content
    attributesList.innerHTML = "";
    propertiesList.innerHTML = "";

    // Display IFC type
    const typeItem = document.createElement("div");
    typeItem.className = styles["property-item"];
    typeItem.innerHTML = `
      <div class="${styles["property-name"]}">IFC Type</div>
      <div class="${styles["property-value"]}">${type.replace("Ifc", "")}</div>
    `;
    attributesList.appendChild(typeItem);

    // Display property sets
    if (psets && psets.length > 0) {
      displayPropertyGroup(propertiesList, psets);
    }

    // Display quantities
    if (quantities && quantities.length > 0) {
      const quantityContainer = document.createElement("div");
      quantityContainer.className = styles["property-set"];

      quantities.forEach((quantitySet: IFCQuantitySet) => {
        if (!quantitySet || !quantitySet.Quantities) return;

        const header = document.createElement("div");
        header.className = styles["property-set-header"];
        header.innerHTML = `
          <div class="${styles["property-set-name"]}">${
          quantitySet.Name?.value || "Quantities"
        }</div>
        `;
        quantityContainer.appendChild(header);

        const quantityList = document.createElement("div");
        quantityList.className = styles["property-list"];

        const quantities = Array.isArray(quantitySet.Quantities)
          ? quantitySet.Quantities
          : [quantitySet.Quantities];

        quantities.forEach((quantity: IFCQuantity) => {
          if (!quantity || !quantity.Name) return;

          const name = quantity.Name.value;
          let value = null;
          let unit = "";

          // Handle different quantity types
          if (quantity.LengthValue !== undefined) {
            value = quantity.LengthValue.value;
            unit = "m";
          } else if (quantity.AreaValue !== undefined) {
            value = quantity.AreaValue.value;
            unit = "m²";
          } else if (quantity.VolumeValue !== undefined) {
            value = quantity.VolumeValue.value;
            unit = "m³";
          } else if (quantity.WeightValue !== undefined) {
            value = quantity.WeightValue.value;
            unit = "kg";
          } else if (quantity.CountValue !== undefined) {
            value = quantity.CountValue.value;
          }

          if (value !== null) {
            // Format the value based on its magnitude
            let formattedValue;
            if (typeof value === "number") {
              if (value < 0.01) {
                formattedValue = value.toFixed(4);
              } else if (value < 1) {
                formattedValue = value.toFixed(3);
              } else if (value < 10) {
                formattedValue = value.toFixed(2);
              } else {
                formattedValue = value.toFixed(1);
              }
            } else {
              formattedValue = value;
            }

            const quantityItem = document.createElement("div");
            quantityItem.className = styles["property-item"];
            quantityItem.innerHTML = `
              <div class="${styles["property-name"]}">${name}</div>
              <div class="${styles["property-value"]}">${formattedValue}${
              unit ? ` ${unit}` : ""
            }</div>
            `;
            quantityList.appendChild(quantityItem);
          }
        });

        quantityContainer.appendChild(quantityList);
      });

      propertiesList.appendChild(quantityContainer);
    }

    // Display materials
    if (materials && materials.length > 0) {
      displayMaterials(propertiesList, materials);
    }
  };

  useEffect(() => {
    if (!viewerRef.current) return;

    const handleClick = async (event: MouseEvent) => {
      const propertiesList = document.getElementById("element-properties");
      if (!propertiesList || !viewerRef.current) return;

      // Clear previous content
      propertiesList.innerHTML = "";

      // Update visibility of panels based on selection state
      const elementInfo = document.querySelector(
        ".element-info"
      ) as HTMLDivElement;
      const noSelection = document.querySelector(
        ".no-selection"
      ) as HTMLDivElement;

      if (elementInfo && noSelection) {
        // Access the viewer instance with type assertion
        const viewer = viewerRef.current as unknown as {
          hasSelection: () => boolean;
          getSelectedElementProperties: () => Promise<
            IFCElementProperties | undefined
          >;
        };

        const hasSelection = viewer.hasSelection();
        elementInfo.style.display = hasSelection ? "block" : "none";
        noSelection.style.display = hasSelection ? "none" : "block";

        if (hasSelection) {
          const properties = await viewer.getSelectedElementProperties();
          if (properties) {
            displayElementProperties(
              properties.type || "Unknown",
              properties.properties,
              properties.psets || [],
              properties.typeProps || [],
              properties.materials || [],
              properties.classifications || [],
              properties.spatialInfo || [],
              properties.quantities || []
            );
          }
        }
      }
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener("click", handleClick);
      return () => container.removeEventListener("click", handleClick);
    }
  }, []);

  const displayPropertyGroup = (
    container: HTMLElement,
    properties: IFCProperty[]
  ) => {
    properties.forEach((prop) => {
      if (!prop || !prop.HasProperties) return;

      // Create property set container
      const psetContainer = document.createElement("div");
      psetContainer.className = styles["property-set"];

      // Add property set header
      const psetHeader = document.createElement("div");
      psetHeader.className = styles["property-set-header"];
      psetHeader.innerHTML = `
        <div class="${styles["property-set-name"]}">${
        prop.Name?.value || "Properties"
      }</div>
      `;
      psetContainer.appendChild(psetHeader);

      // Process properties
      const propList = document.createElement("div");
      propList.className = styles["property-list"];

      const props = Array.isArray(prop.HasProperties)
        ? prop.HasProperties
        : [prop.HasProperties];

      props.forEach((p) => {
        if (!p || !p.Name) return;

        const name = p.Name.value;
        let value = null;

        // Extract value based on property type
        if (p.NominalValue !== undefined) {
          value =
            typeof p.NominalValue === "object"
              ? p.NominalValue.value
              : p.NominalValue;
        } else if (p.Value !== undefined) {
          value = typeof p.Value === "object" ? p.Value.value : p.Value;
        }

        // Format value based on property name
        if (value !== null) {
          if (typeof value === "boolean") {
            value = value ? "Yes" : "No";
          } else if (typeof value === "number") {
            if (name === "ThermalTransmittance") {
              value = `${value.toFixed(2)} W/(m²·K)`;
            } else if (name === "LoadBearing" || name === "IsExternal") {
              value = value === 1 ? "Yes" : "No";
            } else {
              value = value.toFixed(2);
            }
          }

          const propItem = document.createElement("div");
          propItem.className = styles["property-item"];
          propItem.innerHTML = `
            <div class="${styles["property-name"]}">${name}</div>
            <div class="${styles["property-value"]}">${value}</div>
          `;
          propList.appendChild(propItem);
        }
      });

      psetContainer.appendChild(propList);
      container.appendChild(psetContainer);
    });
  };

  const displayMaterials = (
    container: HTMLElement,
    materials: IFCMaterial[]
  ) => {
    if (!materials || materials.length === 0) return;

    materials.forEach((material, materialIndex) => {
      if (!material.ForLayerSet) return;

      const layerSet = material.ForLayerSet;
      const materialContainer = document.createElement("div");
      materialContainer.className = styles["property-set"];

      // Add material header with layer set name if available
      const header = document.createElement("div");
      header.className = styles["property-set-header"];
      header.innerHTML = `
        <div class="${styles["property-set-name"]}">
          ${layerSet.LayerSetName?.value || `Material Set ${materialIndex + 1}`}
        </div>
      `;
      materialContainer.appendChild(header);

      const layers = Array.isArray(layerSet.MaterialLayers)
        ? layerSet.MaterialLayers
        : [layerSet.MaterialLayers];

      // Add direction and offset information
      if (material.DirectionSense?.value) {
        const directionItem = document.createElement("div");
        directionItem.className = styles["property-item"];
        directionItem.innerHTML = `
          <div class="${styles["property-name"]}">Direction</div>
          <div class="${styles["property-value"]}">${material.DirectionSense.value}</div>
        `;
        materialContainer.appendChild(directionItem);
      }

      if (material.LayerSetDirection?.value) {
        const directionItem = document.createElement("div");
        directionItem.className = styles["property-item"];
        directionItem.innerHTML = `
          <div class="${styles["property-name"]}">Layer Set Direction</div>
          <div class="${styles["property-value"]}">${material.LayerSetDirection.value}</div>
        `;
        materialContainer.appendChild(directionItem);
      }

      // Create layers container
      const layersContainer = document.createElement("div");
      layersContainer.className = styles["material-layers"];

      layers.forEach((layer, index) => {
        const layerDiv = document.createElement("div");
        layerDiv.className = styles["material-layer"];

        // Layer header
        const layerHeader = document.createElement("div");
        layerHeader.className = styles["material-layer-header"];
        layerHeader.innerHTML = `<h6>Layer ${index + 1}</h6>`;
        layerDiv.appendChild(layerHeader);

        // Layer properties
        if (layer.Material?.Name) {
          const nameItem = document.createElement("div");
          nameItem.className = styles["property-item"];
          nameItem.innerHTML = `
            <div class="${styles["property-name"]}">Material</div>
            <div class="${styles["property-value"]}">${layer.Material.Name.value}</div>
          `;
          layerDiv.appendChild(nameItem);
        }

        if (layer.LayerThickness) {
          const thicknessItem = document.createElement("div");
          thicknessItem.className = styles["property-item"];
          thicknessItem.innerHTML = `
            <div class="${styles["property-name"]}">Thickness</div>
            <div class="${styles["property-value"]}">${(
            layer.LayerThickness.value * 1000
          ).toFixed(0)} mm</div>
          `;
          layerDiv.appendChild(thicknessItem);
        }

        layersContainer.appendChild(layerDiv);
      });

      materialContainer.appendChild(layersContainer);
      container.appendChild(materialContainer);
    });
  };

  return (
    <div className={styles["viewer-container"]}>
      {/* Loading Overlay */}
      <div
        className={`${styles["loading-overlay"]} ${
          !isLoading && styles.hidden
        }`}
      >
        <div className={styles.spinner}></div>
        <div>Loading...</div>
      </div>

      {/* Models Panel */}
      <div
        className={`${styles["models-panel"]} ${
          isModelsPanelCollapsed ? styles.collapsed : ""
        }`}
      >
        <div className={styles["panel-header"]}>
          <h3>Models</h3>
          <button
            className={styles["panel-toggle"]}
            onClick={() => setIsModelsPanelCollapsed(!isModelsPanelCollapsed)}
          >
            <i
              className={`fas fa-chevron-${
                isModelsPanelCollapsed ? "right" : "left"
              }`}
            ></i>
          </button>
        </div>
        <button
          className={styles["load-button"]}
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading}
        >
          {isLoading ? "Loading..." : "Load IFC File"}
        </button>
        <div id="models-list"></div>

        {/* Settings Section */}
        <div className={styles["settings-section"]}>
          <div className={styles["section-header"]}>
            <h4>Display Settings</h4>
          </div>
          <div className={styles["settings-content"]}>
            <label>
              <input
                type="checkbox"
                checked={showGrid}
                onChange={(e) => setShowGrid(e.target.checked)}
              />
              Show Grid
            </label>
            <label>
              <input
                type="checkbox"
                checked={showAxes}
                onChange={(e) => setShowAxes(e.target.checked)}
              />
              Show Axes
            </label>
            <label>
              <input
                type="checkbox"
                checked={showShadows}
                onChange={(e) => setShowShadows(e.target.checked)}
              />
              Enable Shadows
            </label>
            <label className="flex flex-col gap-1">
              <span>Opacity: {opacity}%</span>
              <input
                type="range"
                min="0"
                max="100"
                value={opacity}
                onChange={(e) => setOpacity(Number(e.target.value))}
                className="w-full"
              />
            </label>
          </div>
        </div>
      </div>

      {/* Properties Panel */}
      <div
        className={`${styles["properties-panel"]} ${
          isPropertiesPanelCollapsed ? styles.collapsed : ""
        }`}
      >
        <div className={styles["panel-header"]}>
          <h3>Properties</h3>
          <button
            className={styles["panel-toggle"]}
            onClick={() =>
              setIsPropertiesPanelCollapsed(!isPropertiesPanelCollapsed)
            }
          >
            <i
              className={`fas fa-chevron-${
                isPropertiesPanelCollapsed ? "left" : "right"
              }`}
            ></i>
          </button>
        </div>
        <div className={styles["no-selection"]}>No element selected</div>
        <div className={styles["element-info"]} style={{ display: "none" }}>
          <div id="element-attributes"></div>
          <div id="element-properties"></div>
        </div>
      </div>

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        id="file-input"
        accept=".ifc"
        className="hidden"
        onChange={handleFileChange}
        disabled={isLoading}
      />

      {/* Viewer Container */}
      <div
        ref={containerRef}
        id="viewer-container"
        className={styles["canvas-container"]}
      />
    </div>
  );
}
