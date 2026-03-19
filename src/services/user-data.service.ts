import { googleDriveService } from './google-drive.service';
import { AppData } from '../types/app.models';

const FILE_NAME = 'clear-flow-app-data.json';
const FILE_ID_KEY = 'clear-flow-drive-file-id';

class UserDataService {
    private fileId: string | null = sessionStorage.getItem(FILE_ID_KEY);

    async loadUserData(accessToken: string): Promise<AppData | null> {
        if (!this.fileId) {
            this.fileId = await googleDriveService.findFileInAppDataFolder(accessToken, FILE_NAME);
            if (this.fileId) {
                sessionStorage.setItem(FILE_ID_KEY, this.fileId);
            }
        }

        if (!this.fileId) {
            return null; // File doesn't exist, new user.
        }

        try {
            return await googleDriveService.getFileContent(accessToken, this.fileId);
        } catch (error) {
            console.error("Error loading user data, treating as new user.", error);
            this.clearCache();
            return null;
        }
    }

    async saveUserData(accessToken: string, data: AppData): Promise<void> {
        const content = JSON.stringify(data, null, 2);

        if (this.fileId) {
            await googleDriveService.updateFileContent(accessToken, this.fileId, content);
        } else {
            const newFileId = await googleDriveService.createFileInAppDataFolder(accessToken, FILE_NAME, content);
            this.fileId = newFileId;
            sessionStorage.setItem(FILE_ID_KEY, newFileId);
        }
    }
    
    clearCache(): void {
        this.fileId = null;
        sessionStorage.removeItem(FILE_ID_KEY);
    }
}

export const userDataService = new UserDataService();