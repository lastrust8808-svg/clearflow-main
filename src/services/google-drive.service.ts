import { AnalysisResult } from '../types/app.models';

class GoogleDriveService {

  private formatAnalysisResult(result: AnalysisResult, entityName: string): string {
    let content = `Clear-Flow Document Analysis\n`;
    content += `==============================\n\n`;
    content += `Entity: ${entityName}\n\n`;

    content += `Document Type: ${result.documentType || 'N/A'}\n`;
    content += `Detected Entity Name: ${result.entityName || 'N/A'}\n`;
    content += `EIN: ${result.ein || 'N/A'}\n\n`;

    content += `Summary:\n${result.summary || 'No summary available.'}\n\n`;
    
    if (result.keyDates?.length) {
      content += `Key Dates:\n`;
      result.keyDates.forEach(d => {
        content += `- ${d.label}: ${d.date}\n`;
      });
      content += '\n';
    }

    if (result.financialHighlights?.length) {
      content += `Financial Highlights:\n`;
      result.financialHighlights.forEach(h => {
        content += `- ${h.label}: ${h.value}\n`;
      });
      content += '\n';
    }

    return content;
  }

  async saveAnalysisAsDoc(accessToken: string, fileName: string, analysis: AnalysisResult, entityName: string): Promise<any> {
    if (!accessToken) {
      throw new Error('Not authorized for Google Drive.');
    }

    const formattedContent = this.formatAnalysisResult(analysis, entityName);

    const metadata = {
      name: fileName,
      mimeType: 'application/vnd.google-apps.document',
    };

    const boundary = '-------314159265358979323846';
    const delimiter = `\r\n--${boundary}\r\n`;
    const close_delim = `\r\n--${boundary}--`;

    const multipartRequestBody =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      'Content-Type: text/plain; charset=UTF-8\r\n\r\n' +
      formattedContent +
      close_delim;

    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartRequestBody,
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Google Drive API error:', error);
      throw new Error(`Failed to save file to Google Drive. Status: ${response.status}`);
    }

    return await response.json();
  }

  async findFileByName(accessToken: string, fileName: string): Promise<string | null> {
    const query = `name='${fileName}' and trashed=false`;
    const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&spaces=drive&fields=files(id)`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    if (!response.ok) throw new Error('Failed to search for file in Google Drive.');
    const data = await response.json();
    return data.files.length > 0 ? data.files[0].id : null;
  }

  async getFileContent(accessToken: string, fileId: string): Promise<any> {
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    if (!response.ok) throw new Error('Failed to read file from Google Drive.');
    return response.json();
  }

  async createFile(accessToken: string, fileName: string, content: string): Promise<string> {
    const metadata = { name: fileName, mimeType: 'application/json' };
    const boundary = '----boundary';
    const body = `--${boundary}\r\n` +
                 `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
                 `${JSON.stringify(metadata)}\r\n` +
                 `--${boundary}\r\n` +
                 `Content-Type: application/json\r\n\r\n` +
                 `${content}\r\n` +
                 `--${boundary}--`;
    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body
    });
    if (!response.ok) throw new Error('Failed to create file in Google Drive.');
    const data = await response.json();
    return data.id;
  }

  async updateFileContent(accessToken: string, fileId: string, content: string): Promise<void> {
    const response = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: content,
    });
    if (!response.ok) {
        const error = await response.json();
        console.error('Google Drive update error:', error);
        throw new Error('Failed to update file in Google Drive.');
    }
  }

  async findFileInAppDataFolder(accessToken: string, fileName: string): Promise<string | null> {
    const query = `name='${fileName}' and trashed=false`;
    const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&spaces=appDataFolder&fields=files(id)`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    if (!response.ok) throw new Error('Failed to search for file in Google Drive App Data folder.');
    const data = await response.json();
    return data.files.length > 0 ? data.files[0].id : null;
  }

  async createFileInAppDataFolder(accessToken: string, fileName: string, content: string): Promise<string> {
    const metadata = { name: fileName, mimeType: 'application/json', parents: ['appDataFolder'] };
    const boundary = '----boundary';
    const body = `--${boundary}\r\n` +
                 `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
                 `${JSON.stringify(metadata)}\r\n` +
                 `--${boundary}\r\n` +
                 `Content-Type: application/json\r\n\r\n` +
                 `${content}\r\n` +
                 `--${boundary}--`;
    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body
    });
    if (!response.ok) throw new Error('Failed to create file in Google Drive App Data folder.');
    const data = await response.json();
    return data.id;
  }
}

export const googleDriveService = new GoogleDriveService();