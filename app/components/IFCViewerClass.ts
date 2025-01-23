import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { IfcAPI } from "web-ifc";
import {
  IFCBUILDING,
  IFCBUILDINGSTOREY,
  IFCPROJECT,
  IFCSITE,
  IFCRELDEFINESBYPROPERTIES,
  IFCRELASSOCIATESMATERIAL,
} from "web-ifc";
import styles from "./IFCViewer.module.css";

interface LoaderSettings {
  COORDINATE_TO_ORIGIN: boolean;
  USE_FAST_BOOLS: boolean;
}

interface IFCMesh extends THREE.Mesh {
  modelID?: number;
  expressID?: number;
  originalMaterial?: THREE.Material | THREE.Material[];
  isSelected?: boolean;
}

interface IFCGroup extends THREE.Group {
  modelID?: number;
  expressID?: number;
}

interface IFCProperty {
  Name?: { value: string };
  NominalValue?: { value: any };
  Value?: { value: any };
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

interface IFCMaterialLayer {
  Material?: {
    Name: { value: string };
  };
  LayerThickness?: { value: number };
}

interface IFCMaterial {
  ForLayerSet?: {
    MaterialLayers: IFCMaterialLayer[] | IFCMaterialLayer;
    LayerSetName?: { value: string };
  };
}

export interface IFCViewerInstance {
  init: () => Promise<void>;
  loadIFC: (file: File) => Promise<void>;
  dispose: () => void;
  grid: { set: (options: { visible: boolean }) => void };
  axes: { set: (options: { visible: boolean }) => void };
  setShadows: (enabled: boolean) => void;
  setOpacity: (opacity: number) => void;
}

class IFCViewer implements IFCViewerInstance {
  private container: HTMLElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private ifcAPI: IfcAPI;
  private isInitialized: boolean = false;
  private animationFrameId?: number;
  public grid: { set: (options: { visible: boolean }) => void };
  public axes: { set: (options: { visible: boolean }) => void };
  private gridHelper?: THREE.GridHelper;
  private axesHelper?: THREE.AxesHelper;
  private models: Map<number, THREE.Group>;
  private modelCounter: number;
  private selectedObject: THREE.Object3D | null;
  private selectedMaterial: THREE.Material;
  private prePick: { material: THREE.Material; object: THREE.Object3D | null };
  private raycaster: THREE.Raycaster;
  private mouse: THREE.Vector2;
  private loadingOverlay: HTMLElement | null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      75,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.ifcAPI = new IfcAPI();
    this.models = new Map();
    this.modelCounter = 0;
    this.selectedObject = null;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.loadingOverlay = null;

    // Initialize materials
    this.selectedMaterial = new THREE.MeshPhongMaterial({
      color: 0xff9800,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
    });

    this.prePick = {
      material: new THREE.MeshPhongMaterial({
        color: 0x2196f3,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
      }),
      object: null,
    };

    // Initialize grid and axes controls
    this.grid = {
      set: (options: { visible: boolean }) => {
        if (this.gridHelper) {
          this.gridHelper.visible = options.visible;
        }
      },
    };

    this.axes = {
      set: (options: { visible: boolean }) => {
        if (this.axesHelper) {
          this.axesHelper.visible = options.visible;
        }
      },
    };

    console.log("IFCViewer constructor initialized");
  }

