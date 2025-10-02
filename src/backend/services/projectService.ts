import {
  isValidProject,
  ProjectData,
  ProjectExportData,
  ProjectSummary,
  projectToSummary,
  PROJECT_DB_NAME,
  PROJECT_DB_VERSION,
  PROJECT_STORE_NAME,
  PROJECT_VERSION,
} from '@/shared/types/project.types';

export class ProjectService {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    if (this.db) return;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(PROJECT_DB_NAME, PROJECT_DB_VERSION);

      request.onerror = () => {
        reject(new Error('Failed to open IndexedDB'));
      };

      request.onsuccess = () => {
        this.db = request.result;
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
  }

  private async ensureDB(): Promise<IDBDatabase> {
    if (!this.db) {
      await this.init();
    }
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    return this.db;
  }

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

  // Create a new project
  async createProject(project: ProjectData): Promise<void> {
    await this.executeTransaction('readwrite', (store) => store.add(project));
  }

  // Get all projects (returns summaries for performance)
  async getAllProjects(): Promise<ProjectSummary[]> {
    const projects = await this.executeTransaction('readonly', (store) =>
      store.getAll(),
    );
    return projects
      .filter(isValidProject)
      .map(projectToSummary)
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
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
    // Update the updatedAt timestamp
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

  // Get recently opened projects
  async getRecentProjects(limit = 5): Promise<ProjectSummary[]> {
    const allProjects = await this.getAllProjects();

    return allProjects
      .filter((project) => project.lastOpenedAt)
      .sort((a, b) => {
        const aTime = a.lastOpenedAt ? new Date(a.lastOpenedAt).getTime() : 0;
        const bTime = b.lastOpenedAt ? new Date(b.lastOpenedAt).getTime() : 0;
        return bTime - aTime;
      })
      .slice(0, limit);
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
        lastOpenedAt: undefined, // Reset last opened
      },
      videoEditor: exportData.videoEditor,
      version: PROJECT_VERSION, // Update to current version
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
}

// Singleton instance
export const projectService = new ProjectService();
