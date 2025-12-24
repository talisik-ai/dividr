import { startupManager } from '@/frontend/utils/startupManager';
import {
  isValidProject,
  PROJECT_DB_NAME,
  PROJECT_DB_VERSION,
  PROJECT_STORE_NAME,
  PROJECT_VERSION,
  ProjectData,
  ProjectExportData,
  ProjectSizeInfo,
  ProjectSummary,
  projectToSummary,
} from '@/shared/types/project.types';

/**
 * Project Service
 *
 * Handles all project-related database operations with:
 * - Lazy initialization
 * - Progressive data loading
 * - Performance tracking
 * - Non-blocking operations
 */
export class ProjectService {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;
  private isInitializing = false;

  /**
   * Initialize database connection (lazy, non-blocking)
   */
  async init(): Promise<void> {
    // Return existing initialization promise if already initializing
    if (this.initPromise) {
      return this.initPromise;
    }

    // Already initialized
    if (this.db) {
      return Promise.resolve();
    }

    // Start initialization
    this.isInitializing = true;
    startupManager.logStage('indexeddb-init');

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(PROJECT_DB_NAME, PROJECT_DB_VERSION);

      request.onerror = () => {
        this.isInitializing = false;
        this.initPromise = null;
        reject(new Error('Failed to open IndexedDB'));
      };

      request.onsuccess = () => {
        this.db = request.result;
        this.isInitializing = false;
        startupManager.logStage('indexeddb-ready');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create the projects object store
        if (!db.objectStoreNames.contains(PROJECT_STORE_NAME)) {
          const store = db.createObjectStore(PROJECT_STORE_NAME, {
            keyPath: 'id',
          });

          // Create indices for better querying
          store.createIndex('title', 'metadata.title', { unique: false });
          store.createIndex('createdAt', 'metadata.createdAt', {
            unique: false,
          });
          store.createIndex('updatedAt', 'metadata.updatedAt', {
            unique: false,
          });
          store.createIndex('lastOpenedAt', 'metadata.lastOpenedAt', {
            unique: false,
          });
        }
      };
    });

    return this.initPromise;
  }

  /**
   * Ensure database is ready (with timeout)
   */
  private async ensureDB(): Promise<IDBDatabase> {
    if (!this.db) {
      await this.init();
    }
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    return this.db;
  }

  /**
   * Execute a transaction with error handling
   */
  private async executeTransaction<T>(
    mode: IDBTransactionMode,
    callback: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const db = await this.ensureDB();
    const transaction = db.transaction([PROJECT_STORE_NAME], mode);
    const store = transaction.objectStore(PROJECT_STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = callback(store);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);

      transaction.onerror = () => reject(transaction.error);
    });
  }

  /**
   * Calculate size information from project data
   * Uses unique media sources to avoid double-counting the same file
   */
  private calculateProjectSizeFromData(project: ProjectData): ProjectSizeInfo {
    const projectFileSize = new Blob([JSON.stringify(project)]).size;
    const mediaLibrary = project.videoEditor.mediaLibrary || [];

    // Use Map to dedupe by source path (avoid double-counting same file)
    const uniqueSources = new Map<string, number>();
    let missingCount = 0;

    for (const media of mediaLibrary) {
      const sourceKey = media.source || media.id;
      if (!uniqueSources.has(sourceKey)) {
        uniqueSources.set(sourceKey, media.size || 0);
        if (!media.size || media.size === 0) {
          missingCount++;
        }
      }
    }

    let totalMediaSize = 0;
    uniqueSources.forEach((size) => {
      totalMediaSize += size;
    });

    return {
      projectFileSize,
      totalMediaSize,
      mediaCount: uniqueSources.size,
      missingMediaCount: missingCount,
      status: missingCount > 0 ? 'partial' : 'complete',
    };
  }

  /**
   * Get all projects (optimized with lazy loading)
   * Returns summaries with size information for performance
   */
  async getAllProjects(): Promise<ProjectSummary[]> {
    try {
      const projects = await this.executeTransaction('readonly', (store) =>
        store.getAll(),
      );

      return projects
        .filter(isValidProject)
        .map((project) => ({
          ...projectToSummary(project),
          sizeInfo: this.calculateProjectSizeFromData(project),
        }))
        .sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        );
    } catch (error) {
      return [];
    }
  }

  /**
   * Get project count without loading full data
   */
  async getProjectCount(): Promise<number> {
    try {
      const db = await this.ensureDB();
      const transaction = db.transaction([PROJECT_STORE_NAME], 'readonly');
      const store = transaction.objectStore(PROJECT_STORE_NAME);

      return new Promise((resolve, reject) => {
        const request = store.count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      return 0;
    }
  }

  /**
   * Get recent projects (optimized query)
   * Returns summaries with size information
   */
  async getRecentProjects(limit = 5): Promise<ProjectSummary[]> {
    try {
      const db = await this.ensureDB();
      const transaction = db.transaction([PROJECT_STORE_NAME], 'readonly');
      const store = transaction.objectStore(PROJECT_STORE_NAME);
      const index = store.index('lastOpenedAt');

      return new Promise((resolve) => {
        const request = index.openCursor(null, 'prev');
        const results: ProjectSummary[] = [];

        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest).result;

          if (cursor && results.length < limit) {
            const project = cursor.value;
            if (isValidProject(project) && project.metadata.lastOpenedAt) {
              results.push({
                ...projectToSummary(project),
                sizeInfo: this.calculateProjectSizeFromData(project),
              });
            }
            cursor.continue();
          } else {
            resolve(results);
          }
        };

        request.onerror = () => {
          resolve([]);
        };
      });
    } catch (error) {
      return [];
    }
  }

  // Create a new project
  async createProject(project: ProjectData): Promise<void> {
    await this.executeTransaction('readwrite', (store) => store.add(project));
  }

  // Get a specific project by ID
  async getProject(id: string): Promise<ProjectData | null> {
    const project = await this.executeTransaction('readonly', (store) =>
      store.get(id),
    );
    return project && isValidProject(project) ? project : null;
  }

  // Update an existing project
  async updateProject(project: ProjectData): Promise<void> {
    const updatedProject = {
      ...project,
      metadata: {
        ...project.metadata,
        updatedAt: new Date().toISOString(),
      },
    };

    await this.executeTransaction('readwrite', (store) =>
      store.put(updatedProject),
    );
  }

  // Mark project as opened (updates lastOpenedAt)
  async markProjectOpened(id: string): Promise<void> {
    const project = await this.getProject(id);
    if (!project) {
      throw new Error('Project not found');
    }

    const updatedProject = {
      ...project,
      metadata: {
        ...project.metadata,
        lastOpenedAt: new Date().toISOString(),
      },
    };

    await this.updateProject(updatedProject);
  }

  // Delete a project
  async deleteProject(id: string): Promise<void> {
    await this.executeTransaction('readwrite', (store) => store.delete(id));
  }

  // Search projects by title
  async searchProjects(query: string): Promise<ProjectSummary[]> {
    const allProjects = await this.getAllProjects();
    const lowercaseQuery = query.toLowerCase();

    return allProjects.filter(
      (project) =>
        project.title.toLowerCase().includes(lowercaseQuery) ||
        project.description.toLowerCase().includes(lowercaseQuery),
    );
  }

  // Export project to file
  async exportProject(id: string): Promise<ProjectExportData> {
    const project = await this.getProject(id);
    if (!project) {
      throw new Error('Project not found');
    }

    return {
      metadata: project.metadata,
      videoEditor: project.videoEditor,
      version: project.version,
      exportedAt: new Date().toISOString(),
    };
  }

  // Import project from file data
  async importProject(
    exportData: ProjectExportData,
    newTitle?: string,
  ): Promise<string> {
    const projectId = crypto.randomUUID();
    const now = new Date().toISOString();

    const project: ProjectData = {
      id: projectId,
      metadata: {
        ...exportData.metadata,
        title: newTitle || `${exportData.metadata.title} (Imported)`,
        createdAt: now,
        updatedAt: now,
        lastOpenedAt: undefined,
      },
      videoEditor: exportData.videoEditor,
      version: PROJECT_VERSION,
    };

    await this.createProject(project);
    return projectId;
  }

  // Duplicate a project
  async duplicateProject(id: string, newTitle?: string): Promise<string> {
    const originalProject = await this.getProject(id);
    if (!originalProject) {
      throw new Error('Project not found');
    }

    const newProjectId = crypto.randomUUID();
    const now = new Date().toISOString();

    const duplicatedProject: ProjectData = {
      ...originalProject,
      id: newProjectId,
      metadata: {
        ...originalProject.metadata,
        title: newTitle || `${originalProject.metadata.title} Copy`,
        createdAt: now,
        updatedAt: now,
        lastOpenedAt: undefined,
      },
    };

    await this.createProject(duplicatedProject);
    return newProjectId;
  }

  // Clear all projects (for testing/reset)
  async clearAllProjects(): Promise<void> {
    await this.executeTransaction('readwrite', (store) => store.clear());
  }

  // Get database info
  async getDatabaseInfo(): Promise<{
    projectCount: number;
    totalSize: number;
  }> {
    const db = await this.ensureDB();
    const transaction = db.transaction([PROJECT_STORE_NAME], 'readonly');
    const store = transaction.objectStore(PROJECT_STORE_NAME);

    return new Promise((resolve, reject) => {
      const countRequest = store.count();
      const getAllRequest = store.getAll();

      let projectCount = 0;
      let totalSize = 0;

      countRequest.onsuccess = () => {
        projectCount = countRequest.result;
      };

      getAllRequest.onsuccess = () => {
        const projects = getAllRequest.result;
        totalSize = new Blob([JSON.stringify(projects)]).size;
        resolve({ projectCount, totalSize });
      };

      countRequest.onerror = getAllRequest.onerror = () => {
        reject(new Error('Failed to get database info'));
      };
    });
  }

  /**
   * Check if database is ready (non-blocking)
   */
  isReady(): boolean {
    return this.db !== null;
  }

  /**
   * Close database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

// Singleton instance
export const projectService = new ProjectService();