  private animate = () => {
    this.animationFrameId = requestAnimationFrame(this.animate);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  public async init() {
    if (this.isInitialized) return;

    try {
      console.log("Initializing IFCViewer...");

      // Initialize Three.js scene
      this.scene.background = new THREE.Color(0xf0f0f0);
      this.camera.position.set(10, 10, 10);
      this.renderer.setSize(
        this.container.clientWidth,
        this.container.clientHeight
      );
      this.renderer.setPixelRatio(window.devicePixelRatio);
      this.renderer.shadowMap.enabled = false;
      this.container.appendChild(this.renderer.domElement);

      // Initialize controls
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.05;

      // Add grid and axes
      this.gridHelper = new THREE.GridHelper(50, 50);
      this.scene.add(this.gridHelper);
      this.gridHelper.visible = false;

      this.axesHelper = new THREE.AxesHelper(5);
      this.scene.add(this.axesHelper);
      this.axesHelper.visible = false;

      // Add lights
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
      this.scene.add(ambientLight);
      const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
      directionalLight.position.set(5, 10, 5);
      directionalLight.castShadow = true;
      this.scene.add(directionalLight);

      // Initialize IFC API
      console.log("Initializing IFC API...");
      try {
        this.ifcAPI = new IfcAPI();

        // Custom locateFile handler to ensure correct WASM path
        const locateFile = (path: string) => {
          console.log("Locating WASM file:", path);
          return `/${path}`;
        };

        // Initialize with custom locateFile handler
        await this.ifcAPI.Init(locateFile);

        console.log("IFC API initialized successfully");
      } catch (error) {
        console.error("Error initializing IFC API:", error);
        throw error;
      }

      // Setup picking
      this.setupPicking();

      // Setup floating controls
      this.setupFloatingControls();

      // Start animation loop
      this.animate();

      this.isInitialized = true;

      // Handle window resize
      window.addEventListener("resize", this.handleResize);
      console.log("IFCViewer initialization complete");
    } catch (error) {
      console.error("Error initializing IFC viewer:", error);
      throw error;
    }
  }

  private handleResize = () => {
    if (!this.container) return;

    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  private getBufferGeometry(
    modelID: number,
    placedGeometry: any
  ): THREE.BufferGeometry {
    console.log("Getting buffer geometry...");
    const geometry = this.ifcAPI.GetGeometry(
      modelID,
      placedGeometry.geometryExpressID
    );

    const verts = this.ifcAPI.GetVertexArray(
      geometry.GetVertexData(),
      geometry.GetVertexDataSize()
    );
    const indices = this.ifcAPI.GetIndexArray(
      geometry.GetIndexData(),
      geometry.GetIndexDataSize()
    );

    // Create buffer geometry
    const bufferGeometry = new THREE.BufferGeometry();

    // Split interleaved vertex data into positions and normals
    const posFloats = new Float32Array(verts.length / 2);
    const normFloats = new Float32Array(verts.length / 2);

    for (let i = 0; i < verts.length; i += 6) {
      posFloats[i / 2] = verts[i];
      posFloats[i / 2 + 1] = verts[i + 1];
      posFloats[i / 2 + 2] = verts[i + 2];

      normFloats[i / 2] = verts[i + 3];
      normFloats[i / 2 + 1] = verts[i + 4];
      normFloats[i / 2 + 2] = verts[i + 5];
    }

    // Set attributes
    bufferGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(posFloats, 3)
    );
    bufferGeometry.setAttribute(
      "normal",
      new THREE.Float32BufferAttribute(normFloats, 3)
    );
    bufferGeometry.setIndex(Array.from(indices));

    // Clean up WASM memory
    geometry.delete();

    return bufferGeometry;
  }

  public async loadIFC(file: File) {
    if (!this.isInitialized) {
      throw new Error("Viewer not initialized");
    }

    try {
      console.log("Loading IFC file:", file.name);
      const data = await file.arrayBuffer();
      console.log("File loaded as ArrayBuffer");

      const modelID = this.ifcAPI.OpenModel(new Uint8Array(data), {
        COORDINATE_TO_ORIGIN: true,
      } as LoaderSettings);
      console.log("Model opened with ID:", modelID);

      // Create a group for the model
      const modelGroup = new THREE.Group() as IFCGroup;
      modelGroup.name = file.name;
      modelGroup.modelID = modelID;

      let elementCount = 0;
      let geometryCount = 0;

      // Stream all meshes
      console.log("Streaming meshes...");
      this.ifcAPI.StreamAllMeshes(modelID, (mesh) => {
        console.log("Processing mesh:", mesh);
        const placedGeometries = mesh.geometries;
        const expressID = mesh.expressID;

        // Create a group for this IFC element
        const elementGroup = new THREE.Group() as IFCGroup;
        elementGroup.modelID = modelID;
        elementGroup.expressID = expressID;
        elementGroup.name = `Element_${expressID}`;

        for (let i = 0; i < placedGeometries.size(); i++) {
          const placedGeometry = placedGeometries.get(i);

          try {
            const geometry = this.getBufferGeometry(modelID, placedGeometry);
            geometryCount++;

            // Apply transformation
            const matrix = new THREE.Matrix4();
            matrix.fromArray(placedGeometry.flatTransformation);
            geometry.applyMatrix4(matrix);

            // Create material with color from IFC
            const color = placedGeometry.color;
            const material = new THREE.MeshPhongMaterial({
              color: new THREE.Color(color.x, color.y, color.z),
              opacity: color.w,
              transparent: color.w !== 1,
              side: THREE.DoubleSide,
            });

            // Create mesh
            const mesh = new THREE.Mesh(geometry, material) as IFCMesh;
            mesh.modelID = modelID;
            mesh.expressID = expressID;
            mesh.name = `Mesh_${expressID}_${i}`;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            elementGroup.add(mesh);
          } catch (error) {
            console.error(
              `Error processing geometry ${i} for element ${expressID}:`,
              error
            );
          }
        }

        modelGroup.add(elementGroup);
        elementCount++;
      });

      console.log(
        `Processed ${elementCount} elements with ${geometryCount} total geometries`
      );

      // Add to scene and track model
      this.scene.add(modelGroup);
      const modelId = ++this.modelCounter;
      this.models.set(modelId, modelGroup);

      // Create model list item
      this.createModelListItem(modelId, file.name, modelGroup);

      // Build spatial tree
      await this.buildSpatialTree(modelID);

      // Focus camera on model
      const box = new THREE.Box3().setFromObject(modelGroup);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      console.log("Model bounds:", {
        size: size.toArray(),
        center: center.toArray(),
      });

      const maxDim = Math.max(size.x, size.y, size.z);
      const fov = this.camera.fov * (Math.PI / 180);
      let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
      cameraZ *= 1.5;

      this.camera.position.set(
        center.x + cameraZ * 0.5,
        center.y + cameraZ * 0.5,
        center.z + cameraZ
      );
      this.controls.target.copy(center);
      this.camera.lookAt(center);
      this.controls.update();

      console.log("IFC file loaded successfully");
    } catch (error) {
      console.error("Error loading IFC file:", error);
      throw error;
    }
  }

  private createModelListItem(
    modelId: number,
    fileName: string,
    model: THREE.Group
  ) {
    const modelsList = document.getElementById("models-list");
    if (!modelsList) return;

    const modelItem = document.createElement("div");
    modelItem.className = styles["model-item"];
    modelItem.id = `model-${modelId}`;

    const modelHeader = document.createElement("div");
    modelHeader.className = styles["model-header"];

    const modelName = document.createElement("div");
    modelName.className = styles["model-name"];
    modelName.textContent = fileName;

    const modelControls = document.createElement("div");
    modelControls.className = styles["model-controls"];

    // Visibility toggle button
    const visibilityBtn = document.createElement("button");
    visibilityBtn.className = styles["model-control-btn"];
    visibilityBtn.innerHTML = '<i class="fas fa-eye"></i>';
    visibilityBtn.title = "Toggle Visibility";
    visibilityBtn.addEventListener("click", () => {
      model.visible = !model.visible;
      visibilityBtn.innerHTML = model.visible
        ? '<i class="fas fa-eye"></i>'
        : '<i class="fas fa-eye-slash"></i>';
    });

    // Delete button
    const deleteBtn = document.createElement("button");
    deleteBtn.className = styles["model-control-btn"];
    deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
    deleteBtn.title = "Delete Model";
    deleteBtn.addEventListener("click", () => {
      this.deleteModel(modelId);
      modelItem.remove();
    });

    modelControls.appendChild(visibilityBtn);
    modelControls.appendChild(deleteBtn);
    modelHeader.appendChild(modelName);
    modelHeader.appendChild(modelControls);
    modelItem.appendChild(modelHeader);

    // Add model info
    const modelInfo = document.createElement("div");
    modelInfo.className = styles["model-info"];
    modelInfo.textContent = `ID: ${modelId}`;
    modelItem.appendChild(modelInfo);

    modelsList.appendChild(modelItem);
  }

  private async buildSpatialTree(modelID: number) {
    try {
      console.log("Building spatial tree...");
      const modelId = Array.from(this.models.entries()).find(
        ([_, m]) => (m as IFCGroup).modelID === modelID
      )?.[0];

      const modelItem = document.getElementById(`model-${modelId}`);
      if (!modelItem) return;

      // Create or get tree container
      let treeContainer = modelItem.querySelector(`.${styles["model-tree"]}`);
      if (!treeContainer) {
        treeContainer = document.createElement("div");
        treeContainer.className = styles["model-tree"];
        modelItem.appendChild(treeContainer);
      }
      treeContainer.innerHTML = ""; // Clear existing tree

      // Get all spatial elements
      const projectLines = await this.ifcAPI.GetLineIDsWithType(
        modelID,
        IFCPROJECT
      );
      const siteLines = await this.ifcAPI.GetLineIDsWithType(modelID, IFCSITE);
      const buildingLines = await this.ifcAPI.GetLineIDsWithType(
        modelID,
        IFCBUILDING
      );
      const storeyLines = await this.ifcAPI.GetLineIDsWithType(
        modelID,
        IFCBUILDINGSTOREY
      );

      // Create tree structure
      for (let i = 0; i < projectLines.size(); i++) {
        const projectID = projectLines.get(i);
        const project = await this.ifcAPI.GetLine(modelID, projectID, true);
        const projectNode = this.createTreeNode(
          project.Name?.value || "Project",
          "project"
        );
        treeContainer.appendChild(projectNode);

        // Add sites
        const sitesContainer = document.createElement("div");
        sitesContainer.className = styles["tree-children"];
        sitesContainer.style.display = "block"; // Expanded by default
        projectNode.appendChild(sitesContainer);

        for (let j = 0; j < siteLines.size(); j++) {
          const siteID = siteLines.get(j);
          const site = await this.ifcAPI.GetLine(modelID, siteID, true);
          const siteNode = this.createTreeNode(
            site.Name?.value || "Site",
            "site"
          );
          sitesContainer.appendChild(siteNode);

          // Add buildings
          const buildingsContainer = document.createElement("div");
          buildingsContainer.className = styles["tree-children"];
          buildingsContainer.style.display = "block"; // Expanded by default
          siteNode.appendChild(buildingsContainer);

          for (let k = 0; k < buildingLines.size(); k++) {
            const buildingID = buildingLines.get(k);
            const building = await this.ifcAPI.GetLine(
              modelID,
              buildingID,
              true
            );
            const buildingNode = this.createTreeNode(
              building.Name?.value || "Building",
              "building"
            );
            buildingsContainer.appendChild(buildingNode);

            // Add storeys
            const storeysContainer = document.createElement("div");
            storeysContainer.className = styles["tree-children"];
            storeysContainer.style.display = "block"; // Expanded by default
            buildingNode.appendChild(storeysContainer);

            for (let l = 0; l < storeyLines.size(); l++) {
              const storeyID = storeyLines.get(l);
              const storey = await this.ifcAPI.GetLine(modelID, storeyID, true);
              const storeyNode = this.createTreeNode(
                storey.Name?.value || "Storey",
                "storey"
              );
              storeysContainer.appendChild(storeyNode);
            }
          }
        }
      }
    } catch (error) {
      console.error("Error building spatial tree:", error);
    }
  }

  private createTreeNode(name: string, type: string): HTMLElement {
    const node = document.createElement("div");
    node.className = styles["tree-node"];

    const header = document.createElement("div");
    header.className = styles["tree-node-header"];

    const icon = document.createElement("i");
    icon.className = "fas fa-chevron-down"; // Start with down arrow since we're expanded by default
    header.appendChild(icon);

    const typeIcon = document.createElement("i");
    switch (type) {
      case "project":
        typeIcon.className = "fas fa-project-diagram";
        break;
      case "site":
        typeIcon.className = "fas fa-map-marker-alt";
        break;
      case "building":
        typeIcon.className = "fas fa-building";
        break;
      case "storey":
        typeIcon.className = "fas fa-layer-group";
        break;
      default:
        typeIcon.className = "fas fa-cube";
    }
    header.appendChild(typeIcon);

    const title = document.createElement("span");
    title.textContent = name;
    header.appendChild(title);

    node.appendChild(header);

    // Add click handler to toggle children
    header.addEventListener("click", () => {
      const children = node.querySelector(
        `.${styles["tree-children"]}`
      ) as HTMLElement;
      if (children) {
        children.style.display =
          children.style.display === "none" ? "block" : "none";
        icon.className =
          children.style.display === "none"
            ? "fas fa-chevron-right"
            : "fas fa-chevron-down";
      }
    });

    return node;
  }

  public dispose() {
    try {
      window.removeEventListener("resize", this.handleResize);
      if (this.animationFrameId) {
        cancelAnimationFrame(this.animationFrameId);
      }
      if (this.renderer) {
        this.renderer.dispose();
      }
      if (this.scene) {
        this.scene.clear();
      }
      if (this.ifcAPI) {
        this.ifcAPI.CloseModel(0);
      }
      this.isInitialized = false;
    } catch (error) {
      console.error("Error disposing IFC viewer:", error);
    }
  }

  public setShadows(enabled: boolean) {
    this.renderer.shadowMap.enabled = enabled;
  }

  public setOpacity(opacity: number) {
    this.scene.traverse((child: THREE.Object3D) => {
      if (child instanceof THREE.Mesh) {
        child.material.opacity = opacity;
        child.material.transparent = opacity < 1;
        child.material.needsUpdate = true;
      }
    });
  }

  private setupPicking() {
    // Add event listeners for picking
    this.container.addEventListener(
      "mousemove",
      this.handleMouseMove.bind(this)
    );
    this.container.addEventListener("click", this.handleClick.bind(this));
  }

  private handleMouseMove(event: MouseEvent) {
    const rect = this.container.getBoundingClientRect();
    this.mouse.x =
      ((event.clientX - rect.left) / this.container.clientWidth) * 2 - 1;
    this.mouse.y =
      -((event.clientY - rect.top) / this.container.clientHeight) * 2 + 1;

    // Reset previous pre-pick state if it's not the selected object
    if (this.prePick.object && this.prePick.object !== this.selectedObject) {
      this.prePick.object.traverse((child: THREE.Object3D) => {
        const mesh = child as IFCMesh;
        if (mesh.isMesh && mesh.originalMaterial && !mesh.isSelected) {
          mesh.material = mesh.originalMaterial;
          delete mesh.originalMaterial;
        }
      });
      this.prePick.object = null;
    }

    const intersect = this.pick();
    if (intersect && intersect.object !== this.selectedObject) {
      // Store original materials and apply pre-pick material
      intersect.object.traverse((child: THREE.Object3D) => {
        const mesh = child as IFCMesh;
        if (mesh.isMesh && !mesh.isSelected) {
          if (!mesh.originalMaterial) {
            mesh.originalMaterial = mesh.material;
          }
          mesh.material = this.prePick.material;
        }
      });
      this.prePick.object = intersect.object;
      this.container.style.cursor = "pointer";
    } else {
      this.container.style.cursor = "default";
    }
  }

  private async handleClick(event: MouseEvent) {
    const intersect = this.pick();

    // Reset previous selection
    if (this.selectedObject) {
      this.selectedObject.traverse((child: THREE.Object3D) => {
        const mesh = child as IFCMesh;
        if (mesh.isMesh) {
          if (mesh.originalMaterial) {
            mesh.material = mesh.originalMaterial;
            delete mesh.originalMaterial;
          }
          delete mesh.isSelected;
        }
      });
      this.selectedObject = null;
    }

    // Clear pre-pick state if it exists
    if (this.prePick.object) {
      this.prePick.object.traverse((child: THREE.Object3D) => {
        const mesh = child as IFCMesh;
        if (mesh.isMesh && mesh.originalMaterial && !mesh.isSelected) {
          mesh.material = mesh.originalMaterial;
          delete mesh.originalMaterial;
        }
      });
      this.prePick.object = null;
    }

    if (intersect) {
      const { object, modelID, expressID } = intersect;
      this.selectedObject = object;

      try {
        // Get properties
        const props = await this.ifcAPI.GetLine(modelID, expressID, true);
        console.log("Element properties:", props);

        // Get property sets
        const psets = await this.getPropertySets(modelID, expressID);
        console.log("Property sets:", psets);

        // Get type properties
        const typeProps = await this.getTypeProperties(modelID, props);
        console.log("Type properties:", typeProps);

        // Get materials
        const materials = await this.getMaterials(modelID, expressID);
        console.log("Materials:", materials);

        // Get spatial info
        const spatialInfo = await this.getSpatialInfo(modelID, props);
        console.log("Spatial info:", spatialInfo);

        // Get quantities
        const quantities = await this.getQuantities(modelID, expressID);
        console.log("Quantities:", quantities);

        // Display properties
        this.displayElementProperties(
          props.__proto__?.constructor?.name || "Unknown",
          props,
          psets,
          typeProps,
          materials,
          [], // classifications (not implemented)
          spatialInfo,
          quantities
        );

        // Highlight selected object
        object.traverse((child: THREE.Object3D) => {
          const mesh = child as IFCMesh;
          if (mesh.isMesh) {
            if (!mesh.originalMaterial) {
              mesh.originalMaterial = mesh.material;
            }
            mesh.material = this.selectedMaterial;
            mesh.isSelected = true;
          }
        });

        // Show properties panel
        const noSelection = document.querySelector(
          ".no-selection"
        ) as HTMLElement;
        const elementInfo = document.querySelector(
          ".element-info"
        ) as HTMLElement;
        const propertiesPanel = document.querySelector(
          ".properties-panel"
        ) as HTMLElement;

        if (noSelection) noSelection.style.display = "none";
        if (elementInfo) elementInfo.style.display = "block";
        if (propertiesPanel) propertiesPanel.classList.remove("collapsed");
      } catch (error) {
        console.error("Error getting element properties:", error);
      }
    } else {
      // Clear selection
      const noSelection = document.querySelector(
        ".no-selection"
      ) as HTMLElement;
      const elementInfo = document.querySelector(
        ".element-info"
      ) as HTMLElement;
      const propertiesPanel = document.querySelector(
        ".properties-panel"
      ) as HTMLElement;

      if (noSelection) noSelection.style.display = "block";
      if (elementInfo) elementInfo.style.display = "none";
      if (propertiesPanel) propertiesPanel.classList.add("collapsed");
    }
  }

  private pick() {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(
      Array.from(this.models.values()),
      true
    );

    if (intersects.length > 0) {
      const intersect = intersects[0];
      const object = intersect.object as IFCMesh;

      // Find the element group (parent with both modelID and expressID)
      let elementGroup = object;
      while (elementGroup && elementGroup.type !== "Scene") {
        if (
          elementGroup.modelID !== undefined &&
          elementGroup.expressID !== undefined
        ) {
          return {
            object: elementGroup,
            modelID: elementGroup.modelID,
            expressID: elementGroup.expressID,
          };
        }
        elementGroup = elementGroup.parent as IFCMesh;
      }
    }

    return null;
  }

  private async getPropertySets(modelID: number, expressID: number) {
    const psets = [];
    try {
      const lines = await this.ifcAPI.GetLineIDsWithType(
        modelID,
        IFCRELDEFINESBYPROPERTIES
      );

      for (let i = 0; i < lines.size(); i++) {
        const relID = lines.get(i);
        const rel = await this.ifcAPI.GetLine(modelID, relID);

        if (!rel || !rel.RelatedObjects) continue;

        // Check if this relationship references our element
        let foundElement = false;
        const relatedObjects = Array.isArray(rel.RelatedObjects)
          ? rel.RelatedObjects
          : [rel.RelatedObjects];

        for (const relID of relatedObjects) {
          if (
            relID &&
            typeof relID.value !== "undefined" &&
            relID.value === expressID
          ) {
            foundElement = true;
            break;
          }
        }

        if (foundElement && rel.RelatingPropertyDefinition) {
          try {
            const propertySet = await this.ifcAPI.GetLine(
              modelID,
              rel.RelatingPropertyDefinition.value,
              true
            );
            if (propertySet && propertySet.HasProperties) {
              psets.push(propertySet);
            }
          } catch (error) {
            console.warn("Error getting property set:", error);
          }
        }
      }
    } catch (error) {
      console.warn("Error getting property sets:", error);
    }
    return psets;
  }

  private async getTypeProperties(modelID: number, props: any) {
    const typeProps = [];
    if (props && props.IsTypedBy) {
      try {
        const typeRel = await this.ifcAPI.GetLine(
          modelID,
          props.IsTypedBy.value,
          true
        );
        if (typeRel && typeRel.RelatingType) {
          const type = await this.ifcAPI.GetLine(
            modelID,
            typeRel.RelatingType.value,
            true
          );
          if (type) {
            typeProps.push(type);
          }
        }
      } catch (error) {
        console.warn("Error getting type properties:", error);
      }
    }
    return typeProps;
  }

  private async getMaterials(modelID: number, expressID: number) {
    const materials = [];
    try {
      const materialLines = await this.ifcAPI.GetLineIDsWithType(
        modelID,
        IFCRELASSOCIATESMATERIAL
      );

      for (let i = 0; i < materialLines.size(); i++) {
        const relID = materialLines.get(i);
        const rel = await this.ifcAPI.GetLine(modelID, relID);

        if (!rel || !rel.RelatedObjects) continue;

        let foundElement = false;
        const relatedObjects = Array.isArray(rel.RelatedObjects)
          ? rel.RelatedObjects
          : [rel.RelatedObjects];

        for (const relID of relatedObjects) {
          if (
            relID &&
            typeof relID.value !== "undefined" &&
            relID.value === expressID
          ) {
            foundElement = true;
            break;
          }
        }

        if (foundElement && rel.RelatingMaterial) {
          try {
            const material = await this.ifcAPI.GetLine(
              modelID,
              rel.RelatingMaterial.value,
              true
            );
            if (material) {
              materials.push(material);
            }
          } catch (error) {
            console.warn("Error getting material:", error);
          }
        }
      }
    } catch (error) {
      console.warn("Error getting materials:", error);
    }
    return materials;
  }

  private async getSpatialInfo(modelID: number, props: any) {
    const spatialInfo = [];
    if (props && props.ContainedInStructure) {
      try {
        const containedRels = Array.isArray(props.ContainedInStructure)
          ? props.ContainedInStructure
          : [props.ContainedInStructure];

        for (const rel of containedRels) {
          if (rel && rel.value) {
            const spatial = await this.ifcAPI.GetLine(modelID, rel.value, true);
            if (spatial && spatial.RelatingStructure) {
              const structure = await this.ifcAPI.GetLine(
                modelID,
                spatial.RelatingStructure.value,
                true
              );
              if (structure) {
                spatialInfo.push(structure);
              }
            }
          }
        }
      } catch (error) {
        console.warn("Error getting spatial info:", error);
      }
    }
    return spatialInfo;
  }

  private async getQuantities(modelID: number, expressID: number) {
    const quantities = [];
    try {
      const quantityLines = await this.ifcAPI.GetLineIDsWithType(
        modelID,
        IFCRELDEFINESBYPROPERTIES
      );

      for (let i = 0; i < quantityLines.size(); i++) {
        const relID = quantityLines.get(i);
        const rel = await this.ifcAPI.GetLine(modelID, relID);

        if (!rel || !rel.RelatedObjects) continue;

        let foundElement = false;
        const relatedObjects = Array.isArray(rel.RelatedObjects)
          ? rel.RelatedObjects
          : [rel.RelatedObjects];

        for (const relID of relatedObjects) {
          if (
            relID &&
            typeof relID.value !== "undefined" &&
            relID.value === expressID
          ) {
            foundElement = true;
            break;
          }
        }

        if (foundElement && rel.RelatingPropertyDefinition) {
          try {
            const quantitySet = await this.ifcAPI.GetLine(
              modelID,
              rel.RelatingPropertyDefinition.value,
              true
            );
            if (quantitySet && quantitySet.Quantities) {
              quantities.push(quantitySet);
            }
          } catch (error) {
            console.warn("Error getting quantity set:", error);
          }
        }
      }
    } catch (error) {
      console.warn("Error getting quantity sets:", error);
    }
    return quantities;
  }

  private displayElementProperties(
    type: string,
    attributes: Record<string, any>,
    propertysets: IFCProperty[],
    typeProperties: any[],
    materials: IFCMaterial[],
    classifications: any[],
    spatialInfo: any[],
    quantities: IFCQuantitySet[]
  ) {
    // Get containers
    const noSelection = document.querySelector(
      `.${styles["no-selection"]}`
    ) as HTMLElement;
    const elementInfo = document.querySelector(
      `.${styles["element-info"]}`
    ) as HTMLElement;
    const attributesContainer = document.getElementById("element-attributes");
    const propertiesContainer = document.getElementById("element-properties");

    if (
      !noSelection ||
      !elementInfo ||
      !attributesContainer ||
      !propertiesContainer
    )
      return;

    // Show element info and hide no selection message
    noSelection.style.display = "none";
    elementInfo.style.display = "block";

    // Clear previous content
    attributesContainer.innerHTML = "";
    propertiesContainer.innerHTML = "";

    // Create attributes group
    const attributesGroup = document.createElement("div");
    attributesGroup.className = styles["property-group"];
    const attributesTitle = document.createElement("h4");
    attributesTitle.textContent = `${type} Attributes`;
    attributesGroup.appendChild(attributesTitle);

    // Add attributes
    Object.entries(attributes)
      .filter(([key]) => !key.startsWith("__"))
      .forEach(([key, value]) => {
        if (value && typeof value === "object" && value.value !== undefined) {
          this.addPropertyItem(attributesGroup, key, value.value);
        } else if (value !== null && value !== undefined) {
          this.addPropertyItem(attributesGroup, key, value);
        }
      });

    attributesContainer.appendChild(attributesGroup);

    // Add property sets
    if (propertysets && propertysets.length > 0) {
      const psetsGroup = document.createElement("div");
      psetsGroup.className = styles["property-group"];
      const psetsTitle = document.createElement("h4");
      psetsTitle.textContent = "Property Sets";
      psetsGroup.appendChild(psetsTitle);

      propertysets.forEach((pset: IFCProperty) => {
        if (!pset || !pset.HasProperties) return;

        const psetContainer = document.createElement("div");
        psetContainer.className = styles["property-set"];

        const psetHeader = document.createElement("div");
        psetHeader.className = styles["property-set-header"];
        psetHeader.innerHTML = `<div class="${styles["property-set-name"]}">${
          pset.Name?.value || "Unnamed Set"
        }</div>`;
        psetContainer.appendChild(psetHeader);

        const propList = document.createElement("div");
        propList.className = styles["property-list"];

        const properties = Array.isArray(pset.HasProperties)
          ? pset.HasProperties
          : [pset.HasProperties];

        properties.forEach((prop) => {
          if (!prop || !prop.Name) return;

          const name = prop.Name.value;
          let value = null;

          if (prop.NominalValue !== undefined) {
            value = prop.NominalValue.value;
          } else if (prop.Value !== undefined) {
            value = prop.Value.value;
          }

          if (name && value !== null) {
            this.addPropertyItem(propList, name, value);
          }
        });

        psetContainer.appendChild(propList);
        psetsGroup.appendChild(psetContainer);
      });

      propertiesContainer.appendChild(psetsGroup);
    }

    // Add quantities
    if (quantities && quantities.length > 0) {
      const quantityGroup = document.createElement("div");
      quantityGroup.className = styles["property-group"];
      const quantityTitle = document.createElement("h4");
      quantityTitle.textContent = "Quantities";
      quantityGroup.appendChild(quantityTitle);

      quantities.forEach((quantitySet: IFCQuantitySet) => {
        if (!quantitySet || !quantitySet.Quantities) return;

        const quantityContainer = document.createElement("div");
        quantityContainer.className = styles["property-set"];

        const header = document.createElement("div");
        header.className = styles["property-set-header"];
        header.innerHTML = `<div class="${styles["property-set-name"]}">${
          quantitySet.Name?.value || "Quantities"
        }</div>`;
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

            this.addPropertyItem(
              quantityList,
              name,
              unit ? `${formattedValue} ${unit}` : formattedValue
            );
          }
        });

        quantityContainer.appendChild(quantityList);
        quantityGroup.appendChild(quantityContainer);
      });

