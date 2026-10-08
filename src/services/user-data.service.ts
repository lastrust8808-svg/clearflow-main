import { googleDriveService } from './google-drive.service';
import { AppData } from '../types/app.models';
import {
    getAccountPersistenceMode,
    loadAccountAppData,
    saveAccountAppData,
} from './accountPersistence.service';

const FILE_NAME = 'clear-flow-app-data.json';
const FILE_ID_INDEX_KEY = 'clear-flow-drive-file-id-index-v2';
const LEGACY_FILE_ID_KEY = 'clear-flow-drive-file-id';

function normalizeEmail(email?: string | null) {
    return email?.trim().toLowerCase() || '';
}

function buildGoogleAccountId(email?: string | null) {
    const normalizedEmail = normalizeEmail(email);
    return normalizedEmail ? `google:${normalizedEmail}` : '';
}

function getPersistentStorage() {
    return window.localStorage;
}

function getSessionStorageSafe() {
    return window.sessionStorage;
}

class UserDataService {
    private fileIdIndex: Record<string, string> = this.loadIndex();
    private activeEmail: string | null = null;

    private loadIndex() {
        try {
            const raw =
                getPersistentStorage().getItem(FILE_ID_INDEX_KEY) ||
                getSessionStorageSafe().getItem(FILE_ID_INDEX_KEY);
            if (raw) {
                return JSON.parse(raw) as Record<string, string>;
            }

            const legacy =
                getPersistentStorage().getItem(LEGACY_FILE_ID_KEY) ||
                getSessionStorageSafe().getItem(LEGACY_FILE_ID_KEY);
            if (legacy) {
                return { __legacy__: legacy };
            }
        } catch {
            // ignore session cache parse failures
        }

        return {};
    }

    private saveIndex() {
        const serialized = JSON.stringify(this.fileIdIndex);
        getPersistentStorage().setItem(FILE_ID_INDEX_KEY, serialized);
        getSessionStorageSafe().setItem(FILE_ID_INDEX_KEY, serialized);
    }

    private getScopedFileId(email?: string | null) {
        const normalizedEmail = normalizeEmail(email) || this.activeEmail || '';
        if (normalizedEmail && this.fileIdIndex[normalizedEmail]) {
            return this.fileIdIndex[normalizedEmail];
        }

        return normalizedEmail ? null : this.fileIdIndex.__legacy__ || null;
    }

    private setScopedFileId(email: string | null | undefined, fileId: string) {
        const normalizedEmail = normalizeEmail(email) || this.activeEmail || '__legacy__';
        this.fileIdIndex[normalizedEmail] = fileId;
        this.saveIndex();
    }

    setActiveUserEmail(email?: string | null): void {
        this.activeEmail = normalizeEmail(email) || null;
    }

    async loadUserData(accessToken: string, email?: string): Promise<AppData | null> {
        try {
            const scopedEmail = normalizeEmail(email) || this.activeEmail || null;
            const googleAccountId = buildGoogleAccountId(scopedEmail);

            if (googleAccountId) {
                const persistenceMode = await getAccountPersistenceMode(googleAccountId);

                if (persistenceMode === 'owner_database') {
                    try {
                        const durableData = await loadAccountAppData(googleAccountId);
                        if (durableData) {
                            return durableData;
                        }
                    } catch (error) {
                        console.warn(
                            'Owner database workspace was not available yet. Falling back to Google Drive seed.',
                            error
                        );
                    }
                }
            }

            let fileId = this.getScopedFileId(scopedEmail);

            if (!fileId) {
                fileId = await googleDriveService.findFileInAppDataFolder(accessToken, FILE_NAME);
                if (fileId) {
                    this.setScopedFileId(scopedEmail, fileId);
                }
            }

            if (!fileId) {
                return null; // File doesn't exist, new user.
            }

            const driveData = await googleDriveService.getFileContent(accessToken, fileId);

            if (googleAccountId) {
                const persistenceMode = await getAccountPersistenceMode(googleAccountId);
                if (persistenceMode === 'owner_database') {
                    void saveAccountAppData(googleAccountId, driveData).catch((error) => {
                        console.warn('Failed to seed owner database from Google Drive.', error);
                    });
                }
            }

            return driveData;
        } catch (error) {
            console.error("Error loading user data, treating as new user.", error);
            this.clearCache(email);
            return null;
        }
    }

    async saveUserData(accessToken: string, data: AppData): Promise<void> {
        const content = JSON.stringify(data, null, 2);
        const scopedEmail = normalizeEmail(data.user.email) || this.activeEmail || null;
        const googleAccountId = buildGoogleAccountId(scopedEmail);

        if (googleAccountId) {
            const persistenceMode = await getAccountPersistenceMode(googleAccountId);
            if (persistenceMode === 'owner_database') {
                await saveAccountAppData(googleAccountId, data);
            }
        }

        let fileId = this.getScopedFileId(scopedEmail);

        if (fileId) {
            await googleDriveService.updateFileContent(accessToken, fileId, content);
        } else {
            const newFileId = await googleDriveService.createFileInAppDataFolder(accessToken, FILE_NAME, content);
            fileId = newFileId;
        }

        this.setScopedFileId(scopedEmail, fileId);
    }
    
    clearCache(email?: string): void {
        const normalizedEmail = normalizeEmail(email);
        if (normalizedEmail) {
            delete this.fileIdIndex[normalizedEmail];
        } else {
            this.fileIdIndex = {};
        }
        getPersistentStorage().removeItem(LEGACY_FILE_ID_KEY);
        getPersistentStorage().removeItem(FILE_ID_INDEX_KEY);
        getSessionStorageSafe().removeItem(LEGACY_FILE_ID_KEY);
        getSessionStorageSafe().removeItem(FILE_ID_INDEX_KEY);
        this.saveIndex();
    }
}

export const userDataService = new UserDataService();