      propertiesContainer.appendChild(quantityGroup);
    }

    // Add materials
    if (materials && materials.length > 0) {
      const materialsGroup = document.createElement("div");
      materialsGroup.className = styles["property-group"];
      const materialsTitle = document.createElement("h4");
      materialsTitle.textContent = "Materials";
      materialsGroup.appendChild(materialsTitle);

      materials.forEach((material: IFCMaterial) => {
        if (!material.ForLayerSet) return;

        const materialContainer = document.createElement("div");
        materialContainer.className = styles["property-set"];

        const header = document.createElement("div");
        header.className = styles["property-set-header"];
        header.innerHTML = `<div class="${styles["property-set-name"]}">${
          material.ForLayerSet.LayerSetName?.value || "Material Set"
        }</div>`;
        materialContainer.appendChild(header);

        const layersContainer = document.createElement("div");
        layersContainer.className = styles["material-layers"];

        const layers = Array.isArray(material.ForLayerSet.MaterialLayers)
          ? material.ForLayerSet.MaterialLayers
          : [material.ForLayerSet.MaterialLayers];

        layers.forEach((layer: IFCMaterialLayer, index: number) => {
          const layerDiv = document.createElement("div");
          layerDiv.className = styles["material-layer"];

          const layerHeader = document.createElement("div");
          layerHeader.className = styles["material-layer-header"];
          layerHeader.innerHTML = `<h6>Layer ${index + 1}</h6>`;
          layerDiv.appendChild(layerHeader);

          if (layer.Material?.Name) {
            this.addPropertyItem(
              layerDiv,
              "Material",
              layer.Material.Name.value
            );
          }

          if (layer.LayerThickness) {
            this.addPropertyItem(
              layerDiv,
              "Thickness",
              `${(layer.LayerThickness.value * 1000).toFixed(0)} mm`
            );
          }

          layersContainer.appendChild(layerDiv);
        });

        materialContainer.appendChild(layersContainer);
        materialsGroup.appendChild(materialContainer);
      });

      propertiesContainer.appendChild(materialsGroup);
    }
  }

  private getPropertyValue(prop: any): any {
    if (prop === null || prop === undefined) return null;

    if (typeof prop === "object") {
      if (prop.value !== undefined) return prop.value;
      if (prop.Value !== undefined) return prop.Value;
      if (prop.NominalValue !== undefined)
        return this.getPropertyValue(prop.NominalValue);

      // Try to get the first non-internal property
      const values = Object.entries(prop)
        .filter(([key]) => !key.startsWith("_"))
        .map(([_, val]) => val);
      return values[0] || null;
    }

    return prop;
  }

  private addPropertyItem(container: HTMLElement, name: string, value: any) {
    if (value === undefined || value === null) return;

    // Format the value
    let displayValue = value;
    if (typeof value === "number") {
      displayValue = Number.isInteger(value) ? value : value.toFixed(2);
    } else if (Array.isArray(value)) {
      displayValue = value.join(", ");
    } else if (typeof value === "object") {
      displayValue = this.getPropertyValue(value);
    }

    const item = document.createElement("div");
    item.className = styles["property-item"];

    const nameDiv = document.createElement("div");
    nameDiv.className = styles["property-name"];
    nameDiv.textContent = name;

    const valueDiv = document.createElement("div");
    valueDiv.className = styles["property-value"];
    valueDiv.textContent = displayValue?.toString() || "";

    item.appendChild(nameDiv);
    item.appendChild(valueDiv);
    container.appendChild(item);
  }

  private deleteModel(modelId: number) {
    const model = this.models.get(modelId);
    if (model) {
      this.scene.remove(model);
      this.models.delete(modelId);
    }
  }

  private setupFloatingControls() {
    const controlsContainer = document.createElement("div");
    controlsContainer.className = styles["floating-controls"];

    // Hide/Show button
    const toggleVisibilityBtn = document.createElement("button");
    toggleVisibilityBtn.className = styles["control-btn"];
    toggleVisibilityBtn.innerHTML = '<i class="fas fa-eye-slash"></i>';
    toggleVisibilityBtn.title = "Hide Selected";
    toggleVisibilityBtn.addEventListener("click", () => {
      if (this.selectedObject) {
        this.selectedObject.visible = !this.selectedObject.visible;
        toggleVisibilityBtn.innerHTML = this.selectedObject.visible
          ? '<i class="fas fa-eye-slash"></i>'
          : '<i class="fas fa-eye"></i>';
      }
    });

    // Show All button
    const showAllBtn = document.createElement("button");
    showAllBtn.className = styles["control-btn"];
    showAllBtn.innerHTML = '<i class="fas fa-border-all"></i>';
    showAllBtn.title = "Show All";
    showAllBtn.addEventListener("click", () => {
      this.showAllElements();
    });

    // Refocus button
    const refocusBtn = document.createElement("button");
    refocusBtn.className = styles["control-btn"];
    refocusBtn.innerHTML = '<i class="fas fa-compress-arrows-alt"></i>';
    refocusBtn.title = "Refocus Camera";
    refocusBtn.addEventListener("click", () => {
      this.refocusCamera();
    });

    controlsContainer.appendChild(toggleVisibilityBtn);
    controlsContainer.appendChild(showAllBtn);
    controlsContainer.appendChild(refocusBtn);
    this.container.appendChild(controlsContainer);
  }

  private showAllElements() {
    this.scene.traverse((child: THREE.Object3D) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.Group) {
        child.visible = true;
      }
    });
  }

  private refocusCamera() {
    // Calculate bounding box of all visible objects
    const box = new THREE.Box3();
    let hasVisibleObjects = false;

    this.scene.traverse((child: THREE.Object3D) => {
      if (
        (child instanceof THREE.Mesh || child instanceof THREE.Group) &&
        child.visible
      ) {
        box.expandByObject(child);
        hasVisibleObjects = true;
      }
    });

    if (!hasVisibleObjects) return;

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    // Calculate camera position
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = this.camera.fov * (Math.PI / 180);
    let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
    cameraZ *= 1.5; // Add some padding

    // Set new camera position
    this.camera.position.set(
      center.x + cameraZ * 0.5,
      center.y + cameraZ * 0.5,
      center.z + cameraZ
    );
    this.controls.target.copy(center);
    this.camera.lookAt(center);
    this.controls.update();
  }
}

export default IFCViewer;
